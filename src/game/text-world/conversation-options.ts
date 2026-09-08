import type { ContentRegistry, GameState } from "../schemas";
import type { TextWorld, WorldAction } from "../schemas/text-world";
import { buildRuntimeRegistry } from "../runtime-registry";
import { runtimeSocialProfile } from "../npc-social";
import { canReach, visibleEntities, particle } from "./world";
import { rootZone } from "./spatial";
import { resolveWorldActions } from "./engine";
import { interactionContext } from "./interaction-context";

/** Talking is an intention: approach a visible resident, then start one dialogue request. */
export function conversationOptions(world: TextWorld, state: GameState, registry: ContentRegistry = buildRuntimeRegistry(state)) {
  if (!world.active || state.isGameOver || state.stageClear || state.npcDialogue.active || state.subwayExpedition.active || interactionContext(world, state).threat) return [];
  return visibleEntities(world).sort((a, b) => a.id.localeCompare(b.id)).flatMap(entity => {
    const npcId = entity.components.actor?.npcId;
    const profile = npcId && runtimeSocialProfile(npcId, registry);
    if (!profile || entity.components.actor?.active === false || profile.homeLocationId !== state.location || rootZone(world, entity) !== world.player.zone) return [];
    const actions: WorldAction[] = canReach(world, entity) ? [] : [
      ...(world.player.posture === "crouching" ? [{ type: "POSTURE" as const, posture: "standing" as const }] : []),
      { type: "MOVE", target: entity.id },
    ];
    const projected = structuredClone(world), projectedState = structuredClone(state);
    if (state.location === "subway") projectedState.textWorld = projected;
    else projectedState.locationTextWorlds[state.location] = projected;
    const result = resolveWorldActions(projected, projectedState, actions, { advanceTime: false });
    if (result.interrupted || result.discovery || !canReach(projected, projected.entities[entity.id])) return [];
    return [{ id: "talk:" + npcId, nodeId: entity.id, npcId: profile.id,
      label: actions.length ? profile.name + "에게 다가가 말을 건넨다" : particle(profile.name, "과", "와") + " 대화한다",
      hint: "대화", actions, importance: "major" as const }];
  });
}
