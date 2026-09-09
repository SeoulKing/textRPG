import type { World } from "./model";
import { observe } from "./observe";
import { choicePage, choices } from "./choices";
import { describeFact } from "./render";
export { createWorld } from "./content";
export { execute, enterWorld, InvalidCommand } from "./actions";
export { restoreWorld, snapshotWorld, serializeWorld } from "./save";

/** Player-facing projection: no authoritative hidden state or stored choice list is sent. */
export function viewWorld(world: World, page = 0) {
  const observation = observe(world);
  return {
    revision: world.revision, elapsedSeconds: world.elapsedSeconds, roomName: world.rooms.get(observation.roomId)!.name,
    nodeName: world.nodes.get(observation.nodeId)!.name, nodeId: observation.nodeId, focusId: observation.focusId,
    health: world.player.health, paragraphs: [...world.lastParagraphs], inventory: observation.inventory,
    ...choicePage(choices(world, observation), page),
    memory: [...world.memory.values()].filter(m => m.fact.kind === "contents" || m.fact.kind === "lock").map(m => ({
      text: "이전 확인 기록: " + describeFact(m.fact), observedAt: m.observedAt, revision: m.revision,
    })),
  };
}
