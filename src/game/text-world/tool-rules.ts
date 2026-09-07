import type { GameState, ItemCard } from "../schemas";
import type { TextEntity, TextWorld, WorldAction } from "../schemas/text-world";
import { baseItems } from "../data/items";
import { buildRuntimeRegistry } from "../runtime-registry";
import { applyEffect, changeSurvivalStat } from "../state-utils";
import { carriedByPlayer, rootZone, releaseStructureContents } from "./spatial";
import { normalizeHands } from "./hands";
import { inventoryRegistered, reconcileWorldInventory } from "./inventory-state";


export type ToolTechnique = "pry" | "cut" | "strike";
export const toolTechniques = {
  pry: { seconds: 20, energy: 1, wear: 1, noise: "잠금장치가 비틀리는 소리가 난다.", intensity: .65 },
  cut: { seconds: 15, energy: 1, wear: 1, noise: "날이 재료를 가르는 소리가 난다.", intensity: .3 },
  strike: { seconds: 20, energy: 2, wear: 1, noise: "단단한 충격음이 주변으로 퍼진다.", intensity: 1 },
} satisfies Record<ToolTechnique, { seconds: number; energy: number; wear: number; noise: string; intensity: number }>;

type ToolProfile = Pick<ItemCard, "id" | "name" | "description" | "kind" | "maxDurability" | "toolCapabilities">;
export function toolProfile(state: GameState, itemId: string): ToolProfile | undefined {
  const item = buildRuntimeRegistry(state).items[itemId] as ToolProfile | undefined;
  if (!item || item.kind !== "tool" || !(state.inventory[itemId] > 0)) return;
  return { ...item, toolCapabilities: item.toolCapabilities ?? (baseItems[itemId as keyof typeof baseItems] as ToolProfile | undefined)?.toolCapabilities };
}
export function availableToolProfiles(state: GameState) {
  return Object.keys(state.inventory).sort().map(id => toolProfile(state, id)).filter((item): item is ToolProfile => Boolean(item?.toolCapabilities));
}
export function validateToolUse(world: TextWorld, state: GameState, action: WorldAction): string | null {
  const target = world.entities[action.target ?? ""], structure = target?.components.structure;
  const tool = toolProfile(state, action.toolItemId ?? ""), technique = action.technique;
  if (!tool || !technique || !tool.toolCapabilities?.[technique]) return "이 도구로 할 수 있는 작업이 아니다.";
  if (!structure || structure.integrity <= 0) return "더 조작할 온전한 구조가 남아 있지 않다.";
  if (carriedByPlayer(world, target)) return "대상을 먼저 바닥이나 받침에 내려놓아야 한다.";
  if (target.components.stockNode) return "고정 재고는 이 방법으로 해체할 수 없다.";
  if (tool.maxDurability && (state.toolDurability[tool.id] ?? tool.maxDurability) <= 0) return "도구가 닳아 사용할 수 없다.";
  if (state.stats.energy < toolTechniques[technique].energy) return "작업을 마칠 기력이 부족하다.";
  if (technique === "pry" && !target.components.openable?.locked) return "벌려서 풀 잠금장치가 없다.";
  if (technique === "cut" && !["wood", "fabric"].includes(structure.material)) return "이 재질은 날로 자를 수 없다.";
  if (technique === "strike" && structure.material === "fabric") return "유연한 천 구조는 충격만으로 부술 수 없다.";
  if (tool.toolCapabilities[technique]! < structure.resistance) return "이 도구로는 구조를 손상시킬 힘이 부족하다.";
  return null;
}
/** Reify an already owned crafted tool without granting another inventory item. */
export function materializeTool(world: TextWorld, state: GameState, itemId: string): TextEntity {
  const existing = Object.values(world.entities).find(e => e.components.portable?.itemId === itemId && carriedByPlayer(world, e) && inventoryRegistered(world, e));
  if (existing) return existing;
  const item = toolProfile(state, itemId);
  if (!item) throw new Error("가지고 있는 도구가 아닙니다.");
  let id = "tool:" + itemId, suffix = 1;
  while (world.entities[id]) id = "tool:" + itemId + ":" + suffix++;
  const entity: TextEntity = { id, name: item.name, description: item.description, inventoryRegistered: true, toolDurability: state.toolDurability[itemId] ?? item.maxDurability,
    components: { position: { zone: "player" }, portable: { itemId, amount: 1 } } };
  world.entities[id] = entity;
  world.observations[id] = { stages: ["outline", "surface"], collected: true };
  return entity;
}
/** Shared material rules: no room IDs, reward rolls, or LLM decisions. */
export function applyToolUse(world: TextWorld, state: GameState, action: WorldAction) {
  const target = world.entities[action.target!], structure = target.components.structure!, technique = action.technique!;
  const tool = toolProfile(state, action.toolItemId!)!, method = toolTechniques[technique];
  const before = { integrity: structure.integrity, locked: target.components.openable?.locked, toolDurability: state.toolDurability[tool.id] ?? tool.maxDurability };
  if (technique === "pry") target.components.openable!.lockBroken = true;
  else structure.integrity = Math.max(0, structure.integrity - (tool.toolCapabilities![technique]! - structure.resistance + 1));
  const destroyed = structure.integrity === 0, opened = destroyed || technique === "pry";
  if (opened && target.components.openable) {
    if (destroyed && (target.components.openable.keyId || target.components.openable.locked)) target.components.openable.lockBroken = true;
    Object.assign(target.components.openable, { locked: false, isOpen: true });
    if (destroyed) delete target.components.openable.remainingOpenSeconds;
    else if (target.components.openable.autoCloseSeconds) target.components.openable.remainingOpenSeconds = target.components.openable.autoCloseSeconds;
    if (world.observations[target.id]) delete world.observations[target.id].blocked;
  }
  if (destroyed) {
    structure.breakCount = (structure.breakCount ?? 0) + 1;
    if (target.components.physical) {
      structure.intactPhysical ??= structuredClone(target.components.physical);
      Object.assign(target.components.physical, { opaque: false, blocksPassage: false, movable: false, supportCapacity: undefined });
    }
  }
  const revealedIds: string[] = destroyed ? releaseStructureContents(world, target) : [], salvage = [];
  if (destroyed) for (const drop of structure.salvage) {
    const item = buildRuntimeRegistry(state).items[drop.itemId] as Pick<ItemCard, "name" | "description">;
    const id = "salvage:" + target.id + ":" + drop.itemId + (structure.breakCount! > 1 ? ":" + structure.breakCount : "");
    if (world.entities[id]) continue;
    world.entities[id] = { id, name: item.name, description: item.description, inventoryRegistered: false,
      details: { anchor: target.details?.anchor ?? target.id, placement: target.name + "의 부서진 자리", outline: item.name, surface: item.description },
      components: { position: { zone: rootZone(world, target) }, discovery: { inspectTargetId: target.id }, portable: { itemId: drop.itemId, amount: drop.amount } } };
    world.observations[target.id] ??= { stages: ["outline", "surface"], collected: false };
    world.observations[target.id].inspected = true;
    revealedIds.push(id);salvage.push({ id, name: item.name, amount: drop.amount });
  }
  changeSurvivalStat(state, "energy", -method.energy);
  if (tool.maxDurability) applyEffect({ type: "damage_tool", itemId: tool.id, amount: method.wear }, state);
  reconcileWorldInventory(state);
  // Projections have an independent world object, so reconcile its consumed tool too.
  if (!(state.inventory[tool.id] > 0)) for (const entity of Object.values(world.entities)) {
    if (entity.components.portable?.itemId === tool.id && carriedByPlayer(world, entity)) entity.components.position = { zone: "consumed" };
  }
  normalizeHands(world);
  return { before, after: { name: target.name, toolName: tool.name, technique, material: structure.material,
    integrity: structure.integrity, destroyed, opened: Boolean(opened && target.components.openable), portal: Boolean(target.components.portal), lockBroken: target.components.openable?.lockBroken,
    energyCost: method.energy, toolDurability: state.toolDurability[tool.id] ?? 0, toolBroken: !(state.inventory[tool.id] > 0), salvage, revealedIds },
    sound: { sourceId: target.id, zone: rootZone(world, target), description: method.noise, remainingSeconds: method.seconds + 12, intensity: method.intensity } };
}
