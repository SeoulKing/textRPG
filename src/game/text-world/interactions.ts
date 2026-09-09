import type { GameState } from "../schemas";
import type { TextEntity, TextWorld, WorldAction } from "../schemas/text-world";
import { ancestors, carriedByPlayer, childrenOf, containedBy, entityVolume, passageBlockers, relocateEntity, rootZone, totalMass } from "./spatial";
import { canReach, visibleEntities } from "./world";
import { isHeld, releaseHand } from "./hands";

import { inventoryTreeAvailable, transferInventoryOwnership } from "./inventory-state";
export { reconcileWorldInventory } from "./inventory-state";

import { canProvideCover, currentCover, clearCover } from "./spatial";

export const interactionTypes = new Set<WorldAction["type"]>(["PUSH", "PUT", "DROP", "WAIT", "HIDE", "EMERGE"]);
export function validateInteraction(world: TextWorld, state: GameState, action: WorldAction): string | null {
  if (action.type === "WAIT") return Number.isInteger(action.durationSeconds ?? 5) && (action.durationSeconds ?? 5) > 0 && (action.durationSeconds ?? 5) <= 60 ? null : "기다릴 시간은 1초부터 60초까지 정할 수 있다.";
  if (action.type === "EMERGE") return currentCover(world)?.entity.id === action.target ? null : "지금 그 사물에 몸을 숨기고 있지 않다.";
  const source = world.entities[action.target ?? ""];
  if (!source || !visibleEntities(world).some(e => e.id === source.id)) return "지금은 그 대상을 확인할 수 없다.";
  if (!canReach(world, source)) return "먼저 손이 닿는 곳까지 다가가야 한다.";
  const c = source.components;
  if (action.type === "HIDE") {
    const relation = action.relation ?? "behind";
    if (relation !== "under" && relation !== "behind") return "숨을 위치가 올바르지 않다.";
    if (currentCover(world)?.entity.id === source.id && world.player.relation === relation) return "이미 그 자리에 몸을 숨기고 있다.";
    return canProvideCover(world, source, relation) ? null : "그 위치에는 몸을 숨길 공간이 없다.";
  }
  if (action.type === "PUSH") {
    if (!c.physical?.movable || c.position.zone === "player" || ancestors(world, source).length) return "지금 배치된 자리에서는 밀어 옮길 수 없다.";
    if (totalMass(world, source) > (world.player.pushCapacity ?? 40)) return "내용물까지 합친 무게가 무거워 밀어 옮길 수 없다.";
  } else {
    if (!c.portable || !isHeld(world, source.id)) return "먼저 지닌 물건을 손에 들어야 한다.";
    if (!inventoryTreeAvailable(world, state, source)) return "지금 지닌 수량이 부족하다.";
  }
  if (action.type === "DROP") return null;
  const destination = world.entities[action.destination ?? ""];
  if (!destination || destination.id === source.id || containedBy(world, destination, source.id) || !visibleEntities(world).some(e => e.id === destination.id)) return "옮길 자리를 확인할 수 없다.";
  if (rootZone(world, destination) !== world.player.zone && !destination.components.portal) return "같은 공간 안에서 옮길 자리를 골라야 한다.";
  if (action.type === "PUSH") {
    if (action.relation !== "beside" && action.relation !== "blocking") return "옮긴 뒤 놓일 관계를 정해야 한다.";
    if (action.relation === "blocking" && (!destination.components.portal || !c.physical?.blocksPassage)) return "그 사물로 이곳의 통로를 막을 수 없다.";
    if (action.relation === "blocking" && passageBlockers(world, destination.id).some(e => e.id !== source.id)) return "이미 다른 사물이 그 자리를 막고 있다.";
    return null;
  }
  if (!canReach(world, destination)) return "물건을 놓을 곳까지 먼저 다가가야 한다.";
  if (destination.components.structure?.integrity === 0) return "부서진 구조는 물건을 담거나 받칠 수 없다.";
  if (action.relation === "inside") {
    const container = destination.components.container;
    if (!container || destination.components.openable?.isOpen === false) return "열린 보관 공간이 필요하다.";
    const occupied = childrenOf(world, destination.id).filter(e => e.components.position.relation !== "on").reduce((sum, e) => sum + entityVolume(e), 0);
    return occupied + entityVolume(source) <= (container.capacity ?? Infinity) ? null : "안에 물건을 놓을 공간이 부족하다.";
  }
  if (action.relation === "on") {
    const cover = currentCover(world);
    if (cover?.relation === "under" && cover.entity.id === destination.id) return "먼저 아래에서 나와 물건을 놓을 표면에 손을 뻗어야 한다.";
    const capacity = destination.components.physical?.supportCapacity;
    if (capacity === undefined) return "물건을 받칠 수 있는 표면이 아니다.";
    const supported = childrenOf(world, destination.id).filter(e => e.components.position.relation === "on").reduce((sum, e) => sum + totalMass(world, e), 0);
    return supported + totalMass(world, source) <= capacity ? null : "표면이 그 무게를 받칠 수 없다.";
  }
  return "물건을 안에 넣을지 위에 놓을지 정해야 한다.";
}
export function applyInteraction(world: TextWorld, state: GameState, action: WorldAction) {
  if (action.type === "WAIT") return { before: {}, after: { durationSeconds: action.durationSeconds ?? 5 } };
  const source = world.entities[action.target!]!;
  if (action.type === "EMERGE") {
    const before = { relation: world.player.relation, coverId: source.id, posture: world.player.posture };
    clearCover(world);
    return { before, after: { name: source.name, relation: "near", posture: world.player.posture } };
  }
  if (action.type === "HIDE") {
    const before = { relation: world.player.relation, coverId: world.player.coverId, posture: world.player.posture };
    world.player.posture = "crouching";
    world.player.relation = (action.relation ?? "behind") as "behind" | "under"; world.player.coverId = source.id;
    world.player.near = source.id; world.player.facing = source.id;
    return { before, after: { relation: world.player.relation, coverId: source.id, name: source.name, posture: "crouching" } };
  }
  const destination = world.entities[action.destination ?? ""];
  const before = { ...source.components.position, name: source.name };
  let transfer: ReturnType<typeof transferInventoryOwnership> | undefined;
  if (action.type === "PUSH") {
    relocateEntity(world, source, { zone: world.player.zone, relativeTo: destination.id, relation: action.relation as "blocking" | "beside" });
    world.player.near = source.id; world.player.position = destination.id; world.player.facing = source.id;
    world.player.relation = "near"; world.player.coverId = null;
  } else {
    const near = visibleEntities(world).some(e => e.id === world.player.near) ? world.player.near : null;
    transfer = transferInventoryOwnership(world, state, source, action.type === "DROP" ? { zone: world.player.zone, ...(near ? { relativeTo: near, relation: "beside" as const } : {}) }
      : { zone: destination.id, relation: action.relation as "inside" | "on" });
    releaseHand(world, source.id);
    if (world.player.focusEntityId === source.id) world.player.focusEntityId = destination?.id ?? null;
    world.observations[source.id] ??= { stages: ["outline", "surface"], collected: false };
    world.observations[source.id].collected = false;
    if (destination && world.observations[destination.id]) world.observations[destination.id].collected = false;
  }
  return { before, after: { ...source.components.position, name: source.name, destinationName: destination?.name, amount: source.components.portable?.amount, itemId: source.components.portable?.itemId, ...transfer } };
}
