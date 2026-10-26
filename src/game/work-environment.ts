import type { ActionDefinition, ChoiceDefinition, Effect, GameState } from "./schemas";
import type { TextWorld } from "./schemas/text-world";
import { ancestors, carriedByPlayer, childrenOf, rootZone, sealedFromReach, passageBlockers, relocateEntity } from "./text-world/spatial";
import { illuminated } from "./text-world/world";

type WorkDefinition = Pick<ActionDefinition | ChoiceDefinition, "activity" | "effects">;

/** Only reachable, known, player-stored materials can supply work in this location. */
export function localWorkEnvironment(state: GameState, kind?: string) {
  const world = state.location === "subway" ? state.textWorld : state.locationTextWorlds[state.location];
  const sources: { world: TextWorld; entityId: string; itemId: string; amount: number }[] = [];
  let station: { id: string; name: string; durationMultiplier: number } | undefined;
  if (!world?.rooms || !kind || kind === "rest") return { sources, station };
  const start = world.active ? world.player.zone : Object.keys(world.rooms)[0], reachable = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const zone = queue.shift()!, room = world.rooms[zone];
    if (!room || reachable.has(zone) || room.locationId !== state.location || !illuminated(world, zone)) continue;
    reachable.add(zone);
    for (const next of room.neighbors) {
      const portal = Object.values(world.entities).find(e => e.components.portal && [e.components.portal.from, e.components.portal.to].includes(zone) && [e.components.portal.from, e.components.portal.to].includes(next));
      if (portal && (portal.components.openable?.isOpen === false || portal.components.openable?.locked || passageBlockers(world, portal.id).length)) continue;
      if (!reachable.has(next)) queue.push(next);
    }
  }
  for (const entity of Object.values(world.entities).sort((a,b)=>a.id.localeCompare(b.id))) {
    if (!reachable.has(rootZone(world, entity)) || carriedByPlayer(world, entity) || sealedFromReach(world, entity)) continue;
    const chain = [entity, ...ancestors(world, entity)];
    if (chain.some(member => member.components.ownership)) continue;
    const workshop = entity.components.workstation;
    if (workshop?.kinds.some(k=>k===kind) && entity.components.structure?.integrity !== 0 && world.observations[entity.id]?.stages.includes("surface") && (!station || workshop.durationMultiplier < station.durationMultiplier))
      station = { id: entity.id, name: entity.name, durationMultiplier: workshop.durationMultiplier };
    const portable = entity.components.portable;
    if (!portable?.itemId || !entity.inventoryRegistered || childrenOf(world, entity.id).length) continue;
    if (ancestors(world, entity).some(parent => parent.components.craftingStorage && parent.components.container && parent.components.structure?.integrity !== 0 && world.observations[parent.id]?.stages.includes("surface")))
      sources.push({ world, entityId: entity.id, itemId: portable.itemId, amount: portable.amount });
  }
  return { sources, station };
}

export function activityConditionState(definition: WorkDefinition, state: GameState): GameState {
  if (!definition.activity || definition.activity.kind === "rest") return state;
  const costs = new Set(definition.effects.flatMap(effect=>effect.type === "remove_item" ? [effect.itemId] : []));
  const inventory = { ...state.inventory };
  for (const source of localWorkEnvironment(state, definition.activity.kind).sources) if (costs.has(source.itemId)) inventory[source.itemId] = (inventory[source.itemId] ?? 0) + source.amount;
  return { ...state, inventory };
}
export function activityDisplayEffects(definition: WorkDefinition, state: GameState): Effect[] {
  const station = localWorkEnvironment(state, definition.activity?.kind).station;
  return station ? definition.effects.map(effect => effect.type === "advance_time" ? { ...effect, minutes: effect.minutes * station.durationMultiplier } : effect) : definition.effects;
}

/** Validate the entire bill before changing any stack; carried inputs are used first. */
export function consumeWorkInputs(state: GameState, definition: WorkDefinition, inputs: Effect[], costs: Record<string, number>) {
  const { sources, station } = localWorkEnvironment(state, definition.activity?.kind);
  const storedItems: Record<string, number> = {}, deductions: { source: typeof sources[number]; amount: number }[] = [];
  for (const [itemId, total] of Object.entries(costs)) {
    let missing = Math.max(0, total - (state.inventory[itemId] ?? 0));
    for (const source of sources.filter(source=>source.itemId===itemId)) {
      const amount = Math.min(missing, source.amount);
      if (amount) { deductions.push({ source, amount }); missing -= amount; storedItems[itemId] = (storedItems[itemId] ?? 0) + amount; }
    }
    if (missing) throw new Error("작업에 필요한 재료가 부족합니다.");
  }
  for (const { source, amount } of deductions) {
    const entity = source.world.entities[source.entityId], remaining = entity.components.portable!.amount - amount;
    if (remaining) entity.components.portable!.amount = remaining;
    else relocateEntity(source.world, entity, { zone: "consumed" });
  }
  for (const world of new Set(deductions.map(d=>d.source.world))) world.revision++;
  const credit = { ...storedItems };
  const carriedInputs = inputs.flatMap<Effect>(effect => {
    if (effect.type !== "remove_item") return [effect];
    const stored = Math.min(effect.amount, credit[effect.itemId] ?? 0);credit[effect.itemId] = (credit[effect.itemId] ?? 0) - stored;
    return effect.amount > stored ? [{ ...effect, amount: effect.amount - stored }] : [];
  });
  return { inputs: carriedInputs, storedItems, station };
}
