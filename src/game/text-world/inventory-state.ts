import { toolInstances } from "../tool-instances";
import type { GameState } from "../schemas";
import type { TextEntity, TextWorld } from "../schemas/text-world";
import { normalizeHands } from "./hands";
import { carriedByPlayer, childrenOf, containedBy, relocateEntity } from "./spatial";

/** Registration is sticky knowledge of an explicitly collected item, not current physical ownership. */
export function inventoryRegistered(world: TextWorld, entity: TextEntity) {
  return entity.inventoryRegistered ?? (["player", "collected"].includes(entity.components.position.zone) || world.observations[entity.id]?.collected === true);
}
export function entityTree(world: TextWorld, entity: TextEntity) {
  return Object.values(world.entities).filter(candidate => candidate.id === entity.id || containedBy(world, candidate, entity.id));
}
export function registeredAmounts(world: TextWorld, entities: TextEntity[]) {
  const amounts: Record<string, number> = {};
  for (const entity of entities) {
    const item = entity.components.portable;
    if (item?.itemId && inventoryRegistered(world, entity) && (carriedByPlayer(world, entity) || entity.components.position.zone === "collected"))
      amounts[item.itemId] = (amounts[item.itemId] ?? 0) + item.amount;
  }
  return amounts;
}
export function inventoryTreeAvailable(world: TextWorld, state: GameState, entity: TextEntity) {
  return Object.entries(registeredAmounts(world, entityTree(world, entity))).every(([id, amount]) => (state.inventory[id] ?? 0) >= amount);
}

/** Apply the ownership difference once, including previously collected contents of a portable container. */
export function transferInventoryOwnership(world: TextWorld, state: GameState, entity: TextEntity, position: TextEntity["components"]["position"], register = false) {
  const tree = entityTree(world, entity);
  for (const member of tree) member.inventoryRegistered ??= inventoryRegistered(world, member);
  const before = registeredAmounts(world, tree);
  for (const member of tree) {
    const itemId = member.components.portable?.itemId;
    if (itemId && carriedByPlayer(world,member) && member.inventoryRegistered && state.toolDurability[itemId] !== undefined) member.toolDurability ??= state.toolDurability[itemId];
  }
  if (register) entity.inventoryRegistered = true;
  relocateEntity(world, entity, position);
  const after = registeredAmounts(world, tree);
  const inventoryDelta = Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(after)])]
    .map(id => [id, (after[id] ?? 0) - (before[id] ?? 0)] as const).filter(([, amount]) => amount !== 0));
  for (const [id, amount] of Object.entries(inventoryDelta)) state.inventory[id] = (state.inventory[id] ?? 0) + amount;
  for (const itemId of Object.keys(inventoryDelta)) {
    const instance=toolInstances(state,itemId)[0]?.entity;
    if (!(state.inventory[itemId]>0)) delete state.toolDurability[itemId];
    else if(instance?.toolDurability !== undefined) state.toolDurability[itemId]=instance.toolDurability;
  }
  const containedItems = tree.filter(member => member !== entity && member.inventoryRegistered && member.components.portable).map(member => ({ id: member.id, name: member.name, amount: member.components.portable!.amount, itemId: member.components.portable!.itemId }));
  return { inventoryDelta, containedItems };
}

/** Reconcile registered carried stacks without flattening their containment or revealing uncollected contents. */
export function reconcileWorldInventory(state: GameState) {
  const worlds = [state.textWorld, ...Object.values(state.locationTextWorlds)].filter((w): w is TextWorld => Boolean(w));
  // Older office lights had no inventory item. Register only those already collected,
  // once, before reconciliation can mistake the new item for a consumed object.
  for (const world of worlds) for (const entity of Object.values(world.entities)) {
    const portable = entity.components.portable;
    if (entity.components.light && portable?.itemId === null && (entity.origin?.entityId ?? entity.id) === "lamp") {
      portable.itemId = "flashlight";
      if (inventoryRegistered(world, entity) && (carriedByPlayer(world, entity) || entity.components.position.zone === "collected"))
        state.inventory.flashlight = (state.inventory.flashlight ?? 0) + portable.amount;
    }
  }
  const budget = { ...state.inventory };
  for (const world of worlds) {
    const entities = Object.values(world.entities);
    for (const entity of entities) entity.inventoryRegistered ??= inventoryRegistered(world, entity);
    // Snapshot ownership before consuming any parent. Its surviving contents still belong to the player.
    const accounted = entities.filter(entity => entity.inventoryRegistered && entity.components.portable?.itemId && (carriedByPlayer(world, entity) || entity.components.position.zone === "collected"));
    for (const entity of accounted) {
      const portable = entity.components.portable!, id = portable.itemId!;
      const owned = Math.min(portable.amount, budget[id] ?? 0);
      budget[id] = Math.max(0, (budget[id] ?? 0) - owned);
      if (!owned) {
        for (const child of childrenOf(world, entity.id)) relocateEntity(world, child, { zone: "player" });
        relocateEntity(world, entity, { zone: "consumed" });
      } else {
        portable.amount = owned;
        if (entity.components.position.zone === "collected") relocateEntity(world, entity, { zone: "player" });
      }
    }
    normalizeHands(world);
  }
}
