import { SnapshotSchema, type Snapshot, type World, type Entity, type Placement } from "./model";

function unique<T extends { id: string }>(values: T[]) {
  const map = new Map(values.map(value => [value.id, value]));
  if (map.size !== values.length) throw new Error("중복된 ID입니다.");
  return map;
}

/** Full integrity checks run at the content/save boundary. Commands validate only their affected subgraph. */
export function restoreWorld(raw: unknown): World {
  const data = SnapshotSchema.parse(raw);
  const world: World = {
    ...data, definitions: unique(data.definitions), entities: unique(data.entities), rooms: unique(data.rooms),
    nodes: unique(data.nodes), edges: unique(data.edges),
    placements: new Map(data.placements.map(p => [p.entityId, p])),
    memory: new Map(data.memory.map(m => [m.fact.id, m])), narrated: new Map(data.narrated),
    index: { children: new Map(), edges: new Map(), roomNodes: new Map() },
  };
  if (world.placements.size !== data.placements.length || world.entities.size !== world.placements.size) throw new Error("객체마다 부모가 하나 필요합니다.");
  const ids = [...world.entities.keys(), ...world.rooms.keys(), ...world.nodes.keys(), world.player.inventoryId];
  if (new Set(ids).size !== ids.length) throw new Error("공간과 객체 ID가 겹칩니다.");
  if (!world.nodes.has(world.player.nodeId) || world.player.focusId && !world.entities.has(world.player.focusId)) throw new Error("플레이어 위치 또는 관심 대상이 없습니다.");
  for (const node of world.nodes.values()) {
    if (!world.rooms.has(node.roomId)) throw new Error("이동 지점의 방이 없습니다.");
    world.index.roomNodes.set(node.roomId, [...(world.index.roomNodes.get(node.roomId) ?? []), node.id]);
  }
  for (const entity of world.entities.values()) {
    const definition = world.definitions.get(entity.definitionId);
    if (!definition) throw new Error("사물 정의가 없습니다.");
    if (definition.openable && (entity.open === undefined || entity.locked === undefined) || entity.open && entity.locked) throw new Error("잘못된 개폐 상태입니다.");
    if (entity.keyDefinitionId && !world.definitions.has(entity.keyDefinitionId)) throw new Error("열쇠 정의가 없습니다.");
    if (entity.accessNodeId && !world.nodes.has(entity.accessNodeId)) throw new Error("접근 지점이 없습니다.");
    const placement = world.placements.get(entity.id)!;
    validatePlacement(world, placement);
    const room = roomOf(world, entity.id);
    if (world.rooms.has(placement.parentId) && entity.accessNodeId && world.nodes.get(entity.accessNodeId)!.roomId !== room) throw new Error("접근 지점과 배치된 방이 다릅니다.");
    if (world.rooms.has(placement.parentId) && !entity.accessNodeId) throw new Error("방에 직접 놓인 사물에는 접근 지점이 필요합니다.");
    addChild(world, placement);
  }
  for (const edge of world.edges.values()) {
    if (!world.nodes.has(edge.from) || !world.nodes.has(edge.to)) throw new Error("이동 경로의 지점이 없습니다.");
    if (edge.gateId && !world.definitions.get(world.entities.get(edge.gateId)?.definitionId ?? "")?.openable) throw new Error("통행 조건의 문이 없습니다.");
    for (const nodeId of [edge.from, edge.to]) world.index.edges.set(nodeId, [...(world.index.edges.get(nodeId) ?? []), edge]);
  }
  if (world.memory.size !== data.memory.length || world.narrated.size !== data.narrated.length) throw new Error("중복된 관측 기록입니다.");
  for (const memory of world.memory.values()) {
    if (![world.entities, world.rooms, world.nodes].some(map => map.has(memory.fact.targetId)) ||
      memory.fact.items?.some(item => !world.entities.has(item.id)) || memory.observedAt > world.elapsedSeconds || memory.revision > world.revision) throw new Error("잘못된 관측 기록입니다.");
  }
  unique(world.events);
  for (const event of world.events) {
    if (event.at < world.elapsedSeconds || event.type === "light" && !world.rooms.has(event.roomId) || event.type === "close" && !world.definitions.get(world.entities.get(event.targetId)?.definitionId ?? "")?.openable) throw new Error("잘못된 예약 사건입니다.");
  }
  world.events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return world;
}

export function validatePlacement(world: World, placement: Placement) {
  const entity = world.entities.get(placement.entityId);
  if (!entity) throw new Error("배치할 객체가 없습니다.");
  const seen = new Set([entity.id]);
  let parent = placement.parentId;
  while (world.entities.has(parent)) {
    if (seen.has(parent)) throw new Error("포함 관계는 순환할 수 없습니다.");
    seen.add(parent);
    const next = world.placements.get(parent);
    if (!next) throw new Error("부모 배치가 없습니다.");
    parent = next.parentId;
  }
  if (!world.rooms.has(parent) && parent !== world.player.inventoryId) throw new Error("배치 대상이 없습니다.");
  if (placement.parentId === world.player.inventoryId && !world.definitions.get(entity.definitionId)?.portable) throw new Error("고정 사물은 소지할 수 없습니다.");
  const host = world.entities.get(placement.parentId);
  if (host) {
    const def = world.definitions.get(host.definitionId)!;
    if (placement.relation === "on" ? !def.surface : !def.container) throw new Error("지원하지 않는 배치 관계입니다.");
  } else if (placement.relation !== "in") throw new Error("방과 인벤토리에는 in 관계를 사용합니다.");
}
function addChild(world: World, placement: Placement) {
  const set = world.index.children.get(placement.parentId) ?? new Set<string>();
  set.add(placement.entityId); world.index.children.set(placement.parentId, set);
}
export function relocate(world: World, placement: Placement) {
  validatePlacement(world, placement);
  const old = world.placements.get(placement.entityId)!;
  world.index.children.get(old.parentId)?.delete(placement.entityId);
  world.placements.set(placement.entityId, placement); addChild(world, placement);
}
export function roomOf(world: World, entityId: string): string {
  let parent = world.placements.get(entityId)?.parentId;
  const visited = new Set<string>();
  while (parent && world.entities.has(parent)) {
    if (visited.has(parent)) throw new Error("포함 관계는 순환할 수 없습니다.");
    visited.add(parent); parent = world.placements.get(parent)?.parentId;
  }
  return parent === world.player.inventoryId ? world.nodes.get(world.player.nodeId)!.roomId : parent ?? "";
}
export function accessNode(world: World, entity: Entity): string {
  const parent = world.placements.get(entity.id)!.parentId;
  if (parent === world.player.inventoryId) return world.player.nodeId;
  const host = world.entities.get(parent);
  return host ? accessNode(world, host) : entity.accessNodeId!;
}
export function children(world: World, parent: string) {
  return [...(world.index.children.get(parent) ?? [])].sort().map(id => world.entities.get(id)!);
}
export function reachable(world: World) {
  const costs = new Map<string, number>([[world.player.nodeId, 0]]);
  const pending = new Set([world.player.nodeId]);
  const currentRoom = world.nodes.get(world.player.nodeId)!.roomId;
  while (pending.size) {
    const from = [...pending].sort((a, b) => costs.get(a)! - costs.get(b)!)[0]; pending.delete(from);
    if (world.nodes.get(from)!.roomId !== currentRoom) continue;
    for (const edge of world.index.edges.get(from) ?? []) {
      if (edge.blocked || edge.gateId && !world.entities.get(edge.gateId)!.open) continue;
      const to = edge.from === from ? edge.to : edge.from;
      const cost = costs.get(from)! + edge.seconds;
      if (cost < (costs.get(to) ?? Infinity)) { costs.set(to, cost); pending.add(to); }
    }
  }
  return costs;
}
