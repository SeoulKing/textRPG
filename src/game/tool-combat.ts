import { baseItems } from "./data/items";
import { buildRuntimeRegistry } from "./runtime-registry";
import type { GameState, ItemCard } from "./schemas";
import type { ItemCombat } from "./schemas/item";

export type CombatTool = Pick<ItemCard, "id" | "name" | "maxDurability"> & { combat: Exclude<ItemCombat, { kind: "none" }> };
/** The definition remains available after wear, so the last swing retains its pre-use damage. */
export function combatTool(state: GameState, itemId: string): CombatTool | undefined {
  const item = buildRuntimeRegistry(state).items[itemId] as ItemCard | undefined;
  if (!item || item.kind !== "tool") return;
  const base = baseItems[itemId as keyof typeof baseItems];
  const configured = item.combat ?? base?.combat;
  if (configured?.kind === "none") return;
  if (configured) return { id: item.id, name: item.name, maxDurability: item.maxDurability, combat: configured };
  const capabilities = item.toolCapabilities ?? base?.toolCapabilities;
  const power = Math.max(capabilities?.cut ?? 0, capabilities?.strike ?? 0);
  if (power <= 0) return; // A light or a prying-only tool is not silently treated as a weapon.
  return { id: item.id, name: item.name, maxDurability: item.maxDurability,
    combat: { kind: "attack", hitChance: 80, damage: Math.min(5, 1 + power), counterChance: 65 } };
}
