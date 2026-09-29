import type { TextEntity, TextWorld } from "../schemas/text-world";

/** Position.zone is the owner (a room, a container/support, or the player). */
export function ancestors(world: TextWorld, entity: TextEntity): TextEntity[] {
  const seen = new Set([entity.id]), result: TextEntity[] = [];
  let parent = world.entities[entity.components.position.zone];
  while (parent) {
    if (seen.has(parent.id)) throw new Error("사물의 포함 관계가 순환합니다: " + entity.id);
    seen.add(parent.id); result.push(parent);
    parent = world.entities[parent.components.position.zone];
  }
  return result;
}
export function rootZone(world: TextWorld, entity: TextEntity): string {
  const chain = ancestors(world, entity);
  const zone = (chain.at(-1) ?? entity).components.position.zone;
  return zone === "player" ? world.player.zone : zone;
}
export function childrenOf(world: TextWorld, id: string) {
  return Object.values(world.entities).filter(e => e.components.position.zone === id);
}
export function containedBy(world: TextWorld, entity: TextEntity, id: string) {
  return ancestors(world, entity).some(e => e.id === id);
}
export function carriedByPlayer(world: TextWorld, entity: TextEntity) {
  return (ancestors(world, entity).at(-1) ?? entity).components.position.zone === "player";
}
export function sealedFromReach(world: TextWorld, entity: TextEntity) {
  let child = entity;
  for (const parent of ancestors(world, entity)) {
    if (child.components.position.relation !== "on" && parent.components.openable?.isOpen === false) return true;
    child = parent;
  }
  return false;
}
export function occludedByCover(world: TextWorld, entity: TextEntity) {
  const cover = currentCover(world);
  if (!cover) return false;
  if (cover.relation === "under") return entity.components.position.zone === cover.entity.id && entity.components.position.relation === "on";
  return cover.entity.components.position.relation === "blocking" && cover.entity.components.position.relativeTo === entity.id;
}
export function occludedByContainer(world: TextWorld, entity: TextEntity) {
  let child = entity;
  for (const parent of ancestors(world, entity)) {
    if (child.components.position.relation !== "on" && parent.components.openable && !parent.components.openable.isOpen && parent.components.physical?.opaque !== false) return true;
    child = parent;
  }
  return false;
}
export function passageBlockers(world: TextWorld, portalId: string) {
  return Object.values(world.entities).filter(e => e.components.position.relativeTo === portalId && e.components.position.relation === "blocking" && e.components.physical?.blocksPassage);
}
export function totalMass(world: TextWorld, entity: TextEntity): number {
  // Validate ancestry before recursion, including malformed saved or authored graphs.
  ancestors(world, entity);
  return (entity.components.physical?.mass ?? 1) + childrenOf(world, entity.id).reduce((sum, child) => sum + totalMass(world, child), 0);
}
export function entityVolume(entity: TextEntity) {
  return entity.components.physical?.volume ?? entity.components.portable?.amount ?? 1;
}
export function relocateEntity(world: TextWorld, entity: TextEntity, position: TextEntity["components"]["position"]) {
  const destination = world.entities[position.zone];
  if (destination && (destination.id === entity.id || containedBy(world, destination, entity.id))) throw new Error("자신의 안쪽으로 사물을 옮길 수 없습니다.");
  const previous = world.entities[entity.components.position.zone];
  if (previous?.components.container) previous.components.container.items = previous.components.container.items.filter(id => id !== entity.id);
  entity.components.position = { ...position };
  // Moving furniture never carries a hidden player along with it.
  if (world.player.coverId === entity.id) clearCover(world);
  if (destination?.components.container && position.relation !== "on" && !destination.components.container.items.includes(entity.id)) destination.components.container.items.push(entity.id);
}

/** A destroyed surface can neither contain nor support its former contents. */
export function releaseStructureContents(world: TextWorld, target: TextEntity) {
  const releasedIds = [];
  for (const child of childrenOf(world, target.id)) {
    relocateEntity(world, child, { zone: rootZone(world, target), relativeTo: target.id, relation: "beside" });
    releasedIds.push(child.id);
  }
  return releasedIds;
}

/** Cover requires an intact, opaque object large enough for a crouching person. */
export type CoverRelation = "behind" | "under";
export function coverRelations(entity: TextEntity): CoverRelation[] {
  const c = entity.components;
  return c.physical?.coverRelations ?? ((c.physical?.providesCover ?? (c.physical?.movable || c.position.relation === "blocking")) ? ["behind"] : []);
}
export function canProvideCover(world: TextWorld, entity: TextEntity, relation: CoverRelation = "behind") {
  const c=entity.components;
  return Boolean(c.physical?.opaque && c.physical.volume>=5 && coverRelations(entity).includes(relation) && c.position.zone===world.player.zone && c.structure?.integrity!==0);
}
export function currentCover(world: TextWorld) {
  const entity = world.entities[world.player.coverId ?? ""], relation = world.player.relation;
  return entity && (relation === "behind" || relation === "under") && world.player.posture === "crouching"
    && world.player.near === entity.id && canProvideCover(world, entity, relation) ? { entity, relation } : undefined;
}
export function clearCover(world: TextWorld) { world.player.relation = "near"; world.player.coverId = null; }
export function normalizeCover(world: TextWorld) {
  if ((world.player.coverId || world.player.relation === "under" || world.player.relation === "behind") && !currentCover(world)) clearCover(world);
}
export function coverLocation(relation: CoverRelation) { return relation === "under" ? "아래" : "뒤"; }
