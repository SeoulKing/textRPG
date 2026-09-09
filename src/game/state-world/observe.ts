import type { Entity, Fact, Observation, World } from "./model";
import { accessNode, children } from "./world";

export function objectName(world: World, entity: Entity): string {
  const definition = world.definitions.get(entity.definitionId)!;
  const placement = world.placements.get(entity.id)!;
  if (placement.parentId === world.player.inventoryId) return definition.name;
  const host = world.entities.get(placement.parentId);
  const prefix = host ? objectName(world, host) + (placement.relation === "on" ? " 위" : " 안") : entity.placementLabel;
  return (prefix ? prefix + " " : "") + definition.name;
}
function objectFact(world: World, entity: Entity, near: boolean): Fact {
  const def = world.definitions.get(entity.definitionId)!;
  return { id: "object:" + entity.id, kind: "object", targetId: entity.id, name: objectName(world, entity),
    near, portable: def.portable, openable: def.openable, open: def.openable ? entity.open : undefined,
    quantity: entity.quantity, unit: def.unit, nodeId: accessNode(world, entity), description: near ? def.description : undefined };
}
/** Pure, local-room observation. Hidden objects never appear as IDs, names, counts, or reasons. */
export function observe(world: World): Observation {
  const roomId = world.nodes.get(world.player.nodeId)!.roomId;
  const room = world.rooms.get(roomId)!;
  const facts: Fact[] = [{ id: "room:" + roomId, kind: "room", targetId: roomId, name: room.name,
    description: room.atmosphere, status: room.lit ? "visible" : "dark" }];
  const inventory = children(world, world.player.inventoryId).filter(e => e.quantity > 0).map(e => objectFact(world, e, true));
  const visit = (entity: Entity) => {
    if (entity.quantity === 0 || entity.concealed) return;
    const def = world.definitions.get(entity.definitionId)!;
    const near = accessNode(world, entity) === world.player.nodeId;
    if (!def.major && !near) return;
    if (!room.lit) {
      // Remembered fixtures can be located in darkness, but their current state cannot be read.
      if (world.memory.has("object:" + entity.id)) facts.push({ id: "object:" + entity.id, kind: "object", targetId: entity.id,
        name: objectName(world, entity), nodeId: accessNode(world, entity), near, status: "dark" });
      return;
    }
    facts.push(objectFact(world, entity, near));
    if (!def.container && !def.surface) return;
    const placed = children(world, entity.id).filter(e => e.quantity > 0);
    const visible = placed.filter(e => !e.concealed && (world.placements.get(e.id)!.relation === "on" || !def.openable || entity.open));
    const insideClosed = def.container && def.openable && !entity.open;
    // A surface may still show objects while the container below it remains closed.
    const status = !near ? "far" : insideClosed ? "closed" : (entity.contentsOccluded || placed.some(e => e.concealed)) ? (visible.length ? "partial" : "occluded") : visible.length ? "visible" : "empty";
    facts.push({ id: "contents:" + entity.id, kind: "contents", targetId: entity.id, name: objectName(world, entity), status,
      items: near ? visible.map(e => ({ id: e.id, name: world.definitions.get(e.definitionId)!.name, quantity: e.quantity, unit: world.definitions.get(e.definitionId)!.unit })) : [] });
    if (near) visible.forEach(visit);
  };
  children(world, roomId).forEach(visit);
  const exits = new Set<string>();
  for (const node of world.index.roomNodes.get(roomId) ?? []) {
    for (const edge of world.index.edges.get(node) ?? []) {
      const to = edge.from === node ? edge.to : edge.from;
      const otherRoom = world.nodes.get(to)!.roomId;
      if (otherRoom === roomId || exits.has(otherRoom)) continue;
      // Authored doorways are visible landmarks; unknown rooms are not revealed by darkness.
      if (!room.lit && !world.memory.has("exit:" + to)) continue;
      exits.add(otherRoom);
      facts.push({ id: "exit:" + to, kind: "exit", targetId: to, nodeId: to, name: world.rooms.get(otherRoom)!.name });
    }
  }
  return { roomId, nodeId: world.player.nodeId, focusId: world.player.focusId, facts, inventory };
}
export function rememberObservation(world: World, observation: Observation) {
  for (const fact of [...observation.facts, ...observation.inventory]) {
    // Darkness and partial visibility must not replace a previously verified complete fact.
    if (["dark", "far", "closed", "occluded", "partial"].includes(fact.status ?? "")) continue;
    world.memory.set(fact.id, { fact: structuredClone(fact), observedAt: world.elapsedSeconds, revision: world.revision });
  }
}
