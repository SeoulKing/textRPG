import type { GameState } from "../schemas";
import type { WorldAction } from "../schemas/text-world";
import { carriesLight, illuminated, pathOpen, worldRooms } from "./world";
export function worldDeparturePlan(state: GameState): WorldAction[] | null {
  const world = state.location === "subway" ? state.textWorld : state.locationTextWorlds[state.location];
  if (!world?.active) return [];
  const rooms = worldRooms(world), exits = Object.values(rooms).filter(r => r.regionalExit).map(r => r.id);
  if (!exits.length) return [];
  const queue: string[][] = [[world.player.zone]], visited = new Set<string>();
  while (queue.length) {
    const path = queue.shift()!, current = path.at(-1)!;
    if (exits.includes(current)) return [...(path.length > 1 && world.player.posture !== "standing" ? [{ type: "POSTURE" as const, posture: "standing" as const }] : []), ...path.slice(1).map(target => ({ type: "MOVE" as const, target }))];
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of rooms[current]?.neighbors ?? []) if (!visited.has(next) && pathOpen(world, current, next) && (rooms[next].light || carriesLight(world) || illuminated(world, next) || world.visitedZones.includes(next))) queue.push([...path, next]);
  }
  return null;
}
