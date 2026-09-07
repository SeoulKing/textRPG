import { hasSubwayStockBinding, syncSubwayStockWorld } from "./subway-stock";
import { buildNpcDialogueStartAction } from "../npc-dialogue";
import { runtimeSocialProfile } from "../npc-social";
import { upgradeSubwayResidents } from "./definitions";
import { synchronizeWorldActors, nearbyWorldNpc } from "./observers";
import type { TextRoom } from "../schemas/text-world";
import type { ActionChoice, ContentRegistry, GameAction, GameState, SceneCard } from "../schemas";
import { availableConvenienceOptions, convenienceActions, performConvenienceAction } from "./convenience";
import { availableLocationWorldOptions, hasLocationWorld, locationWorldOptions, locationWorldActions, locationWorldEntryActions, performLocationWorldAction } from "./location-world";
import { buildRuntimeRegistry } from "../runtime-registry";
import { syncScene } from "../rules";
import { setSystemNote } from "../system-note";
import { createSubwayTextWorld, entityDetails, visibleEntities, worldRooms } from "./world";
import { transferCarriedEntities } from "./inventory";
import { availableWorldOptions } from "./choices";
import { describeChoice } from "./choice-director";
import { choiceLabelFields, nextNarrativeChoices, storeChoiceLabels } from "./choice-labels";
import { recordEvent } from "./engine";
import { directNarrative, rememberNarration } from "./perception";
import { fallbackNarration, narrateTextWorld, renderNarration, type TextWorldNarrator } from "./narrator";

export function textWorldEntryActions(state: GameState, registry: ContentRegistry = buildRuntimeRegistry(state)): ActionChoice[] {
  if (state.location !== "subway") return locationWorldEntryActions(state, registry);
  if (state.location !== "subway" || state.textWorld?.active || state.subwayExpedition.active ||
    state.npcDialogue.active || state.activeStockNodeId || state.isGameOver || state.stageClear) return [];
  return [{ id: "text-world:enter", label: "옆쪽 역무실을 둘러본다", outcomeHint: "탐색과 물건 수집", showOutcomeHint: true,
    choiceThought: "안쪽에는 뭐가 남아 있을까.", choiceThoughtSource: "template",
    isAvailable: true, loading: { durationMs: 500, transitionType: "activity" }, action: { type: "text_world", command: "enter" } }];
}

export function currentTextWorld(state: GameState) {
  return state.location === "subway" ? state.textWorld : state.locationTextWorlds[state.location] ?? null;
}

/** A read-only view of everything the player can deliberately try, beyond the director's suggestions. */
export function explorationInteractions(state: GameState, registry = buildRuntimeRegistry(state)) {
  const world = currentTextWorld(state);
  if (!world?.active || state.isGameOver || state.stageClear || state.npcDialogue.active) return null;
  const candidates = state.location === "convenience" ? availableConvenienceOptions(state, registry)
    : (state.location === "subway" || hasLocationWorld(state, registry)) ? availableLocationWorldOptions(state, registry) : availableWorldOptions(world, state);
  const visible = visibleEntities(world).sort((a, b) => a.id.localeCompare(b.id));
  const targets = visible.map(entity => ({ id: entity.id, name: entity.name,
    placement: entity.components.position.zone === "player" ? "지니고 있는 물건" : entityDetails(world, entity).placement,
    observed: Boolean(world.observations[entity.id]?.inspected || world.observations[entity.id]?.stages.includes("interior")),
    actions: [] as ActionChoice[] }));
  const generalActions: ActionChoice[] = [];
  for (const option of [...candidates].sort((a, b) => a.id.localeCompare(b.id))) {
    const described = describeChoice(option, world), last = option.actions?.at(-1);
    const targetId = last?.type === "PUT" ? last.destination : described.targetId;
    const choice: ActionChoice = { id: "interaction:" + world.revision + ":" + option.id,
      ...choiceLabelFields(world, { ...option, ...described }), outcomeHint: option.hint, showOutcomeHint: true, isAvailable: true,
      loading: "loading" in option ? option.loading : { durationMs: 500, transitionType: "activity" },
      action: { type: "text_world", command: "choose", optionId: option.id, revision: world.revision } };
    const target = targets.find(t => t.id === targetId);
    if (target) target.actions.push(choice);
    else generalActions.push(choice);
  }
  for (const target of targets) {
    const actor = world.entities[target.id];
    if (!actor.components.actor || !nearbyWorldNpc(world, actor.components.actor.npcId)) continue;
    const profile = runtimeSocialProfile(actor.components.actor.npcId, registry);
    if (profile?.homeLocationId === state.location) target.actions.unshift(buildNpcDialogueStartAction(profile));
  }
  return { revision: world.revision, roomName: worldRooms(world)[world.player.zone].name, targets, generalActions };
}

function coreTextWorldActions(state: GameState, registry = buildRuntimeRegistry(state)): ActionChoice[] {
  if (state.location === "convenience") return convenienceActions(state, registry);
  if (state.location === "subway" || hasLocationWorld(state, registry)) return locationWorldActions(state, registry);
  return [];
}

export function textWorldActions(state: GameState, registry: ContentRegistry = buildRuntimeRegistry(state)): ActionChoice[] {
  if (state.npcDialogue.active) return [];
  const choices = coreTextWorldActions(state, registry), world = currentTextWorld(state), actor = nearbyWorldNpc(world, world?.entities[world.player.focusEntityId ?? ""]?.components.actor?.npcId);
  const profile = actor && runtimeSocialProfile(actor.components.actor!.npcId, registry);
  return profile?.homeLocationId === state.location && world?.player.focusEntityId === actor!.id ? [buildNpcDialogueStartAction(profile), ...choices.slice(0,4)] : choices;
}
export function textWorldScene(state: GameState, registry = buildRuntimeRegistry(state)): SceneCard | null {
  if (state.npcDialogue.active) return null;
  const world = currentTextWorld(state);
  if (!world?.active) return null;
  return { id: "text-world:" + state.location + ":" + world.sceneRevision, locationId: state.location, title: worldRooms(world)[world.player.zone].name,
    paragraphs: world.lastParagraphs, paragraphSources: world.lastParagraphSources, choices: textWorldActions(state, registry).map(({ action, ...choice }) => ({ ...choice, serverActionHint: action })),
    materialIds: { locationIds: [state.location], personIds: [], itemIds: [] }, source: world.source, generatedAt: new Date(0).toISOString() };
}

/** Old stock-menu saves resume in place without a new generation or replenishing stock. */
export function ensureSubwayStockWorld(state: GameState, registry: ContentRegistry) {
  if (state.location !== "subway" || !hasSubwayStockBinding(registry) || state.subwayExpedition.active || state.npcDialogue.active || state.isGameOver || state.stageClear) return;
  const resume = state.activeStockNodeId === "subway_signal_box";
  if (!state.textWorld && !resume) return;
  if (resume && !state.discoveredStockNodeIds.includes("subway_signal_box")) state.discoveredStockNodeIds.push("subway_signal_box");
  const world = state.textWorld ??= createSubwayTextWorld(registry.textRooms);
  const added = syncSubwayStockWorld(state, registry);
  if (!resume) { if (added) world.revision++; return; }
  const host = Object.values(world.entities).find(e => e.components.stockNode?.nodeId === "subway_signal_box" && worldRooms(world)[e.components.position.zone]);
  if (!host) return;
  upgradeSubwayResidents(world);
  synchronizeWorldActors(world, state, registry);
  world.active = true;
  transferCarriedEntities(state, world);
  world.events = [];
  world.player = { ...world.player, zone: host.components.position.zone, near: host.id, position: host.details?.anchor ?? host.id,
    facing: host.id, posture: host.details?.posture ?? "standing", relation: "near", coverId: null, focusEntityId: host.id, manipulating: false };
  world.lastIntent = { id: "resume", label: "확인하던 신호함 앞에서 탐색을 이어간다", importance: "minor" };
  recordEvent(world, { type: "ENTER", targetId: world.player.zone, before: {}, after: { zone: world.player.zone, entryText: "확인하던 신호함 앞에서 탐색을 이어간다." } });
  state.activeStockNodeId = null;
  syncScene(state);
  world.revision++;
  world.sceneRevision++;
  const context = directNarrative(world);
  context.nextChoices = nextNarrativeChoices(world, locationWorldOptions(state, registry));
  const rendered = fallbackNarration(context);
  storeChoiceLabels(world, context, rendered.choiceLabels);
  world.lastParagraphs = rendered.paragraphs;
  world.lastParagraphSources = rendered.paragraphSources;
  world.source = rendered.source;
  rememberNarration(world, context, rendered.usedFactIds, rendered.paragraphs);
}

export async function performTextWorldAction(
  state: GameState, action: Extract<GameAction, { type: "text_world" }>, gameId: string,
  narrator: TextWorldNarrator = narrateTextWorld, rooms?: TextRoom[], registry: ContentRegistry = buildRuntimeRegistry(state),
) {
  if (state.location === "convenience") return performConvenienceAction(state, action, registry, narrator, gameId);
  if (hasLocationWorld(state, registry)) return performLocationWorldAction(state, action, registry, narrator, gameId);
  if (state.location !== "subway" || state.subwayExpedition.active || state.npcDialogue.active ||
    state.isGameOver || state.stageClear) throw new Error("지금은 역무실을 탐색할 수 없습니다.");
  if (action.command === "enter") {
    if (!textWorldEntryActions(state).length) throw new Error("현재 탐색이나 행동을 먼저 마쳐 주세요.");
    state.textWorld ??= createSubwayTextWorld(rooms ?? registry.textRooms);
    syncSubwayStockWorld(state, registry);
    upgradeSubwayResidents(state.textWorld);
    synchronizeWorldActors(state.textWorld, state, registry);
    state.textWorld.active = true;
    transferCarriedEntities(state, state.textWorld);
    state.textWorld.events = [];
    state.textWorld.player = { ...state.textWorld.player, zone: "office", near: null, position: "entrance", facing: "far-door", posture: "standing", relation: "near", coverId: null, focusEntityId: null, manipulating: false };
    state.textWorld.lastIntent = { id: "enter", label: "역무실로 들어선다", importance: "major" };
    recordEvent(state.textWorld, { type: "ENTER", targetId: "office", before: { zone: "concourse" }, after: { zone: "office" } });
  } else {
    return performLocationWorldAction(state, action, registry, narrator, gameId);
  }
  const world = state.textWorld!;
  world.revision++;
  world.sceneRevision++;
  if (!world.active) return;
  const context = directNarrative(world);
  context.nextChoices = nextNarrativeChoices(world, locationWorldOptions(state, registry));
  const rendered = await renderNarration(context, gameId, narrator);
  storeChoiceLabels(world, context, rendered.choiceLabels);
  world.lastParagraphs = rendered.paragraphs;
  world.lastParagraphSources = rendered.paragraphSources;
  world.source = rendered.source;
  rememberNarration(world, context, rendered.usedFactIds, rendered.paragraphs);
  if (action.command === "enter") setSystemNote(state, []);
}
