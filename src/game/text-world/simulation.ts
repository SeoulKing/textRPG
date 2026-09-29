import { advanceActorLife, nextActorBoundary, type ActorTimeContext } from "./actor-life";
import type { TextWorld } from "../schemas/text-world";
import { recordEvent } from "./events";
import { passageBlockers, rootZone } from "./spatial";
import { visibleEntities, worldRooms } from "./world";

/** Virtual time only: deterministic and independent of response latency or browser polling. */
export function advanceWorldSimulation(world: TextWorld, seconds: number, causedBy?: string, options: { witnessed?: boolean; actors?: ActorTimeContext } = {}) {
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error("세계 시간은 유한한 양수여야 합니다.");
  world.simulation ??= { nextEventId: 0, sounds: [] };
  let remaining = seconds;
  const ordered = Object.values(world.entities).sort((a, b) => a.id.localeCompare(b.id));
  // Each source can expire once in an advance; callbacks cannot schedule an unbounded event loop.
  do {
    const boundaries = ordered.flatMap(e => {
      const c = e.components;
      return [c.light?.on ? c.light.fuelSeconds : undefined, c.openable?.isOpen ? c.openable.remainingOpenSeconds : undefined].filter((n): n is number => n !== undefined && n > 0);
    });
    const step = Math.min(remaining, ...boundaries, ...(options.actors ? nextActorBoundary(world, options.actors) : []));
    const beforeVisible = new Set(options.witnessed === false ? [] : visibleEntities(world).map(e => e.id));
    world.elapsedSeconds += step; remaining -= step;
    world.simulation.sounds = world.simulation.sounds.map(sound => ({ ...sound, remainingSeconds: Math.max(0, sound.remainingSeconds - step) })).filter(sound => sound.remainingSeconds > 0);
    for (const e of ordered) {
      const c = e.components;
      if (c.light?.on && c.light.fuelSeconds !== undefined) {
        c.light.fuelSeconds = Math.max(0, c.light.fuelSeconds - step);
        if (c.light.fuelSeconds === 0) {
          c.light.on = false;
          recordEvent(world, { type: "LIGHT_EXPIRED", origin: "simulation", actorId: e.id, targetId: e.id, causedBy, witnessed: beforeVisible.has(e.id), before: { on: true }, after: { on: false, name: e.name } });
        }
      }
      if (c.openable?.isOpen && c.openable.remainingOpenSeconds !== undefined) {
        c.openable.remainingOpenSeconds = Math.max(0, c.openable.remainingOpenSeconds - step);
        if (c.openable.remainingOpenSeconds === 0 && !passageBlockers(world, e.id).length) {
          c.openable.isOpen = false;
          recordEvent(world, { type: "AUTO_CLOSE", origin: "simulation", actorId: e.id, targetId: e.id, causedBy, witnessed: beforeVisible.has(e.id), before: { isOpen: true }, after: { isOpen: false, name: e.name } });
        }
      }
    }
    if (options.actors && step > 0) advanceActorLife(world, step, options.actors);
  } while (remaining > 0);
}
export function emitMovementSound(world: TextWorld, sourceId: string, causedBy?: string) {
  const entity = world.entities[sourceId], description = entity?.details?.movementSound;
  if (!description) return;
  world.simulation ??= { nextEventId: 0, sounds: [] };
  const event = recordEvent(world, { type: "SOUND", origin: "simulation", actorId: sourceId, targetId: sourceId, causedBy, witnessed: false, before: {}, after: {} });
  world.simulation.sounds.push({ id: event.id!, sourceId, zone: rootZone(world, entity), description, remainingSeconds: 12, intensity: 1 });
}
export function audibleSounds(world: TextWorld) {
  const rooms = worldRooms(world), visible = new Set(visibleEntities(world).map(e => e.id));
  return (world.simulation?.sounds ?? []).flatMap(sound => {
    const queue = [{ zone: sound.zone, intensity: sound.intensity, via: "" }], best = new Map<string, number>();
    let heard: { intensity: number; via: string } | undefined;
    while (queue.length) {
      const at = queue.shift()!;
      if ((best.get(at.zone) ?? 0) >= at.intensity || at.intensity < 0.12) continue;
      best.set(at.zone, at.intensity);
      if (at.zone === world.player.zone) { if (!heard || at.intensity > heard.intensity) heard = at; continue; }
      for (const next of rooms[at.zone]?.neighbors ?? []) {
        const door = Object.values(world.entities).find(e => e.components.portal && [e.components.portal.from, e.components.portal.to].includes(at.zone) && [e.components.portal.from, e.components.portal.to].includes(next));
        const attenuation = door?.components.openable?.isOpen === false ? 0.3 : 0.65;
        queue.push({ zone: next, intensity: at.intensity * attenuation, via: at.zone });
      }
    }
    if (!heard) return [];
    const knownSource = sound.sourceId && visible.has(sound.sourceId) ? world.entities[sound.sourceId] : undefined;
    return [{ id: sound.id, description: sound.description, intensity: heard.intensity >= 0.6 ? "clear" : "muffled", direction: heard.via ? world.visitedZones.includes(heard.via) ? rooms[heard.via]?.name ?? "이어진 공간" : "문 너머" : "같은 공간", ...(knownSource ? { sourceId: knownSource.id, sourceName: knownSource.name } : {}) }];
  });
}
