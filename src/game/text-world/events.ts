import type { TextWorld, WorldEvent } from "../schemas/text-world";

export function recordEvent(world: TextWorld, event: Omit<WorldEvent, "at">): WorldEvent {
  world.simulation ??= { nextEventId: 0, sounds: [] };
  const recorded = { origin: "player" as const, actorId: "player", witnessed: true, ...event, at: world.elapsedSeconds, id: "event:" + world.simulation.nextEventId++ };
  world.events.push(recorded);
  world.events = world.events.slice(-30);
  return recorded;
}
