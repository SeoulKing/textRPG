import type { GameState, ContentRegistry } from "../schemas";
import { NpcConversationMemorySchema } from "../schemas/npc-dialogue";
import type { TextWorld, WorldEvent, TextEntity } from "../schemas/text-world";
import { buildRuntimeRegistry } from "../runtime-registry";
import { ancestors, carriedByPlayer, currentCover, rootZone } from "./spatial";
import { isHeld } from "./hands";
import { illuminated, visibleEntities, worldRooms, canReach, entityDetails } from "./world";
import { audibleSounds } from "./simulation";
import { recordEvent } from "./events";

export function synchronizeWorldActors(world: TextWorld, state: GameState, registry: ContentRegistry = buildRuntimeRegistry(state)) {
  for (const entity of Object.values(world.entities)) {
    if (!entity.components.actor) continue;
    const person = registry.people[entity.components.actor.npcId] as { name?: string; locationId?: string } | undefined;
    entity.components.actor.active = Boolean(person && person.locationId === worldRooms(world)[rootZone(world, entity)]?.locationId);
    if (person?.name) { if (entity.details?.outline === entity.name) entity.details.outline = person.name; entity.name = person.name; }
  }
}
export function propertyOwner(world: TextWorld, entity: TextEntity | undefined) {
  return entity && [entity, ...ancestors(world, entity)].find(e => e.components.ownership)?.components.ownership?.npcId;
}
const observedVerbs: Record<string, string> = {
  THROW: "던졌다", OPEN: "열었다", CLOSE: "닫았다", UNLOCK: "잠금을 풀었다", TAKE: "챙겼다", PUT: "옮겨 놓았다", DROP: "내려놓았다", PUSH: "밀어 옮겼다", REPAIR: "수리했다",
};
/** Each observer keeps only what its own viewpoint can establish, never the player's private log. */
export function observeWorldEvent(world: TextWorld, state: GameState, event: WorldEvent) {
  const sequence = Number(event.id?.split(":").at(-1));
  if (!Number.isSafeInteger(sequence)) return;
  const worldId = Object.values(worldRooms(world))[0]?.locationId ?? state.location;
  for (const observer of Object.values(world.entities).filter(e => e.components.actor && e.components.actor.active !== false).sort((a,b)=>a.id.localeCompare(b.id))) {
    const npcId = observer.components.actor!.npcId, zone = rootZone(world, observer);
    if (!worldRooms(world)[zone]) continue;
    const memory = NpcConversationMemorySchema.parse(state.npcDialogue.conversations[npcId] ?? {});
    if ((memory.observedSequences[worldId] ?? -1) >= sequence) continue;
    memory.observedSequences[worldId] = sequence;
    const view: TextWorld = { ...world, player: { ...world.player, zone, near: observer.id, position: observer.details?.anchor ?? observer.id, relation: "near", coverId: null, posture: "standing", focusEntityId: null } };
    let observation: typeof memory.observations[number] | undefined;
    const identity = { id: worldId + ":" + event.id, worldId, sequence, atMs: state.worldElapsedMs, eventType: event.type };
    if (event.type === "SOUND") {
      const sound = audibleSounds(view).find(sound => sound.id === event.id);
      if (sound) observation = { ...identity, sense: "heard", actorKnown: false, summary: sound.direction + "에서 " + sound.description };
    } else if (event.origin !== "simulation" && (observedVerbs[event.type] || event.type === "USE_TOOL")) {
      const target = world.entities[event.targetId ?? ""];
      const concealed = Boolean(currentCover(world));
      const targetVisible = target && (event.type === "THROW" && event.before.launchZone === zone || visibleEntities(view).some(e=>e.id===target.id)) && (!carriedByPlayer(world,target) || isHeld(world,target.id));
      if (zone === world.player.zone && illuminated(view, zone) && !concealed && targetVisible) {
        const result = event.type === "USE_TOOL" ? event.after.destroyed ? "구조를 부쉈다" : event.after.technique === "pry" ? "잠금장치를 비틀어 열었다" : "구조에 손상을 냈다" : observedVerbs[event.type];
        observation = { ...identity, sense: "seen", actorKnown: true, targetId: target.id, targetName: target.name, summary: "플레이어가 " + target.name + "에 손을 대어 " + result + "." };
        const owner = event.before.ownerNpcId;
        if (owner === npcId && ["TAKE","USE_TOOL"].includes(event.type)) {
          memory.affinity = Math.max(-10, memory.affinity - 2);
          recordEvent(world, { type: "NPC_REACTION", origin: "simulation", actorId: npcId, targetId: observer.id, causedBy: event.id, before: {}, after: { name: observer.name, dialogue: "그건 제 물건이에요. 함부로 건드리지 마세요.", affinityDelta: -2 } });
        }
      }
    }
    if (observation) memory.observations = [...memory.observations, observation].slice(-24);
    state.npcDialogue.conversations[npcId] = memory;
  }
}
export function npcWorldContext(world: TextWorld | null | undefined, npcId: string) {
  const actor = Object.values(world?.entities ?? {}).find(e=>e.components.actor?.npcId===npcId && e.components.actor.active!==false);
  if (!world || !actor) return undefined;
  const life = actor.components.actor?.life;
  return { locationName:worldRooms(world)[rootZone(world,actor)]?.name ?? "현재 자리", placement:entityDetails(world,actor).placement, mode:life?.mode, hunger:life?.hunger, fatigue:life?.fatigue };
}
export function nearbyWorldNpc(world: TextWorld | null | undefined, npcId?: string) {
  if (!world?.active) return undefined;
  return visibleEntities(world).find(e => e.components.actor && (!npcId || e.components.actor.npcId === npcId) && canReach(world, e));
}
/** A mapped resident remains at its saved position even after the player leaves exploration. */
export function residentAtConversationLocation(world: TextWorld | null | undefined, npcId: string) {
  if (world?.active) return Boolean(nearbyWorldNpc(world, npcId));
  const residents = Object.values(world?.entities ?? {}).filter(entity => entity.components.actor?.npcId === npcId);
  return !residents.length || residents.some(entity => entity.components.actor?.active !== false && worldRooms(world!)[rootZone(world!, entity)]?.outsideExploration);
}
