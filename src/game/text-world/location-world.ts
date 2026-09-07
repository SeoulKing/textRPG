import { performPointAction } from "./interaction-points";
import { boundStockOptions, collectBoundStock, isBoundStockItem, rememberBoundStockDiscovery, syncBoundStockNodes, type BoundStockOption } from "./stock-nodes";
import type { ActionChoice, ActionDefinition, ContentRegistry, GameAction, GameState } from "../schemas";
import type { TextWorld, WorldAction } from "../schemas/text-world";
import { actionConditionsMet, resolveInteractionLoading } from "../content-engine";
import { resolveItemText } from "../item-text";
import { formatOutcomeHint } from "../outcome-hint";
import { getRemainingDailyUses } from "../state-utils";
import { projectResourceSite, resourceAvailability } from "../resources";
import { applySystemNote, consumeCurrentSceneIntro, performAction, syncScene } from "../rules";
import { createLocationTextWorld, visibleEntities, worldRooms } from "./world";
import { transferCarriedEntities } from "./inventory";
import { availableWorldOptions } from "./choices";
import { directChoices } from "./choice-director";
import { interactionContext } from "./interaction-context";
import { choiceLabelFields, nextNarrativeChoices, storeChoiceLabels } from "./choice-labels";
import { recordEvent, resolveWorldActions } from "./engine";
import { directNarrative, rememberNarration } from "./perception";
import { fallbackNarration, validateRenderedNarration, type TextWorldNarrator } from "./narrator";

const ACTIVITY = { durationMs: 500, transitionType: "activity" as const };
const worldOf = (state: GameState) => state.locationTextWorlds[state.location];
export function hasLocationWorld(state: GameState, registry: ContentRegistry) {
  return !["subway", "convenience"].includes(state.location) && Boolean(registry.textRooms?.some(room => room.locationId === state.location));
}
function siteActions(state: GameState, registry: ContentRegistry, siteId: string) {
  return Object.values(registry.actions).filter(action => action.locationIds.includes(state.location) && action.resourceUse?.siteId === siteId);
}
function toolIds(action: ActionDefinition) {
  return action.effects.flatMap(effect => effect.type === "damage_tool" ? [effect.itemId] : []);
}
/** Resource quantities come from the canonical pool; physical objects keep their saved positions. */
export function syncLocationResources(state: GameState, registry: ContentRegistry) {
  const world = worldOf(state);
  if (!world) return;
  for (const entity of Object.values(world.entities)) {
    const binding = entity.components.resourceSite;
    if (!binding) continue;
    const site = registry.locations[state.location]?.resourceSites?.find(site => site.id === binding.siteId);
    if (!site) { binding.remaining = 0; delete binding.recoveryMinutes; continue; }
    const projected = projectResourceSite(state, state.location, site);
    const missingTools = siteActions(state, registry, site.id).flatMap(action => toolIds(action).filter(id => !(state.inventory[id] > 0)))
      .map(id => String((registry.items[id] as { name?: string } | undefined)?.name ?? id));
    entity.components.resourceSite = { siteId: site.id, unlimited: site.unlimited,
      remaining: site.unlimited ? undefined : projected.remaining, capacity: site.unlimited ? undefined : site.capacity,
      recoveryMinutes: site.unlimited ? undefined : site.recoveryMinutes, missingTools: projected.remaining > 0 ? [...new Set(missingTools)] : [] };
  }
}
type LocationOption = { id: string; label: string; hint: string; nodeId?: string; contentActionId?: string;
  actions?: WorldAction[]; importance: "major" | "minor"; loading: NonNullable<ActionChoice["loading"]>; remainingUses?: number; stockChoiceIds?: string[]; preparation?: WorldAction[] };

export function locationWorldOptions(state: GameState, registry: ContentRegistry) {
  const world = worldOf(state);
  if (!world?.active || state.isGameOver || state.stageClear || state.npcDialogue.active) return [];
  const candidates: LocationOption[] = availableWorldOptions(world, state)
    .filter(option => !option.actions.some(action => action.type === "TAKE" && isBoundStockItem(world, action.target ?? "")))
    .map(option => ({ ...option, loading: ACTIVITY }));
  candidates.push(...boundStockOptions(state, registry, world));
  const focus = interactionContext(world, state).focusEntityId;
  for (const entity of visibleEntities(world)) {
    const focused = entity.id === focus && entity.id === world.player.near && world.observations[entity.id]?.inspected;
    for (const binding of focused ? entity.components.interactionPoint?.actions ?? [] : []) {
      const action = registry.actions[binding.actionId];
      if (!action || !action.locationIds.includes(state.location) || !actionConditionsMet(action, state) || action.dailyLimit && getRemainingDailyUses(state, action.dailyLimit) <= 0) continue;
      candidates.push({ id: binding.role + ":" + action.id, nodeId: entity.id, contentActionId: action.id,
        label: resolveItemText(action.label, registry), hint: resolveItemText(formatOutcomeHint(action.effects, state, action.skillUse) || action.outcomeHint, registry),
        importance: "major", loading: resolveInteractionLoading(action) ?? ACTIVITY });
    }
    if (!entity.components.resourceSite) continue;
    const methods = siteActions(state, registry, entity.components.resourceSite.siteId).filter(action => (focused || action.resourceUse?.directFromEntry && entity.components.position.zone === world.player.zone) && actionConditionsMet(action, state)
      && (!action.dailyLimit || getRemainingDailyUses(state, action.dailyLimit) > 0));
    const hasManual = methods.some(action => !toolIds(action).length);
    for (const action of methods) {
      const resource = resourceAvailability(state, action, registry);
      if (!resource || resource.remainingUses === 0) continue;
      const label = resolveItemText(action.label, registry).replace(/하기$/, "한다");
      const possibleEmpty = action.effects.some(effect => effect.type === "random_outcome" && effect.outcomes.some(outcome => outcome.result === "failure"));
      const hint = resolveItemText(formatOutcomeHint(action.effects, state, action.skillUse) || action.outcomeHint, registry);
      candidates.push({ id: (hasManual && toolIds(action).length ? "toolwork:" : "harvest:") + action.id,
        label, nodeId: entity.id, contentActionId: action.id, hint: hint + (possibleEmpty ? " / 빈손으로 끝날 수 있음" : ""),
        preparation: [
          ...(entity.id !== world.player.near ? [...(world.player.posture !== "standing" ? [{ type: "POSTURE" as const, posture: "standing" as const }] : []), { type: "MOVE" as const, target: entity.id }] : []),
          ...((entity.details?.posture ?? "standing") !== (entity.id !== world.player.near ? "standing" : world.player.posture) ? [{ type: "POSTURE" as const, posture: entity.details?.posture ?? "standing" as const }] : []),
          ...(!world.observations[entity.id]?.inspected ? [{ type: "INSPECT" as const, target: entity.id }] : []),
        ],
        remainingUses: resource.remainingUses, importance: "major", loading: resolveInteractionLoading(action) ?? ACTIVITY });
    }
  }
  return directChoices(world, state, candidates);
}
export function locationWorldActions(state: GameState, registry: ContentRegistry): ActionChoice[] {
  return locationWorldOptions(state, registry).map(option => ({ id: "text-world:" + state.location + ":" + worldOf(state).revision + ":" + option.id,
    ...choiceLabelFields(worldOf(state), option), outcomeHint: option.hint, showOutcomeHint: true, isAvailable: true,
    loading: option.loading, remainingUses: option.remainingUses,
    action: { type: "text_world", command: "choose", optionId: option.id, revision: worldOf(state).revision } }));
}
async function render(state: GameState, registry: ContentRegistry, narrator: TextWorldNarrator, gameId: string) {
  const world = worldOf(state);
  syncLocationResources(state, registry);
  syncBoundStockNodes(state, registry, world);
  const context = directNarrative(world);
  rememberBoundStockDiscovery(state, world);
  context.nextChoices = nextNarrativeChoices(world, locationWorldOptions(state, registry));
  let rendered;
  try { rendered = validateRenderedNarration(context, await narrator(structuredClone(context), gameId)) ?? fallbackNarration(context); }
  catch { rendered = fallbackNarration(context); }
  storeChoiceLabels(world, context, rendered.choiceLabels);
  world.lastParagraphs = rendered.paragraphs;
  world.source = rendered.source;
  world.sceneRevision++;
  rememberNarration(world, context, rendered.usedFactIds, rendered.paragraphs);
}
/** Arrival generates one scene; an active saved scene and ordinary polls never regenerate it. */
export async function ensureLocationWorld(state: GameState, registry: ContentRegistry, narrator: TextWorldNarrator, gameId: string) {
  for (const [location, world] of Object.entries(state.locationTextWorlds)) {
    if (location !== "convenience" && (location !== state.location || state.npcDialogue.active)) world.active = false;
  }
  if (!hasLocationWorld(state, registry) || state.npcDialogue.active || state.isGameOver || state.stageClear) return;
  const rooms = registry.textRooms!.filter(room => room.locationId === state.location);
  const legacyFocus = state.activeStockNodeId;
  const world = state.locationTextWorlds[state.location] ??= createLocationTextWorld(rooms);
  syncLocationResources(state, registry);
  syncBoundStockNodes(state, registry, world);
  if (world.active) return;
  world.active = true;
  transferCarriedEntities(state, world);
  const resume = Object.values(world.entities).find(e => e.components.stockNode?.nodeId === legacyFocus && worldRooms(world)[e.components.position.zone]);
  const entry = worldRooms(world)[resume?.components.position.zone ?? rooms[0].id] ?? Object.values(worldRooms(world))[0];
  world.events = [];
  world.player = { ...world.player, zone: entry.id, near: null, position: "entrance", facing: null, posture: "standing", relation: "near", coverId: null, focusEntityId: null, manipulating: false };
  if (resume) world.player = { ...world.player, near: resume.id, position: resume.details?.anchor ?? resume.id, facing: resume.id, focusEntityId: resume.id, posture: resume.details?.posture ?? "crouching" };
  world.lastIntent = { id: "enter", label: resume ? "확인하던 자리에서 탐색을 이어간다" : entry.name + "에 들어선다", importance: "major" };
  recordEvent(world, { type: "ENTER", targetId: entry.id, before: {}, after: { zone: entry.id, entryText: resume ? "확인하던 " + resume.name + " 앞에서 탐색을 이어간다." : entry.entryText ?? entry.name + "의 입구로 들어선다." } });
  state.activeStockNodeId = null;
  consumeCurrentSceneIntro(state);
  syncScene(state);
  world.revision++;
  await render(state, registry, narrator, gameId);
}
export async function performLocationWorldAction(state: GameState, action: Extract<GameAction, { type: "text_world" }>, registry: ContentRegistry, narrator: TextWorldNarrator, gameId: string) {
  const world = worldOf(state);
  if (!world?.active || action.command !== "choose") throw new Error("먼저 탐색할 장소에 들어가 주세요.");
  if (world.revision !== action.revision) throw new Error("상황이 바뀌었습니다. 현재 선택지를 다시 골라 주세요.");
  const option = locationWorldOptions(state, registry).find(option => option.id === action.optionId);
  if (!option) throw new Error("현재 상황에서는 선택할 수 없는 행동입니다.");
  const before = structuredClone(state);
  world.events = [];
  world.lastIntent = { id: option.id, label: option.label, thought: choiceLabelFields(world, option).choiceThought, importance: option.importance };
  if (option.stockChoiceIds) collectBoundStock(state, registry, world, option as BoundStockOption);
  else if (option.actions) resolveWorldActions(world, state, option.actions);
  else if (option.contentActionId) {
    const definition = registry.actions[option.contentActionId];
    const entity = world.entities[option.nodeId!];
    if (entity.components.interactionPoint?.actions.some(binding => binding.actionId === definition.id)) {
      performPointAction(state, registry, world, definition, entity.id);
    } else {
      const preparation = resolveWorldActions(world, state, option.preparation ?? []);
      if (preparation.interrupted || preparation.discovery) {
        world.revision++;
        syncScene(state);
        applySystemNote(before, state);
        if (world.active) await render(state, registry, narrator, gameId);
        return;
      }
      const event = recordEvent(world, { type: "WORK", targetId: entity.id, before: { siteId: definition.resourceUse!.siteId },
        after: { name: entity.name, effort: definition.resourceUse?.effort ?? entity.name + "에서 작업을 이어간다." } });
      // Native effects own costs, tool wear, experience and rewards. Narration never replays them.
      performAction(state, { type: "content_action", actionId: definition.id });
      const gained = Object.entries(state.inventory).filter(([id, amount]) => amount > (before.inventory[id] ?? 0));
      const tools = toolIds(definition).map(id => ({ name: String((registry.items[id] as { name?: string } | undefined)?.name ?? id),
        before: before.toolDurability[id] ?? Number((registry.items[id] as { maxDurability?: number })?.maxDurability ?? 0),
        after: state.inventory[id] > 0 ? state.toolDurability[id] ?? Number((registry.items[id] as { maxDurability?: number })?.maxDurability ?? 0) : 0 }));
      Object.assign(event.after, { elapsedSeconds: world.elapsedSeconds - event.at, empty: gained.length === 0,
        interrupted: state.isGameOver || state.stageClear, tools: tools.filter(tool => tool.before !== tool.after) });
      for (const [itemId, quantity] of gained) {
        const amount = quantity - (before.inventory[itemId] ?? 0), name = String((registry.items[itemId] as { name?: string } | undefined)?.name ?? itemId);
        const id = "gathered:" + state.location + ":" + world.revision + ":" + itemId;
        world.entities[id] = { id, name, description: name, components: { position: { zone: "player" }, portable: { itemId, amount } } };
        world.observations[id] = { stages: ["outline", "surface"], collected: true };
        recordEvent(world, { type: "TAKE", targetId: id, before: { zone: entity.id }, after: { zone: "player", name, itemId, amount, held: false } });
      }
      if (state.isGameOver || state.stageClear) recordEvent(world, { type: "STOPPED", attemptedAction: "WORK", reason: state.gameOverReason || "더는 작업을 이어갈 수 없다.", before: {}, after: {} });
      if (state.location !== before.location) world.active = false;
    }
  }
  world.revision++;
  syncScene(state);
  applySystemNote(before, state);
  if (world.active) await render(state, registry, narrator, gameId);
}
