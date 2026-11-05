import type { ActionChoice, ContentRegistry, GameState } from "../schemas";
import type { TextEntity, TextWorld, WorldAction } from "../schemas/text-world";
import { choiceConditionsMet, resolveInteractionLoading } from "../content-engine";
import { getStockMoneyKey, getStockStateKey } from "../state-utils";
import { performAction } from "../rules";
import { resolveItemText } from "../item-text";
import { recordEvent, resolveWorldActions } from "./engine";
import { visibleEntities, particle } from "./world";

export type BoundStockOption = {
  id: string; label: string; hint: string; nodeId: string; stockChoiceIds: string[];
  preparation: WorldAction[]; importance: "major"; loading: NonNullable<ActionChoice["loading"]>;
};
export function boundStockItems(state: GameState, registry: ContentRegistry, entity: TextEntity) {
  const node = registry.locations[state.location]?.stockNodes.find(n => n.id === entity.components.stockNode?.nodeId);
  if (!node) return [];
  const prefix = "stock:" + entity.id + ":";
  const items = node.items.map(item => ({ id: prefix + item.itemId, itemId: item.itemId,
    amount: state.stockState[getStockStateKey(state.location, node.id, item.itemId)] ?? item.initialQuantity,
    name: String((registry.items[item.itemId] as { name?: string } | undefined)?.name ?? item.itemId), money: false }));
  const money = state.stockState[getStockMoneyKey(state.location, node.id)] ?? node.money;
  if (money > 0) items.push({ id: prefix + "$money", itemId: "$money", amount: money, name: "돈", money: true });
  return items.filter(item => item.amount > 0);
}
export function isBoundStockItem(world: TextWorld, id: string) {
  const parent = world.entities[world.entities[id]?.components.position.zone ?? ""];
  return Boolean(parent?.components.stockNode && id.startsWith("stock:" + parent.id + ":"));
}
/** Stock is projected from one saved ledger. Player placements and the cabinet's open state are independent. */
export function syncBoundStockNodes(state: GameState, registry: ContentRegistry, world: TextWorld) {
  for (const entity of Object.values(world.entities).filter(e => e.components.stockNode)) {
    const nodeId = entity.components.stockNode!.nodeId;
    const node = registry.locations[state.location]?.stockNodes.find(n => n.id === nodeId);
    const prefix = "stock:" + entity.id + ":";
    for (const id of Object.keys(world.entities)) if (id.startsWith(prefix)) delete world.entities[id];
    const items = boundStockItems(state, registry, entity);
    const placed = Object.values(world.entities).filter(e => e.components.position.zone === entity.id && e.components.position.relation !== "on");
    entity.components.container = { ...entity.components.container, items: [...items.map(i => i.id), ...placed.map(e => e.id)] };
    const previous = world.observations[entity.id];
    if (!previous && state.discoveredStockNodeIds.includes(nodeId)) {
      world.observations[entity.id] = { stages: ["outline", "surface", "interior"], inspected: true, collected: !items.length };
      if (entity.components.openable && !entity.components.openable.locked) entity.components.openable.isOpen = true;
    } else if (previous?.stages.includes("interior")) previous.collected = !items.length && !placed.length;
    const gone = !node || node.depletionBehavior === "disappear" && !items.length && !placed.length;
    if (gone) entity.components.position.zone = "depleted";
    else if (entity.components.position.zone === "depleted") {
      const room = registry.textRooms?.find(r => r.locationId === state.location && r.entities.some(e => e.id === entity.id));
      const original = room?.entities.find(e => e.id === entity.id);
      if (original) entity.components.position = structuredClone(original.components.position);
    }
    for (const item of items) world.entities[item.id] = { id: item.id, name: item.name, description: item.name,
      inventoryRegistered: false, components: { position: { zone: entity.id }, portable: { itemId: item.money ? null : item.itemId, amount: item.amount, ...(item.money ? { unit: "원" } : {}) } } };
  }
}
export function boundStockOptions(state: GameState, registry: ContentRegistry, world: TextWorld): BoundStockOption[] {
  return visibleEntities(world).filter(e => e.components.stockNode && world.observations[e.id]?.stages.includes("interior")).flatMap(entity => {
    const nodeId = entity.components.stockNode!.nodeId, focused = { ...state, activeStockNodeId: nodeId };
    const choices = Object.values(registry.choices).filter(choice => !choice.hidden && choiceConditionsMet(choice, focused) && choice.effects.some(effect =>
      ["collect_stock_item", "collect_stock_item_all", "collect_stock_money", "collect_stock_money_all"].includes(effect.type)
      && "nodeId" in effect && effect.nodeId === nodeId && "locationId" in effect && effect.locationId === state.location));
    const items = boundStockItems(state, registry, entity).filter(item => choices.some(choice => choice.effects.some(effect =>
      "nodeId" in effect && effect.nodeId === nodeId && (item.money ? effect.type.startsWith("collect_stock_money") : "itemId" in effect && effect.itemId === item.itemId))));
    if (!items.length) return [];
    const posture = entity.details?.posture ?? "crouching";
    const preparation: WorldAction[] = [];
    if (world.player.near !== entity.id) {
      if (world.player.posture !== "standing") preparation.push({ type: "POSTURE", posture: "standing" });
      preparation.push({ type: "MOVE", target: entity.id });
      if (posture === "crouching") preparation.push({ type: "POSTURE", posture });
    } else if (world.player.posture !== posture) preparation.push({ type: "POSTURE", posture });
    if (entity.components.openable?.isOpen === false) preparation.push({ type: "OPEN", target: entity.id });
    return [{ id: "collect:" + entity.id, nodeId: entity.id, stockChoiceIds: choices.map(c => c.id), preparation,
      label: particle(items.map(i => i.money ? "남은 돈" : i.name).join(", "), "을", "를") + " 챙긴다",
      hint: "발견한 물건 수집", importance: "major" as const, loading: resolveInteractionLoading(choices[0]) ?? { durationMs: 500, transitionType: "activity" as const } }];
  });
}
/** Only successful observations establish discovery; a failed opening cannot unlock the legacy collection route. */
export function rememberBoundStockDiscovery(state: GameState, world: TextWorld) {
  for (const entity of Object.values(world.entities)) {
    const nodeId = entity.components.stockNode?.nodeId;
    if (nodeId && world.observations[entity.id]?.stages.includes("interior") && !state.discoveredStockNodeIds.includes(nodeId)) state.discoveredStockNodeIds.push(nodeId);
  }
}
export function collectBoundStock(state: GameState, registry: ContentRegistry, world: TextWorld, option: BoundStockOption) {
  if (resolveWorldActions(world, state, option.preparation).interrupted) return;
  const entity = world.entities[option.nodeId], location = state.location;
  state.activeStockNodeId = entity.components.stockNode!.nodeId;
  try {
    for (const choiceId of option.stockChoiceIds) {
      if (state.isGameOver || state.stageClear || state.location !== location) break;
      const choice = registry.choices[choiceId];
      if (!choice || !choiceConditionsMet(choice, state)) continue;
      const previous = boundStockItems(state, registry, entity);
      performAction(state, { type: "content_choice", choiceId }, { onNarrative: result => {
        if (result.type !== "scene") return;
        const scene = registry.scenes[result.sceneId];
        if (scene) recordEvent(world, { type: "STORY", targetId: entity.id, before: {}, after: { text: scene.paragraphs.map(p => resolveItemText(p, registry)).join(" ") } });
      } });
      const remaining = boundStockItems({ ...state, location }, registry, entity);
      for (const item of previous) {
        const amount = item.amount - (remaining.find(i => i.id === item.id)?.amount ?? 0);
        if (amount <= 0) continue;
        if (!item.money) {
          const id = "stock-carry:" + item.id + ":" + world.revision + ":" + world.events.length;
          world.entities[id] = { id, name: item.name, description: item.name, inventoryRegistered: true,
            components: { position: { zone: "player" }, portable: { itemId: item.itemId, amount } } };
          world.observations[id] = { stages: ["outline", "surface"], collected: true };
        }
        recordEvent(world, { type: "TAKE", targetId: item.id, before: { zone: entity.id },
          after: { zone: "player", name: item.name, amount, itemId: item.money ? null : item.itemId, money: item.money, held: false, stowed: !item.money } });
      }
    }
  } finally { state.activeStockNodeId = null; }
  if (state.isGameOver || state.stageClear) recordEvent(world, { type: "STOPPED", attemptedAction: "TAKE", reason: state.gameOverReason || "더는 수집을 이어갈 수 없다.", before: {}, after: {} });
  if (state.location !== location) world.active = false;
}
