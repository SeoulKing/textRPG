import type { GameState } from "../schemas";
import type { TextWorld } from "../schemas/text-world";
import { illuminated, visibleEntities } from "./world";
import { passageBlockers } from "./spatial";
import { handledEntityId } from "./hands";

export type InteractionMode = "EXPLORE" | "FOCUS" | "MANIPULATE" | "THREAT";
export type InteractionContext = {
  mode: InteractionMode; focusEntityId: string | null; holdingEntityId: string | null;
  threat: { kind: "light_expiring" | "darkness" | "door_closing"; sourceId?: string } | null;
  newlyDiscoveredIds: string[]; goal: "restore_visibility" | "keep_passage" | "collect_discovery" | "explore";
};
/** Interest is distinct from physical proximity. Only engine/perception facts can establish urgency. */
export function interactionContext(world: TextWorld, _state?: GameState): InteractionContext {
  const visible = visibleEntities(world), ids = new Set(visible.map(e => e.id));
  const focused = world.player.focusEntityId === undefined ? world.player.near : world.player.focusEntityId;
  const inventoryLight = (id: string | null | undefined) => {
    const c = world.entities[id ?? ""]?.components;
    return Boolean(c?.light && c.portable?.itemId && c.position.zone === "player");
  };
  const focusEntityId = focused && ids.has(focused) && !inventoryLight(focused) ? focused : null;
  const handled = handledEntityId(world);
  const holdingEntityId = inventoryLight(handled) ? null : handled;
  const expiring = visible.filter(e => e.components.light?.on && e.components.light.fuelSeconds !== undefined && e.components.light.fuelSeconds <= 10);
  const withoutExpiring = { ...world, entities: { ...world.entities } };
  for (const e of expiring) withoutExpiring.entities[e.id] = { ...e, components: { ...e.components, light: { ...e.components.light!, on: false } } };
  const light = !illuminated(withoutExpiring, world.player.zone) ? expiring[0] : undefined;
  const door = visible.find(e => e.components.portal && e.components.openable?.isOpen && e.components.openable.remainingOpenSeconds !== undefined && e.components.openable.remainingOpenSeconds <= 8 && !passageBlockers(world, e.id).length);
  const lostLight = !illuminated(world, world.player.zone) && world.visitedZones.includes(world.player.zone);
  const threat: InteractionContext["threat"] = lostLight ? { kind: "darkness" } : light ? { kind: "light_expiring", sourceId: light.id } : door ? { kind: "door_closing", sourceId: door.id } : null;
  const newlyDiscoveredIds = world.events.flatMap(e => Array.isArray(e.after.revealedIds) ? e.after.revealedIds as string[] : []);
  if (world.events.some(e => ["OPEN", "INSPECT", "LIGHT"].includes(e.type))) {
    for (const e of visible) if (world.entities[e.components.position.zone]?.components.container && !world.observations[e.id]?.collected) newlyDiscoveredIds.push(e.id);
  }
  return { mode: threat ? "THREAT" : holdingEntityId ? "MANIPULATE" : focusEntityId ? "FOCUS" : "EXPLORE", focusEntityId, holdingEntityId, threat,
    newlyDiscoveredIds: [...new Set(newlyDiscoveredIds)].filter(id => ids.has(id)),
    goal: threat?.kind === "darkness" || threat?.kind === "light_expiring" ? "restore_visibility" : threat ? "keep_passage" : newlyDiscoveredIds.length ? "collect_discovery" : "explore" };
}
