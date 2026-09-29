import type { ContentRegistry, GameState } from "../schemas";
import { syncBoundStockNodes } from "./stock-nodes";
export { hasSubwayStockBinding, isSubwayStockMenuAction, withSubwayStockRooms } from "./subway-stock-definitions";

/** Add only missing stock hosts to an existing room; placement, doors and ownership remain saved state. */
export function syncSubwayStockWorld(state: GameState, registry: ContentRegistry) {
  const world = state.textWorld;
  if (state.location !== "subway" || !world) return false;
  let added = false;
  for (const room of registry.textRooms?.filter(r => r.locationId === "subway") ?? []) {
    if (!world.rooms?.[room.id]) continue;
    for (const entity of room.entities.filter(e => e.components.stockNode)) {
      if (world.entities[entity.id] || Object.values(world.entities).some(e => e.components.stockNode?.nodeId === entity.components.stockNode!.nodeId)) continue;
      world.entities[entity.id] = structuredClone(entity);added = true;
    }
  }
  syncBoundStockNodes(state, registry, world);
  return added;
}
