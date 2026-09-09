import type { Snapshot, World } from "./model";
export { restoreWorld } from "./world";

/** Indexes and choices are derived, never persisted. The immutable content is embedded and versioned. */
export function snapshotWorld(world: World): Snapshot {
  const { index, ...data } = world;
  return structuredClone({ ...data,
    definitions: [...world.definitions.values()], entities: [...world.entities.values()],
    placements: [...world.placements.values()], rooms: [...world.rooms.values()],
    nodes: [...world.nodes.values()], edges: [...world.edges.values()],
    memory: [...world.memory.values()], narrated: [...world.narrated],
  });
}
export function serializeWorld(world: World) { return JSON.stringify(snapshotWorld(world)); }
