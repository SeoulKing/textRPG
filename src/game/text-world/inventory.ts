import type { GameState, ContentRegistry, ItemCard } from "../schemas";
import type { TextWorld } from "../schemas/text-world";
import { normalizeHands } from "./hands";
import { carriedByPlayer } from "./spatial";
import { reconcileWorldInventory } from "./interactions";

/** Physical carried objects follow the player. Inventory numbers are never awarded by a transfer. */
export function transferCarriedEntities(state: GameState, destination: TextWorld) {
  reconcileWorldInventory(state);
  const worlds: [string, TextWorld][] = [
    ...(state.textWorld ? [["subway", state.textWorld] as [string, TextWorld]] : []),
    ...Object.entries(state.locationTextWorlds),
  ];
  const destinationId = worlds.find(([, world]) => world === destination)?.[0];
  for (const [worldId, source] of worlds) {
    if (source === destination) continue;
    const carried = Object.values(source.entities).filter(e => carriedByPlayer(source, e));
    const ids = new Map<string, string>();
    for (const entity of carried) {
      entity.origin ??= { worldId, entityId: entity.id };
      const preferred = entity.origin.worldId === destinationId ? entity.origin.entityId : entity.id;
      const occupied = destination.entities[preferred];
      const id = occupied ? "carried:" + entity.origin.worldId + ":" + entity.origin.entityId : preferred;
      if (destination.entities[id]) throw new Error("휴대 물건의 식별자가 중복되었습니다.");
      ids.set(entity.id, id);
    }
    for (const entity of carried) {
      const previousId = entity.id, id = ids.get(previousId)!;
      entity.id = id;
      const c = entity.components;
      if (ids.has(c.position.zone)) c.position.zone = ids.get(c.position.zone)!;
      if (c.position.relativeTo && ids.has(c.position.relativeTo)) c.position.relativeTo = ids.get(c.position.relativeTo);
      if (c.container) c.container.items = c.container.items.map(child => ids.get(child) ?? child);
      if (c.discovery) delete c.discovery; // Carried discoveries are already known; the old room's prerequisite does not travel.
      destination.entities[id] = entity;
      if (source.observations[previousId]) destination.observations[id] = structuredClone(source.observations[previousId]);
      if (source.player.heldToolId === previousId) { destination.player.heldToolId = id; source.player.heldToolId = null; }
      if (source.player.heldItemId === previousId) { destination.player.heldItemId = id; source.player.heldItemId = null; }
      if (source.player.focusEntityId === previousId) source.player.focusEntityId = null;
      if (source.player.placementTargetId === previousId) source.player.placementTargetId = null;
      delete source.entities[previousId];
    }
    source.player.manipulating = false;
    normalizeHands(source);
  }
  normalizeHands(destination);
}

/** Give already-owned, nonphysical recipe outputs a world identity without awarding inventory. */
export function materializeOwnedInventory(state: GameState, world: TextWorld, registry: ContentRegistry) {
  const represented: Record<string, number> = {};
  for (const entity of Object.values(world.entities)) if (entity.inventoryRegistered && !entity.expeditionLoot && entity.components.portable?.itemId && carriedByPlayer(world, entity)) {
    const item = entity.components.portable;represented[item.itemId!] = (represented[item.itemId!] ?? 0) + item.amount;
  }
  for (const itemId of Object.keys(state.inventory).sort()) {
    const amount = state.inventory[itemId] - (represented[itemId] ?? 0), item = registry.items[itemId] as ItemCard | undefined;
    if (amount <= 0 || !item) continue;
    let sequence = 0, id = "owned:" + itemId + ":" + world.revision;
    while (world.entities[id]) id = "owned:" + itemId + ":" + world.revision + ":" + (++sequence);
    world.entities[id] = { id, name: item.name, description: item.name, inventoryRegistered: true,
      ...(item.maxDurability ? { toolDurability: state.toolDurability[itemId] ?? item.maxDurability } : {}),
      components: { position: { zone: "player" }, portable: { itemId, amount } } };
    world.observations[id] = { stages: ["outline", "surface"], collected: true };
  }
}
