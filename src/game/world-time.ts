import type { GameState } from "./schemas";
import type { TextWorld } from "./schemas/text-world";
import { buildRuntimeRegistry } from "./runtime-registry";
import { synchronizeWorldActors } from "./text-world/observers";
import { GAME_MINUTE_MS } from "./base-data";
import { advanceWorldSimulation } from "./text-world/simulation";

export type WorldTimeCause = { actionWorld?: TextWorld; causedBy?: string };
/** Advance every instantiated place once. Wall-clock waits and state reads never enter here. */
export function advancePersistentWorlds(state: GameState, seconds: number, cause: WorldTimeCause = {}) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error("세계 시간은 유한한 양수여야 합니다.");
  const entries: [string, TextWorld][] = [
    ...(state.textWorld ? [["subway", state.textWorld] as [string, TextWorld]] : []),
    ...Object.entries(state.locationTextWorlds),
  ];
  if (cause.actionWorld && !entries.some(([, world]) => world === cause.actionWorld)) entries.push([state.location, cause.actionWorld]);
  const registry = buildRuntimeRegistry(state);
  const seen = new Set<TextWorld>();
  for (const [locationId, world] of entries) {
    if (seen.has(world)) continue;
    seen.add(world);
    world.simulation ??= { nextEventId: 0, sounds: [] };
    const total = seconds + (world.simulation.fractionalSeconds ?? 0);
    const whole = Math.floor(total + 1e-8);
    world.simulation.fractionalSeconds = Math.max(0, Math.round((total - whole) * 1e8) / 1e8);
    const previousSequence = world.simulation.nextEventId;
    const witnessed = world.active && (world === cause.actionWorld || locationId === state.location);
    synchronizeWorldActors(world, state, registry);
    advanceWorldSimulation(world, whole, world === cause.actionWorld ? cause.causedBy : undefined, { witnessed, actors: { state, registry, witnessed, causedBy: world === cause.actionWorld ? cause.causedBy : undefined, clockOffsetMs: state.worldElapsedMs - (world.elapsedSeconds + whole) * GAME_MINUTE_MS / 60 } });
    if (world !== cause.actionWorld) world.revision += world.simulation.nextEventId - previousSequence;
  }
}
