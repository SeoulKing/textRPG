import type { ContentRegistry, GameAction, GameState, ItemCard, SubwayEncounterChoice, SubwayEncounterTurnResult } from "../schemas";
import { setSubwayEncounterGeneration, resolveSubwaySituationChoice } from "../subway-encounter";
import { fallbackSubwayEncounterGeneration } from "../subway-encounter-generator";
import { applySystemNote, performAction, syncScene } from "../rules";
import { setSystemNote } from "../system-note";
import { ensureExpeditionFloor } from "./expedition-floor-world";
import { spatialCombatActive, synchronizeCombatPresence, combatResultEvent } from "./combat-options";
import { advanceCombatOpponent } from "./combat-space";
import { availableLocationWorldOptions, recordExpeditionLoot, renderLocationWorld } from "./location-world";
import { recordEvent, resolveWorldActions } from "./engine";
import { choiceLabelFields } from "./choice-labels";
import { performInventoryLightAction } from "./inventory-lights";
import { reconcileWorldInventory } from "./inventory-state";
import type { TextWorldNarrator } from "./narrator";

/** Native combat supplies adjudication; the shared renderer supplies prose in one request. */
export function refreshCombatDecision(state: GameState, gameId: string, result?: SubwayEncounterTurnResult | null) {
  setSubwayEncounterGeneration(state, fallbackSubwayEncounterGeneration({ state, gameId, latestServerResult: result }, "공간 엔진의 확정된 선택"));
  synchronizeCombatPresence(state);
}
export async function renderSpatialCombat(state: GameState, registry: ContentRegistry, narrator: TextWorldNarrator, gameId: string, result?: SubwayEncounterTurnResult | null) {
  const entering = ensureExpeditionFloor(state, registry, true), world = state.textWorld!;
  refreshCombatDecision(state, gameId, result);
  if (entering) {
    world.events = [];
    world.lastIntent = { id: "enter", label: "지하층 통로로 들어선다", importance: "major" };
    recordEvent(world, { type: "ENTER", targetId: world.player.zone, before: {}, after: { zone: world.player.zone, entryText: "계단을 내려와 지하층의 통로 앞에 선다." } });
  }
  if (result) recordEvent(world, combatResultEvent(state, result, result.selectedLabel + "."));
  world.revision++;
  await renderLocationWorld(state, registry, narrator, gameId);
  copyResolvedScene(state);
}
function copyResolvedScene(state: GameState) {
  const encounter = state.subwayExpedition.currentFloorProgress.encounter, world = state.textWorld;
  if (encounter?.stage === "resolved" && encounter.currentScene && world) {
    encounter.currentScene.paragraphs = [...world.lastParagraphs];
    encounter.currentScene.source = world.source;
  }
}
function respond(state: GameState, gameId: string, choice: SubwayEncounterChoice, physical: boolean, minutes?: number, before?: GameState) {
  if (state.isGameOver || state.stageClear) return;
  const encounter = state.subwayExpedition.currentFloorProgress.encounter!;
  const responseSpent = advanceCombatOpponent(state, before);
  const result = resolveSubwaySituationChoice(state, choice.id, encounter.turnNumber, Math.random, { choice, responseSpent, physical, minutes });
  recordEvent(state.textWorld!, combatResultEvent(state, result, physical ? undefined : choice.label + "."));
  refreshCombatDecision(state, gameId, result);
}
async function finish(state: GameState, before: GameState, registry: ContentRegistry, narrator: TextWorldNarrator, gameId: string) {
  const world = state.textWorld!;
  recordExpeditionLoot(state, before);
  world.revision++;
  syncScene(state);
  const xpNotes=world.events.some(e=>e.type==="COMBAT") ? state.systemNoteEntries.filter(e=>e.type==="text" && /^전투 숙련도 \+/.test(e.text)) : [];
  applySystemNote(before, state);
  if(xpNotes.length)setSystemNote(state,[...state.systemNoteEntries,...xpNotes]);
  const seconds = world.elapsedSeconds - (before.textWorld?.elapsedSeconds ?? 0), minutes = Math.floor(seconds / 60), remainder = seconds % 60;
  setSystemNote(state, [...state.systemNoteEntries.filter(e => e.type !== "time"), { type: "text", text: "+" + (minutes ? minutes + "분" + (remainder ? " " + remainder + "초" : "") : seconds + "초"), tone: "neutral" }]);
  await renderLocationWorld(state, registry, narrator, gameId);
  copyResolvedScene(state);
}
function physicalChoice(id: string, label: string, hint: string): SubwayEncounterChoice {
  return { id, label, effectDescription: hint, postChoiceNarrative: [], intent: { primary: "interact", style: "careful", target: "environment" } };
}
export async function performCombatWorldAction(state: GameState, action: Extract<GameAction, { type: "text_world" }>, registry: ContentRegistry, narrator: TextWorldNarrator, gameId: string) {
  const world = state.textWorld;
  if (!spatialCombatActive(state) || !world?.active || action.command !== "choose") throw new Error("현재 전투 장면의 선택지를 골라 주세요.");
  if (action.revision !== world.revision) throw new Error("상황이 바뀌었습니다. 현재 선택지를 다시 골라 주세요.");
  const option = availableLocationWorldOptions(state, registry).find(o => o.id === action.optionId);
  if (!option?.actions || option.subwayCommand || option.contentActionId) throw new Error("현재 상황에서는 선택할 수 없는 행동입니다.");
  const before = structuredClone(state);
  world.events = [];
  world.lastIntent = { id: option.id, label: option.label, thought: choiceLabelFields(world, option).choiceThought, importance: "major" };
  const execution = resolveWorldActions(world, state, option.actions);
  // A stopped preparation never executes the promised attack. Time already spent still gives the opponent a response.
  if (!execution.interrupted || execution.elapsedSeconds > 0) {
    const choice = !execution.interrupted ? option.combatChoice : undefined;
    respond(state, gameId, choice ?? physicalChoice(option.id, option.label, option.hint), !choice, undefined, before);
  }
  await finish(state, before, registry, narrator, gameId);
}
export async function performCombatInventoryAction(state: GameState, action: Extract<GameAction, { type: "item_light" | "use_item" }>, registry: ContentRegistry, narrator: TextWorldNarrator, gameId: string) {
  if (!spatialCombatActive(state) || !state.textWorld?.active) throw new Error("진행 중인 공간 전투가 없습니다.");
  const before = structuredClone(state), world = state.textWorld;
  world.events = [];
  let label: string;
  if (action.type === "item_light") {
    label = world.entities[action.entityId]?.name + (action.on ? " 켜기" : " 끄기");
    const revision=world.revision;
    performInventoryLightAction(state, action, true);
    if(world.revision===revision)return;
  } else {
    const item = registry.items[action.itemId] as ItemCard | undefined;
    if(!item)throw new Error("지금은 그 아이템을 사용할 수 없습니다.");
    label = item.name + " 사용하기";
    performAction(state, action);
    reconcileWorldInventory(state);
    recordEvent(world, { type: "ITEM_USE", before: {}, after: { name: item.name, itemId: action.itemId } });
  }
  world.lastIntent = { id: "combat-inventory:" + (action.type === "item_light" ? action.entityId : action.itemId), label, importance: "major" };
  // Consumables have already paid their authored use time; do not charge it again for the response.
  respond(state, gameId, physicalChoice(world.lastIntent.id, label, "주변의 위협에 대응"), true, action.type === "use_item" ? 0 : undefined, before);
  await finish(state, before, registry, narrator, gameId);
}
