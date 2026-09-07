import { ancestors, carriedByPlayer, occludedByContainer, occludedByCover, sealedFromReach, passageBlockers, rootZone, releaseStructureContents } from "./spatial";
import { TextWorldSchema, type TextEntity, type TextWorld, type TextRoom } from "../schemas/text-world";
import { inventoryRegistered } from "./inventory-state";
import { isHeld, normalizeHands } from "./hands";

import { defaultTextRooms, details, subwayZones, upgradeSubwayResidents, upgradeOfficeDoor, upgradeWorldPhysics } from "./definitions";
export { details, subwayZones } from "./definitions";

export function worldRooms(world: TextWorld) {
  const defaults = Object.fromEntries(defaultTextRooms().map(({ entities, ...room }) => [room.id, room]));
  return world.rooms ? Object.fromEntries(Object.entries(world.rooms).map(([id, room]) => [id, { ...room, sensory: room.sensory ?? defaults[id]?.sensory }])) : defaults;
}
export function entityDetails(world: TextWorld, entity: TextEntity) {
  const original = entity.details ?? details[entity.id] ?? { anchor: entity.id, placement: worldRooms(world)[zoneOf(world, entity)]?.name ?? "주변", outline: entity.name, surface: entity.description };
  // Older saves inherit newly authored responses only for unchanged original objects.
  const authored = details[entity.id];
  const resolved = authored && entity.description === authored.surface ? { ...original, responses: original.responses ?? authored.responses } : original;
  const p = entity.components.position, parent = world.entities[p.relativeTo ?? p.zone];
  if (!parent || !p.relation) return entity.components.portal ? { ...resolved, placement: entity.components.portal.to === world.player.zone
    ? worldRooms(world)[entity.components.portal.from].name.split(" · ").at(-1) + "로 통하는 쪽"
    : resolved.placement.split(" / ")[0] } : resolved;
  const relation = { inside: "안", on: "위", beside: "옆", blocking: "앞을 막는 자리" }[p.relation];
  return { ...resolved, anchor: parent.id, placement: parent.name + " " + relation };
}
export function createSubwayTextWorld(rooms: TextRoom[] = defaultTextRooms()): TextWorld {
  rooms = rooms.filter(room => room.locationId === "subway");
  const entities = rooms.flatMap(room => structuredClone(room.entities));
  upgradeOfficeDoor(entities);
  upgradeWorldPhysics(entities);
  return { version: 2, active: true, revision: 0, elapsedSeconds: 0,
    player: { zone: "office", near: null, position: "entrance", facing: null, posture: "standing", heldToolId: null },
    rooms: Object.fromEntries(rooms.map(({ entities, ...room }) => [room.id, structuredClone(room)])),
    entities: Object.fromEntries(entities.map(e => [e.id, e])), observations: {}, visitedZones: [], knowledge: {}, narrated: {}, events: [], recentScenes: [],
    lastIntent: { id: "enter", label: "역무실에 들어선다", importance: "major" },
    lastParagraphs: [rooms.find(room => room.id === "office")!.layout], source: "template", sceneRevision: 0 };
}

/** Instantiate only the supplied location. Content IDs and initial entry come from its room graph. */
export function createLocationTextWorld(rooms: TextRoom[]): TextWorld {
  const entry = rooms[0];
  if (!entry) throw new Error("탐색 구역이 정의되지 않았습니다.");
  return { version: 2, active: false, revision: 0, elapsedSeconds: 0,
    player: { zone: entry.id, near: null, position: "entrance", facing: null, posture: "standing", heldToolId: null, heldItemId: null, focusEntityId: null, manipulating: false },
    rooms: Object.fromEntries(rooms.map(({ entities, ...room }) => [room.id, structuredClone(room)])),
    entities: Object.fromEntries(rooms.flatMap(room => room.entities).map(entity => [entity.id, structuredClone(entity)])),
    observations: {}, visitedZones: [], knowledge: {}, narrated: {}, events: [], recentScenes: [],
    lastIntent: { id: "enter", label: entry.name + "에 들어선다", importance: "major" },
    lastParagraphs: [entry.layout], source: "template", sceneRevision: 0,
  };
}

// Never replace a previously created world with fresh resources on a parse error.
export function migrateTextWorld(raw: unknown): TextWorld | null {
  if (raw == null) return null;
  const old = raw as TextWorld & { version: number; knowledge: Record<string, unknown> };
  if (Number(old.version) !== 1) {
    const world = TextWorldSchema.parse(raw);
    const entities = Object.values(world.entities);
    upgradeWorldPhysics(entities);

    if (upgradeOfficeDoor(entities)) world.entities = Object.fromEntries(entities.map(e => [e.id, e]));
    upgradeSubwayResidents(world);
    for (const entity of entities) if (entity.components.structure?.integrity === 0) releaseStructureContents(world, entity);
    normalizeHands(world);
    return world;
  }
  const observations: TextWorld["observations"] = {};
  const knowledge: TextWorld["knowledge"] = {};
  for (const e of Object.values(old.entities)) {
    const known = Boolean(old.knowledge?.["entity:" + e.id]);
    const interior = Boolean(old.knowledge?.["contents:" + e.id]);
    const collected = e.components.position.zone === "collected" || e.components.position.zone === "player";
    observations[e.id] = { stages: interior ? ["outline", "surface", "interior"] : known || collected ? ["outline", "surface"] : [], collected };
    if (interior && e.components.container) {
      const fact = { id: "contents:" + e.id, kind: "contents", targetId: e.id, data: { name: e.name, items: e.components.container.items.map(id => old.entities[id]).filter(item => item && item.components.position.zone === e.id).map(item => ({ id: item.id, name: item.name, amount: item.components.portable?.amount ?? 1, detail: item.description })) } };
      knowledge[fact.id] = { fact, signature: JSON.stringify(fact.data), observedAt: old.elapsedSeconds };
    }
    if (e.components.container?.items.length === 0) observations[e.id].collected = true;
  }
  const held = Object.values(old.entities).find(e => e.components.light && e.components.position.zone === "player");
  return migrateTextWorld({ ...old, version: 2,
    player: { ...old.player, position: old.player.near ? details[old.player.near]?.anchor ?? "entrance" : "entrance",
      facing: old.player.near, posture: old.player.near === "crate" || old.player.near === "cache" ? "crouching" : "standing", heldToolId: held?.id ?? null },
    observations, visitedZones: [...new Set(["office", old.player.zone])], knowledge, narrated: {}, events: [], recentScenes: [],
    lastIntent: { id: "resume", label: "지금까지 확인한 상태에서 탐색을 이어간다", importance: "minor" },
  });
}
export function zoneOf(world: TextWorld, entity: TextEntity): string {
  return rootZone(world, entity);
}
export function portalBetween(world: TextWorld, from: string, to: string) {
  return Object.values(world.entities).find(e => e.components.portal && [e.components.portal.from, e.components.portal.to].includes(from) && [e.components.portal.from, e.components.portal.to].includes(to));
}
export function adjacentZones(zone: string, world: TextWorld) { return worldRooms(world)[zone]?.neighbors ?? []; }
export function pathOpen(world: TextWorld, from: string, to: string) {
  const portal = portalBetween(world, from, to); return adjacentZones(from, world).includes(to) && (!portal || Boolean(portal.components.openable?.isOpen) && !passageBlockers(world, portal.id).length);
}
export function illuminated(world: TextWorld, zone: string) {
  if (worldRooms(world)[zone]?.light) return true;
  return Object.values(world.entities).some(e => {
    const light = e.components.light;
    if (!light?.on || light.fuelSeconds === 0 || occludedByContainer(world, e)) return false;
    const sourceZone = zoneOf(world, e);
    if (sourceZone === zone) return true;
    return Boolean(light.spill && light.spill >= 0.5 && pathOpen(world, sourceZone, zone));
  });
}
export function carriesLight(world: TextWorld) {
  return Object.values(world.entities).some(e => isHeld(world, e.id) && e.components.light?.on && e.components.light.fuelSeconds !== 0);
}
export function visibleEntities(world: TextWorld) {
  return Object.values(world.entities).filter(e => {
    if (e.components.actor?.active === false) return false;
    if (e.components.position.zone === "player") return true;
    if (e.components.discovery && !world.observations[e.components.discovery.inspectTargetId]?.inspected) return false;
    const parent = world.entities[e.components.position.zone];
    if (occludedByContainer(world, e) || occludedByCover(world, e)) return false;
    if (e.components.portal && [e.components.portal.from, e.components.portal.to].includes(world.player.zone)) return true;
    if (zoneOf(world, e) !== world.player.zone || !illuminated(world, world.player.zone)) return false;
    return !parent || carriedByPlayer(world, e) || ancestors(world, e).some(p => p.id === world.player.near) || world.player.near === e.id;
  });
}
export function canReach(world: TextWorld, entity: TextEntity) {
  if (entity.components.position.zone === "player") return true;
  if (sealedFromReach(world, entity) || occludedByCover(world, entity)) return false;
  const parents = ancestors(world, entity);
  const same = zoneOf(world, entity) === world.player.zone || Boolean(entity.components.portal && [entity.components.portal.from, entity.components.portal.to].includes(world.player.zone));
  const discoveredHere = entity.components.discovery?.inspectTargetId === world.player.near
    && world.observations[world.player.near!]?.inspected && entityDetails(world, entity).anchor === world.player.position;
  return same && (carriedByPlayer(world, entity) || world.player.near === entity.id || discoveredHere || entity.components.position.relation === "beside" && entity.components.position.relativeTo === world.player.near || parents.some(parent => parent.id === world.player.near));
}
export function particle(name: string, consonant: string, vowel: string) {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  const finalIndex = code >= 0 && code <= 11171 ? code % 28 : 0;
  return name + (finalIndex !== 0 && !(consonant === "으로" && finalIndex === 8) ? consonant : vowel);
}


export function hasDoorKey(world: TextWorld, state: { inventory: Record<string, number> }, entity: TextEntity) {
  const keyId = entity.components.openable?.keyId;
  const key = world.entities[keyId ?? ""] ?? Object.values(world.entities).find(e => e.origin?.entityId === keyId && carriedByPlayer(world, e));
  const portable = key?.components.portable;
  return Boolean(portable && (portable.itemId ? (state.inventory[portable.itemId] ?? 0) > 0 : carriedByPlayer(world, key) && inventoryRegistered(world, key)));
}
