import type { ActionChoice, ContentRegistry, GameAction, GameState } from "../schemas";
import type { NarrativeContext, TextEntity, TextWorld, WorldAction } from "../schemas/text-world";
import { choiceConditionsMet, resolveInteractionLoading } from "../content-engine";
import { resolveItemText } from "../item-text";
import { applySystemNote, consumeCurrentSceneIntro, performAction, syncScene } from "../rules";
import { buildRuntimeRegistry } from "../runtime-registry";
import { getStockMoneyKey, getStockStateKey } from "../state-utils";
import { recordEvent, resolveWorldActions } from "./engine";
import { directNarrative, rememberNarration } from "./perception";
import { renderNarration, type TextWorldNarrator } from "./narrator";
import { particle } from "./world";
import { directChoices } from "./choice-director";
import { focusOptions } from "./focus-options";
import { interactionOptions } from "./affordances";
import { inventoryRegistered } from "./inventory-state";
import { transferCarriedEntities } from "./inventory";
import { visibleEntities } from "./world";
import { choiceLabelFields, nextNarrativeChoices, storeChoiceLabels } from "./choice-labels";

const LOCATION = "convenience";
const ZONE = "store";
const ACTIVITY = { durationMs: 500, transitionType: "activity" as const };
// These details come from the existing convenience scenes. Stock and rewards remain in the registry.
const placements: Record<string, { placement: string; surface: string; crouch: boolean; lid?: boolean }> = {
  convenience_shelf: { placement: "가게 안쪽의 기울어진 선반", surface: "기울어진 선반에는 먼지와 유리 조각이 남아 있다.", crouch: false },
  convenience_register: { placement: "유리 파편이 흩어진 계산대 쪽", surface: "먼지 속에 파묻힌 계산대 서랍이 반쯤 열려 있다.", crouch: true },
  convenience_food_crate: { placement: "계산대 뒤쪽 아래", surface: "플라스틱 보관함이 계산대 뒤쪽 아래로 밀려 들어가 있다.", crouch: true, lid: true },
  convenience_supply_pile: { placement: "창고 쪽의 무너진 선반 아래", surface: "반쯤 무너진 선반 아래에 자재가 뒤엉켜 있다.", crouch: true },
};
const layout = "반쯤 무너진 가게의 깨진 자동문이 비뚤게 걸려 있다. 계산대 뒤쪽 아래에는 보관함이 있고, 가게 안쪽의 기울어진 선반과 창고 쪽 무너진 선반 아래로도 다가갈 수 있다. 뒤편 골목은 병원 쪽으로 이어진다.";
function worldOf(state: GameState) { return state.locationTextWorlds[LOCATION]; }
function nodeItems(state: GameState, registry: ContentRegistry, nodeId: string) {
  const node = registry.locations[LOCATION].stockNodes.find(n => n.id === nodeId)!;
  const items = node.items.map(item => ({ id: node.id + ":" + item.itemId, itemId: item.itemId,
    amount: state.stockState[getStockStateKey(LOCATION, node.id, item.itemId)] ?? item.initialQuantity,
    name: String((registry.items[item.itemId] as { name?: string } | undefined)?.name ?? item.itemId), money: false }));
  const amount = state.stockState[getStockMoneyKey(LOCATION, node.id)] ?? node.money;
  if (amount > 0) items.push({ id: node.id + ":$money", itemId: "$money", amount, name: "돈", money: true });
  return items.filter(item => item.amount > 0);
}
export function syncConvenienceEntities(state: GameState, registry = buildRuntimeRegistry(state)) {
  const world = worldOf(state);
  const stockNodes = registry.locations[LOCATION].stockNodes;
  const isStock = (id: string) => stockNodes.some(node => id === node.id || id.startsWith(node.id + ":"));
  const entities: Record<string, TextEntity> = Object.fromEntries(Object.entries(world.entities).filter(([id]) => !isStock(id)));
  for (const node of registry.locations[LOCATION].stockNodes) {
    const items = nodeItems(state, registry, node.id);
    const detail = placements[node.id] ?? { placement: "가게 안쪽", surface: node.name + "의 표면을 가까이서 확인할 수 있다.", crouch: false };
    const placed = Object.values(entities).filter(e => e.components.position.zone === node.id && e.components.position.relation !== "on").map(e => e.id);
    const gone = node.depletionBehavior === "disappear" && !items.length && !placed.length;
    const previous = world.entities[node.id];
    const observed = world.observations[node.id];
    const inspected = observed?.stages.includes("interior") || state.discoveredStockNodeIds.includes(node.id);
    entities[node.id] = { id: node.id, name: node.name, description: detail.surface,
      details: { anchor: node.id, placement: detail.placement, outline: node.name, surface: detail.surface },
      components: { ...previous?.components, position: gone ? { zone: "depleted" } : previous?.components.position.zone === "depleted" ? { zone: ZONE } : previous?.components.position ?? { zone: ZONE }, container: { ...previous?.components.container, items: [...items.map(item => item.id), ...placed] },
        ...(detail.lid ? { physical: previous?.components.physical ?? { mass: 3, volume: 8, movable: true, opaque: true, blocksPassage: true, supportCapacity: 5 } } : node.id === "convenience_register" ? { physical: previous?.components.physical ?? { mass: 50, volume: 15, movable: false, opaque: true, blocksPassage: true, supportCapacity: 10 } } : {}),
        ...(detail.lid ? { openable: { isOpen: previous?.components.openable?.isOpen ?? Boolean(inspected), locked: false } } : {}) } };
    if (inspected || observed) world.observations[node.id] = { ...observed, stages: inspected ? ["outline", "surface", "interior"] : observed!.stages,
      inspected: Boolean(inspected), collected: Boolean(inspected && !items.length) };
    for (const item of items) entities[item.id] = { id: item.id, name: item.name, description: item.name,
      components: { position: { zone: node.id }, portable: { itemId: item.money ? null : item.itemId, amount: item.amount, ...(item.money ? { unit: "원" } : {}) } } };
  }
  world.entities = entities;
}
function createWorld(): TextWorld {
  return { version: 2, active: false, revision: 0, elapsedSeconds: 0,
    player: { zone: ZONE, near: null, position: "entrance", facing: null, posture: "standing", heldToolId: null },
    rooms: { [ZONE]: { id: ZONE, name: "편의점 폐허", locationId: LOCATION, light: true, layout,
      surface: "바닥에는 유리 조각과 찢어진 포장지가 흩어져 있다.", neighbors: [],
      sensory: [{ when: "ENTER", detail: "바닥에는 유리 조각과 찢어진 포장지가 흩어져 있다. 뒤편 골목에서 약품 냄새가 희미하게 남아 있다." }] } },
    entities: {}, observations: {}, visitedZones: [], knowledge: {}, narrated: {}, events: [], recentScenes: [],
    lastIntent: { id: "enter", label: "편의점 안으로 들어선다", importance: "major" }, lastParagraphs: [layout], source: "template", sceneRevision: 0 };
}
function focusedState(state: GameState, nodeId: string): GameState { return { ...state, activeStockNodeId: nodeId }; }
function collectingChoices(state: GameState, registry: ContentRegistry, nodeId: string) {
  const focused = focusedState(state, nodeId);
  return Object.values(registry.choices).filter(choice => !choice.hidden && choice.effects.some(effect =>
    ["collect_stock_item", "collect_stock_item_all", "collect_stock_money", "collect_stock_money_all"].includes(effect.type) &&
    "nodeId" in effect && effect.nodeId === nodeId && "locationId" in effect && effect.locationId === LOCATION) && choiceConditionsMet(choice, focused));
}
function portalPending(state: GameState) { return Boolean(state.flags.magic_city_entrance_discovered && !state.flags.magic_city_portal_discovery_seen); }
type StoreOption = { id: string; label: string; hint: string; nodeId?: string; choiceId?: string; loading: NonNullable<ActionChoice["loading"]>; actions?: WorldAction[]; importance?: "major" | "minor" };
export function availableConvenienceOptions(state: GameState, registry = buildRuntimeRegistry(state)): StoreOption[] {
  const world = worldOf(state);
  if (state.location !== LOCATION || !world?.active || state.isGameOver || state.stageClear) return [];
  const explore: StoreOption[] = [], collect: StoreOption[] = [];
  for (const node of registry.locations[LOCATION].stockNodes) {
    if (world.entities[node.id]?.components.position.zone !== ZONE) continue;
    const known = world.observations[node.id]?.stages.includes("interior");
    if (!known) explore.push({ id: "explore:" + node.id, nodeId: node.id, label: particle(node.name, "을", "를") + (placements[node.id]?.lid ? " 열어 안을 살핀다" : " 자세히 살핀다"), hint: "내부 탐색", loading: ACTIVITY });
    else {
      const choices = collectingChoices(state, registry, node.id);
      if (!choices.length) continue;
      const names = nodeItems(state, registry, node.id).filter(item => choices.some(choice => choice.effects.some(effect =>
        "nodeId" in effect && effect.nodeId === node.id && (item.money ? effect.type.startsWith("collect_stock_money") : "itemId" in effect && effect.itemId === item.itemId))))
        .map(item => item.money ? "남은 돈" : item.name).join(", ");
      if (names) collect.push({ id: "collect:" + node.id, nodeId: node.id, label: particle(names, "을", "를") + " 챙긴다", hint: "발견한 물건 수집", loading: resolveInteractionLoading(choices[0]) ?? ACTIVITY });
    }
  }
  collect.sort((a, b) => Number(b.nodeId === world.player.near) - Number(a.nodeId === world.player.near));
  const story: StoreOption[] = portalPending(state) ? ["go_to_magic_city_entrance_after_discovery", "leave_magic_city_portal_for_now"].flatMap(id => {
    const choice = registry.choices[id];
    return choice && choiceConditionsMet(choice, state) ? [{ id: "story:" + id, choiceId: id, label: resolveItemText(choice.label, registry), hint: "발견한 길", loading: resolveInteractionLoading(choice) ?? ACTIVITY }] : [];
  }) : [];
  // Ordinary region travel belongs to the existing map menu.
  const physical: StoreOption[] = interactionOptions(world, state).map(o => ({ ...o, loading: ACTIVITY }));
  // Reclaim placed objects through the engine; registered stock still uses its original rewards and costs.
  const stockIds = new Set(registry.locations[LOCATION].stockNodes.flatMap(node => nodeItems(state, registry, node.id).map(item => item.id)));
  for (const entity of visibleEntities(world)) {
    if (!entity.components.portable || entity.components.position.zone === "player" && inventoryRegistered(world, entity) || stockIds.has(entity.id)) continue;
    physical.unshift({ id: "take:" + entity.id, label: particle(entity.name, "을", "를") + " 챙긴다", hint: "놓아둔 물건 수집", loading: ACTIVITY, actions: [...approach(world, entity.id), { type: "TAKE", target: entity.id }] });
  }
  return [...story, ...collect, ...explore, ...physical, ...focusOptions(world).map(o => ({ ...o, loading: ACTIVITY }))];
}
export function convenienceOptions(state: GameState, registry = buildRuntimeRegistry(state)) {
  const world = worldOf(state);
  return world ? directChoices(world, state, availableConvenienceOptions(state, registry)) : [];
}
export function convenienceActions(state: GameState, registry = buildRuntimeRegistry(state)): ActionChoice[] {
  return convenienceOptions(state, registry).map(option => ({ id: "text-world:convenience:" + worldOf(state).revision + ":" + option.id,
    ...choiceLabelFields(worldOf(state), option), outcomeHint: option.hint, showOutcomeHint: true, isAvailable: true, loading: option.loading,
    action: { type: "text_world", command: "choose", optionId: option.id, revision: worldOf(state).revision } }));
}
function approach(world: TextWorld, nodeId: string): WorldAction[] {
  const crouch = placements[nodeId]?.crouch ?? false;
  const actions: WorldAction[] = [];
  if (world.player.near !== nodeId) {
    if (world.player.posture === "crouching") actions.push({ type: "POSTURE", posture: "standing" });
    actions.push({ type: "MOVE", target: nodeId });
    if (crouch) actions.push({ type: "POSTURE", posture: "crouching" });
  } else if (world.player.posture !== (crouch ? "crouching" : "standing")) actions.push({ type: "POSTURE", posture: crouch ? "crouching" : "standing" });
  return actions;
}
async function render(state: GameState, registry: ContentRegistry, narrator: TextWorldNarrator, gameId: string) {
  const world = worldOf(state);
  if (portalPending(state) && !world.knowledge["story:portal"]) {
    const scene = registry.scenes.convenience_portal_discovery;
    if (scene) {
      const text = scene.paragraphs.map(p => resolveItemText(p, registry)).join(" ");
      recordEvent(world, { type: "STORY", targetId: "portal", before: {}, after: { text } });
      world.knowledge["story:portal"] = { fact: { id: "story:portal", kind: "story", data: { text } }, signature: text, observedAt: world.elapsedSeconds };
    }
  }
  const context: NarrativeContext = directNarrative(world);
  context.nextChoices = nextNarrativeChoices(world, convenienceOptions(state, registry));
  const rendered = await renderNarration(context, gameId, narrator);
  storeChoiceLabels(world, context, rendered.choiceLabels);
  world.lastParagraphs = rendered.paragraphs;
  world.lastParagraphSources = rendered.paragraphSources;
  world.source = rendered.source;
  world.sceneRevision++;
  rememberNarration(world, context, rendered.usedFactIds, rendered.paragraphs);
}
/** Called on arrival, load, and restore. Polls reuse the stored scene without another LLM call. */
export async function ensureConvenienceWorld(state: GameState, registry: ContentRegistry, narrator: TextWorldNarrator, gameId: string) {
  const previous = worldOf(state);
  if (state.location !== LOCATION || state.npcDialogue.active) { if (previous) previous.active = false; return; }
  if (state.isGameOver || state.stageClear) return;
  const legacyFocus = state.activeStockNodeId;
  const world = state.locationTextWorlds[LOCATION] ??= createWorld();
  syncConvenienceEntities(state, registry);
  if (world.active) return;
  world.active = true;
  transferCarriedEntities(state, world);
  world.events = [];
  const resumingFocus = legacyFocus && world.entities[legacyFocus]?.components.position.zone === ZONE ? legacyFocus : null;
  world.player = { ...world.player, zone: ZONE, near: resumingFocus, position: resumingFocus ?? "entrance", facing: resumingFocus,
    posture: resumingFocus && placements[resumingFocus]?.crouch ? "crouching" : "standing", relation: "near", coverId: null, focusEntityId: resumingFocus, manipulating: false };
  world.lastIntent = { id: "enter", label: resumingFocus ? "확인하던 자리에서 탐색을 이어간다" : "편의점 안으로 들어선다", importance: "major" };
  recordEvent(world, { type: "ENTER", targetId: ZONE, before: {}, after: { zone: ZONE, entryText: resumingFocus ? "확인하던 " + world.entities[resumingFocus].name + " 앞에서 주변으로 시선을 옮긴다." : "비뚤게 걸린 자동문을 지나 가게 안으로 들어선다." } });
  state.activeStockNodeId = null;
  consumeCurrentSceneIntro(state);
  syncScene(state);
  world.revision++;
  await render(state, registry, narrator, gameId);
}
export async function performConvenienceAction(state: GameState, action: Extract<GameAction, { type: "text_world" }>, registry: ContentRegistry, narrator: TextWorldNarrator, gameId: string) {
  const world = worldOf(state);
  if (!world?.active || action.command !== "choose" || state.location !== LOCATION) throw new Error("먼저 편의점에 들어가 주세요.");
  if (world.revision !== action.revision) throw new Error("상황이 바뀌었습니다. 현재 선택지를 다시 골라 주세요.");
  const option = availableConvenienceOptions(state, registry).find(o => o.id === action.optionId);
  if (!option) throw new Error("현재 상황에서는 선택할 수 없는 행동입니다.");
  const before = structuredClone(state);
  world.events = [];
  world.lastIntent = { id: option.id, label: option.label, thought: choiceLabelFields(world, option).choiceThought, importance: option.importance ?? "major" };
  if (option.actions) {
    const result = resolveWorldActions(world, state, option.actions);
    const target = option.actions.at(-1)?.target;
    if (!result.interrupted && option.id.startsWith("focus:") && target && registry.locations[LOCATION].stockNodes.some(node => node.id === target) && world.entities[target]?.components.openable?.isOpen !== false) {
      const original = Object.values(registry.choices).find(choice => choice.effects.some(effect => effect.type === "focus_stock_node" && effect.nodeId === target) && choiceConditionsMet(choice, state));
      if (original) performAction(state, { type: "content_choice", choiceId: original.id });
      if (!state.discoveredStockNodeIds.includes(target)) state.discoveredStockNodeIds.push(target);
      state.activeStockNodeId = null;
    }
  } else if (option.choiceId) {
    const choice = registry.choices[option.choiceId];
    performAction(state, { type: "content_choice", choiceId: choice.id });
    if (state.location !== LOCATION) world.active = false;
    else recordEvent(world, { type: "STORY", before: {}, after: { text: "포탈로 이어지는 길을 기억해 두고 가게 안의 탐색을 이어간다." } });
  } else if (option.nodeId) {
    const nodeId = option.nodeId;
    // Movement retains the legacy focus action's zero game-time cost; collection uses its authored skill-adjusted time.
    const movement = resolveWorldActions(world, state, approach(world, nodeId), { advanceTime: false });
    if (!movement.interrupted) {
      if (option.id.startsWith("explore:")) {
        const actions: WorldAction[] = [{ type: "INSPECT", target: nodeId }];
        if (world.entities[nodeId].components.openable?.isOpen === false) actions.push({ type: "OPEN", target: nodeId });
        const result = resolveWorldActions(world, state, actions, { advanceTime: false });
        if (!result.interrupted) {
          const original = Object.values(registry.choices).find(choice => choice.effects.some(effect => effect.type === "focus_stock_node" && effect.nodeId === nodeId) && choiceConditionsMet(choice, state));
          if (original) performAction(state, { type: "content_choice", choiceId: original.id });
          if (!state.discoveredStockNodeIds.includes(nodeId)) state.discoveredStockNodeIds.push(nodeId);
          state.activeStockNodeId = null;
        }
      } else {
        const candidates = collectingChoices(state, registry, nodeId);
        state.activeStockNodeId = nodeId;
        for (const choice of candidates) {
          if (state.isGameOver || state.stageClear) break;
          if (!choiceConditionsMet(choice, state)) continue;
          const resources = nodeItems(state, registry, nodeId);
          performAction(state, { type: "content_choice", choiceId: choice.id });
          for (const item of resources) {
            const remaining = nodeItems(state, registry, nodeId).find(i => i.id === item.id)?.amount ?? 0;
            if (remaining < item.amount) {
              const amount = item.amount - remaining;
              if (!item.money) {
                const id = "stock-carry:" + item.id + ":" + world.revision + ":" + world.events.length;
                world.entities[id] = { id, name: item.name, description: item.name, components: { position: { zone: "player" }, portable: { itemId: item.itemId, amount } } };
                world.observations[id] = { stages: ["outline", "surface"], collected: true };
              }
              recordEvent(world, { type: "TAKE", targetId: item.id, before: { zone: nodeId }, after: { zone: "player", name: item.name, amount, itemId: item.money ? null : item.itemId, money: item.money, held: false, stowed: !item.money } });
            }
          }
          if (state.location !== LOCATION) { world.active = false; break; }
        }
        if (state.isGameOver || state.stageClear) recordEvent(world, { type: "STOPPED", attemptedAction: "TAKE", reason: state.gameOverReason || "더는 행동을 이어갈 수 없다.", before: {}, after: {} });
        state.activeStockNodeId = null;
      }
    }
  }
  world.revision++;
  syncConvenienceEntities(state, registry);
  syncScene(state);
  applySystemNote(before, state);
  if (world.active) await render(state, registry, narrator, gameId);
}
