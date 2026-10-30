import type { GameState, ItemCard } from "../schemas";
import type { TextWorld, WorldAction } from "../schemas/text-world";
import { buildRuntimeRegistry } from "../runtime-registry";
import { applyEffect, changeSurvivalStat } from "../state-utils";
import { carriedByPlayer } from "./spatial";
import { reconcileWorldInventory } from "./inventory-state";
import { toolProfile } from "./tool-rules";

function materialCosts(materials: { itemId: string; amount: number }[]) {
  const totals = new Map<string, number>();
  for (const cost of materials) totals.set(cost.itemId, (totals.get(cost.itemId) ?? 0) + cost.amount);
  return [...totals].map(([itemId, amount]) => ({ itemId, amount }));
}
export function validateRepair(world: TextWorld, state: GameState, action: WorldAction): string | null {
  const target = world.entities[action.target ?? ""], structure = target?.components.structure, recipe = structure?.repair;
  if (!structure || !recipe || structure.integrity >= structure.maxIntegrity) return "손볼 수 있는 손상이 없다.";
  if (structure.integrity === 0 && target.components.physical && !structure.intactPhysical) return "복원할 원래 구조의 정보가 없다.";
  if (carriedByPlayer(world, target)) return "대상을 먼저 내려놓아야 한다.";
  if (target.components.stockNode) return "고정 재고는 이 방법으로 수리할 수 없다.";
  if (state.stats.energy < recipe.energy) return "수리할 기력이 부족하다.";
  const registry = buildRuntimeRegistry(state);
  if (materialCosts(recipe.materials).some(cost => !registry.items[cost.itemId] || (state.inventory[cost.itemId] ?? 0) < cost.amount)) return "수리에 필요한 재료가 부족하다.";
  if (recipe.tool) {
    const tool = toolProfile(state, action.toolItemId ?? "");
    if (!tool || (tool.toolCapabilities?.[recipe.tool.capability] ?? 0) < recipe.tool.power) return "수리에 맞는 도구가 필요하다.";
    if (tool.maxDurability && (state.toolDurability[tool.id] ?? tool.maxDurability) <= 0) return "도구가 닳아 사용할 수 없다.";
  } else if (action.toolItemId) return "이 수리는 도구를 쓰지 않는다.";
  return null;
}

export function applyRepair(world: TextWorld, state: GameState, action: WorldAction) {
  const target = world.entities[action.target!], structure = target.components.structure!, recipe = structure.repair!;
  const before = { integrity: structure.integrity, destroyed: structure.integrity === 0 };
  const registry = buildRuntimeRegistry(state), inventoryDelta: Record<string, number> = {};
  const materials = materialCosts(recipe.materials).map(cost => ({ ...cost, name: (registry.items[cost.itemId] as ItemCard).name }));
  for (const cost of materials) {
    applyEffect({ type: "remove_item", itemId: cost.itemId, amount: cost.amount }, state);
    inventoryDelta[cost.itemId] = -cost.amount;
  }
  const tool = action.toolItemId ? toolProfile(state, action.toolItemId) : undefined;
  if (tool?.maxDurability) applyEffect({ type: "damage_tool", itemId: tool.id, amount: 1 }, state);
  changeSurvivalStat(state, "energy", -recipe.energy);
  // Old broken saves predate breakCount. Never reuse their first salvage generation.
  if (before.destroyed) structure.breakCount ??= 1;
  structure.integrity = structure.maxIntegrity;
  if (before.destroyed && structure.intactPhysical) target.components.physical = structuredClone(structure.intactPhysical);
  // The frame is repaired; the old contents and key lock are not recreated.
  reconcileWorldInventory(state);
  return { before, after: { name: target.name, integrity: structure.integrity, rebuilt: before.destroyed,
    effort: recipe.effort, materials, inventoryDelta, toolName: tool?.name,
    toolBroken: Boolean(tool && !(state.inventory[tool.id] > 0)), energyCost: recipe.energy,
    isOpen: target.components.openable?.isOpen, lockBroken: target.components.openable?.lockBroken } };
}
