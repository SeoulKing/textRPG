import type { GameState } from "./schemas";
import type { TextEntity } from "./schemas/text-world";
/** Expedition goods remain provisional until return; their physical identity survives that transfer. */
export function itemLedger(state: GameState, entity: TextEntity) {
  return entity.expeditionLoot ? state.subwayExpedition.carriedLoot : state.inventory;
}
export function playerItemAmount(state: GameState, itemId: string) {
  return (state.inventory[itemId] ?? 0) + (state.subwayExpedition.active ? state.subwayExpedition.carriedLoot[itemId] ?? 0 : 0);
}
export function playerItemIds(state: GameState) {
  return [...new Set([...Object.keys(state.inventory), ...(state.subwayExpedition.active ? Object.keys(state.subwayExpedition.carriedLoot) : [])])].sort();
}
