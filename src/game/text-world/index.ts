import type { TextRoom } from "../schemas/text-world";
import type { ActionChoice, ContentRegistry, GameAction, GameState, SceneCard } from "../schemas";
import { convenienceActions, performConvenienceAction } from "./convenience";
import { buildRuntimeRegistry } from "../runtime-registry";
import { applySystemNote } from "../rules";
import { setSystemNote } from "../system-note";
import { createSubwayTextWorld, worldRooms } from "./world";
import { worldOptions } from "./choices";
import { choiceNarrative, choiceNarrativeFields, entryActionLead, nextNarrativeChoices, storeChoiceNarratives } from "./choice-narrative";
import { recordEvent, resolveWorldActions } from "./engine";
import { directNarrative, rememberNarration } from "./perception";
import { fallbackNarration, narrateTextWorld, validateRenderedNarration, type TextWorldNarrator } from "./narrator";

export function textWorldEntryActions(state: GameState): ActionChoice[] {
  if (state.location !== "subway" || state.textWorld?.active || state.subwayExpedition.active ||
    state.npcDialogue.active || state.activeStockNodeId || state.isGameOver || state.stageClear) return [];
  return [{ id: "text-world:enter", label: "옆쪽 역무실을 둘러본다", outcomeHint: "탐색과 물건 수집", showOutcomeHint: true,
    postChoiceNarrative: [entryActionLead], postChoiceNarrativeSource: "template",
    isAvailable: true, loading: { durationMs: 500, transitionType: "activity" }, action: { type: "text_world", command: "enter" } }];
}

export function currentTextWorld(state: GameState) {
  return state.location === "subway" ? state.textWorld : state.locationTextWorlds[state.location] ?? null;
}

export function textWorldActions(state: GameState, registry = buildRuntimeRegistry(state)): ActionChoice[] {
  if (state.location === "convenience") return convenienceActions(state, registry);
  const world = state.textWorld;
  if (!world?.active) return [];
  return worldOptions(world, state).map(option => ({
    id: "text-world:" + world.revision + ":" + option.id, label: option.label,
    outcomeHint: option.hint, showOutcomeHint: Boolean(option.hint), isAvailable: true,
    loading: { durationMs: 500, transitionType: "activity" },
    ...choiceNarrativeFields(world, option),
    action: { type: "text_world", command: "choose", optionId: option.id, revision: world.revision },
  }));
}

export function textWorldScene(state: GameState, registry = buildRuntimeRegistry(state)): SceneCard | null {
  const world = currentTextWorld(state);
  if (!world?.active) return null;
  return { id: "text-world:" + state.location + ":" + world.sceneRevision, locationId: state.location, title: worldRooms(world)[world.player.zone].name,
    paragraphs: world.lastParagraphs, choices: textWorldActions(state, registry).map(({ action, ...choice }) => ({ ...choice, serverActionHint: action })),
    materialIds: { locationIds: [state.location], personIds: [], itemIds: [] }, source: world.source, generatedAt: new Date(0).toISOString() };
}

export async function performTextWorldAction(
  state: GameState, action: Extract<GameAction, { type: "text_world" }>, gameId: string,
  narrator: TextWorldNarrator = narrateTextWorld, rooms?: TextRoom[], registry: ContentRegistry = buildRuntimeRegistry(state),
) {
  if (state.location === "convenience") return performConvenienceAction(state, action, registry, narrator, gameId);
  if (state.location !== "subway" || state.subwayExpedition.active || state.npcDialogue.active ||
    state.isGameOver || state.stageClear) throw new Error("지금은 역무실을 탐색할 수 없습니다.");
  const before = structuredClone(state);
  let alreadyDisplayed = [entryActionLead];
  if (action.command === "enter") {
    if (!textWorldEntryActions(state).length) throw new Error("현재 탐색이나 행동을 먼저 마쳐 주세요.");
    state.textWorld ??= createSubwayTextWorld(rooms);
    state.textWorld.active = true;
    state.textWorld.events = [];
    state.textWorld.player = { ...state.textWorld.player, zone: "office", near: null, position: "entrance", facing: "far-door", posture: "standing" };
    state.textWorld.lastIntent = { id: "enter", label: "역무실로 들어선다", importance: "major" };
    recordEvent(state.textWorld, { type: "ENTER", targetId: "office", before: { zone: "concourse" }, after: { zone: "office" } });
  } else {
    const world = state.textWorld;
    if (!world?.active) throw new Error("먼저 역무실 탐색을 시작해 주세요.");
    if (action.revision !== world.revision) throw new Error("상황이 바뀌었습니다. 현재 선택지를 다시 골라 주세요.");
    const option = worldOptions(world, state).find(choice => choice.id === action.optionId);
    if (!option) throw new Error("현재 상황에서는 선택할 수 없는 행동입니다.");
    alreadyDisplayed = [choiceNarrative(world, option).text];
    world.events = [];
    world.lastIntent = { id: option.id, label: option.label, importance: option.importance };
    const result = resolveWorldActions(world, state, option.actions);
    applySystemNote(before, state);
    setSystemNote(state, [...state.systemNoteEntries.filter(entry => entry.type !== "time"), { type: "text", text: "+" + result.elapsedSeconds + "초", tone: "neutral" }]);
  }
  const world = state.textWorld!;
  world.revision++;
  world.sceneRevision++;
  if (!world.active) return;
  const context = directNarrative(world);
  context.alreadyDisplayed = alreadyDisplayed;
  context.nextChoices = nextNarrativeChoices(world, worldOptions(world, state));
  let rendered;
  try {
    // The injected boundary receives a detached perception-only object.
    rendered = await narrator(structuredClone(context), gameId);
    rendered = validateRenderedNarration(context, rendered) ?? fallbackNarration(context);
  } catch {
    rendered = fallbackNarration(context);
  }
  storeChoiceNarratives(world, context, rendered.choiceNarratives);
  world.lastParagraphs = rendered.paragraphs;
  world.source = rendered.source;
  rememberNarration(world, context, rendered.usedFactIds, rendered.paragraphs);
  if (action.command === "enter") setSystemNote(state, []);
}
