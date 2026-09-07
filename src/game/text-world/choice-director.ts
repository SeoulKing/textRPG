import type { GameState } from "../schemas";
import type { TextWorld, WorldAction } from "../schemas/text-world";
import { carriedByPlayer } from "./spatial";
import { isHeld } from "./hands";
import { interactionContext, type InteractionContext } from "./interaction-context";

export type ChoiceCandidate = { id: string; label: string; hint: string; actions?: WorldAction[]; nodeId?: string };
export type ChoiceFamily = "TRAVEL" | "RETREAT" | "FOCUS" | "INSPECT" | "OPEN_CONTAINER" | "ACCESS" | "COLLECT" | "TOOL" | "PLACE_OBJECT" | "MOVE_OBJECT" | "COVER" | "DEFOCUS" | "STORY" | "WAIT" | "WORK" | "HANDLE" | "CARE" | "TRADE";
export type DirectedChoice<T> = T & { family: ChoiceFamily; targetId?: string; slot: string; selectionSignature: string };
export function describeChoice(option: ChoiceCandidate, world: TextWorld) {
  const prefix = option.id.split(":")[0], kind = prefix === "repair" ? "care" : prefix, last = option.actions?.at(-1), meaningful = option.actions?.find(a => !["POSTURE", "MOVE"].includes(a.type));
  const targetId = option.nodeId ?? (kind === "collect" ? option.id.slice(8) : meaningful?.target ?? last?.target);
  const family: ChoiceFamily = ["hold", "stow"].includes(kind) ? "HANDLE" : ["harvest", "work"].includes(kind) ? "WORK" : kind === "care" ? "CARE" : kind === "toolwork" ? "TOOL" : kind === "trade" ? "TRADE" : ["story", "delivery"].includes(kind) ? "STORY" : kind === "focus" ? "FOCUS" : kind === "defocus" ? "DEFOCUS" : ["leave", "emerge"].includes(kind) || option.hint === "귀환" ? "RETREAT" : ["travel", "journey"].includes(kind) ? "TRAVEL"
    : ["put", "drop"].includes(kind) ? "PLACE_OBJECT" : kind === "push" ? "MOVE_OBJECT" : kind === "hide" ? "COVER" : kind === "wait" ? "WAIT"
    : ["collect", "take"].includes(kind) ? "COLLECT" : ["equip", "light", "tool"].includes(kind) ? "TOOL" : ["open", "unlock"].includes(kind) ? "ACCESS"
    : kind === "close" ? "ACCESS" : kind === "lid" || kind === "explore" && world.entities[targetId ?? ""]?.components.openable ? "OPEN_CONTAINER" : "INSPECT";
  return { family, targetId };
}
function stable(value: unknown): unknown { return Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)])) : value; }
function hash(text: string) { let value = 2166136261; for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619); return (value >>> 0).toString(16); }
export function choiceSignature(world: TextWorld, candidates: ChoiceCandidate[], context = interactionContext(world)) {
  // Entity maps may be reordered by JSONB. Only semantic changes invalidate a displayed frame.
  const ordered = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  const stableContext = { ...context, newlyDiscoveredIds: [...context.newlyDiscoveredIds].sort() };
  const knowledge = ordered.map(o => {
    const targetId = describeChoice(o, world).targetId;
    const known = world.observations[targetId ?? ""];
    return [targetId, Boolean(known?.inspected), [...(known?.stages ?? [])].sort(), Boolean(known?.collected)];
  });
  return hash(JSON.stringify(stable([stableContext, ordered.map(o => [o.id, o.label, o.actions]), world.player, knowledge])));
}
/** Select by context roles, with family diversity as a hard constraint. Scoring only ranks within a role. */
export function directChoices<T extends ChoiceCandidate>(world: TextWorld, state: GameState, candidates: T[]): DirectedChoice<T>[] {
  const context = interactionContext(world, state), previous = world.choiceHistory?.at(-1);
  const pool = candidates.map(option => ({ ...option, ...describeChoice(option, world) })).filter(option => {
    const last = option.actions?.at(-1);
    if (option.id.startsWith("close:")) return false; // Deliberate door control remains in the object catalogue.
    if (context.mode === "EXPLORE" && option.id.startsWith("lid:")) return false;
    if (option.family === "PLACE_OBJECT") {
      if (context.mode === "MANIPULATE") return last?.target === context.holdingEntityId && (last.type === "DROP" || last.destination === (world.player.placementTargetId ?? context.focusEntityId ?? world.player.near));
      const destination = world.entities[last?.destination ?? ""];
      return context.mode === "FOCUS" && last?.type === "PUT" && last.destination === context.focusEntityId
        && Boolean(destination && carriedByPlayer(world, destination)) && Boolean(last.target && isHeld(world, last.target));
    }
    if (option.family === "HANDLE") {
      if (last?.type === "STOW") return context.mode === "MANIPULATE" && last.target === context.holdingEntityId;
      if (context.mode !== "FOCUS" || last?.target === context.focusEntityId) return false;
      const source = world.entities[last?.target ?? ""];
      if (source?.components.light && candidates.some(candidate => candidate.id === "equip:" + source.id)) return false;
      const target = world.entities[context.focusEntityId ?? ""];
      return Boolean(target && (target.components.container && target.components.openable?.isOpen !== false || target.components.physical?.supportCapacity !== undefined));
    }
    if (option.family === "MOVE_OBJECT" && last?.relation === "blocking") return context.threat?.kind === "door_closing" && last.destination === context.threat.sourceId;
    if (option.family === "COVER") return context.mode === "THREAT";
    if (context.mode === "THREAT" && option.family === "TOOL" && last?.type === "LIGHT" && world.entities[last.target!]?.components.light?.on && !option.actions?.some(a => a.type === "TAKE")) return false;
    if (context.mode === "THREAT" && !["TRAVEL", "RETREAT", "ACCESS", "TOOL", "COVER", "INSPECT", "MOVE_OBJECT"].includes(option.family)) return false;
    return true;
  });
  const unlocks = (o: typeof pool[number]) => Boolean(o.actions?.some(a => a.type === "UNLOCK"));
  const blockedFocus = Boolean(context.focusEntityId && world.observations[context.focusEntityId]?.blocked
    && world.entities[context.focusEntityId]?.components.openable?.locked);
  const unexploredSurface = (o: typeof pool[number]) => o.family === "INSPECT" && !world.observations[o.targetId ?? ""]?.inspected;
  const signature = choiceSignature(world, pool, context);
  const retained = pool.filter(o => previous?.shownIds.includes(o.id));
  const preservesProgress = (!pool.some(unlocks) || retained.some(unlocks))
    && (!blockedFocus || !pool.some(unexploredSurface) || retained.some(unexploredSurface));
  if (preservesProgress && previous?.signature === signature && previous.shownIds.every(id => pool.some(o => o.id === id)))
    return previous.shownIds.map(id => ({ ...pool.find(o => o.id === id)!, slot: "retained", selectionSignature: signature }));
  const lastFamily = world.choiceHistory?.at(-2)?.families ?? [];
  const score = (o: typeof pool[number]) => {
    const focused = o.targetId === context.focusEntityId;
    let value = o.family === "HANDLE" ? 105 : o.family === "WORK" ? 125 : o.family === "COLLECT" ? 130 : o.family === "TOOL" ? 95 : o.family === "ACCESS" ? 85 : o.family === "INSPECT" || o.family === "OPEN_CONTAINER" ? 80 : o.family === "FOCUS" ? 45 : 35;
    if (focused) value += 60;
    if (o.family === "HANDLE" && o.actions?.at(-1)?.type === "HOLD" && o.targetId && isHeld(world, o.targetId)) value += 30;
    if (!previous?.shownIds.includes(o.id)) value += 30;
    else value -= 20;
    if (o.id === world.lastIntent.id) value -= 40;
    if (lastFamily.includes(o.family)) value -= 5;
    if (o.actions?.some(a => a.target && context.newlyDiscoveredIds.includes(a.target))) value += 30;
    if (o.actions?.some(a => a.type === "TAKE" || a.type === "UNLOCK")) value += 40;
    // The affordance has already verified the matching key. Entity IDs and inventory item IDs differ.
    if (unlocks(o)) value += 120;
    if (o.family === "MOVE_OBJECT" && o.actions?.at(-1)?.relation === "beside" && world.entities[o.targetId ?? ""]?.components.position.relation === "blocking") value += 180;
    if (o.id.startsWith("emerge:")) value += 250;
    if (o.family === "OPEN_CONTAINER" && o.actions?.at(-1)?.type === "CLOSE" && world.events.some(e => e.type === "OPEN" && e.targetId === o.targetId)) value -= 90;
    if (o.family === "INSPECT" && world.observations[o.targetId ?? ""]?.inspected) value -= 30;
    if (o.family === "FOCUS") {
      const known = world.observations[o.targetId ?? ""];
      const container = world.entities[o.targetId ?? ""]?.components.container;
      const examined = known?.inspected || known?.stages.includes("interior");
      value += examined ? -30 : 40;
      if (!examined && world.entities[o.targetId ?? ""]?.components.interactionPoint?.actions.some(a => a.role === "trade")) value += 80;
      if (examined && container && known?.collected) value -= 35;
    }
    if (context.mode === "THREAT") {
      if (context.goal === "restore_visibility" && o.family === "TOOL" && o.actions?.some(a => a.type === "LIGHT" && !world.entities[a.target!]?.components.light?.on || a.type === "TAKE" && world.entities[a.target!]?.components.light)) value += 240;
      if (context.goal === "keep_passage" && (o.family === "MOVE_OBJECT" || o.family === "TRAVEL")) value += 180;
    }
    return value;
  };
  const ranked = [...pool].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  const selected: DirectedChoice<T>[] = [], families = new Set<ChoiceFamily>();
  const take = (slot: string, accepts: (o: typeof pool[number]) => boolean) => {
    const found = ranked.find(o => !families.has(o.family) && accepts(o) && !selected.some(s => s.id === o.id || o.family === "FOCUS" && s.targetId === o.targetId));
    if (found) { selected.push({ ...found, slot, selectionSignature: signature }); families.add(found.family); }
  };
  // Story forks are explicit alternatives. Their IDs represent different decisions, unlike mechanical synonyms.
  const stories = ranked.filter(o => o.family === "STORY");
  for (const story of stories.slice(0, 2)) selected.push({ ...story, slot: "story", selectionSignature: signature });
  if (stories.length) families.add("STORY");
  const inFamily = (...kinds: ChoiceFamily[]) => (o: typeof pool[number]) => kinds.includes(o.family);
  if (context.mode === "THREAT") {
    take("respond", inFamily("TOOL", "ACCESS", "MOVE_OBJECT"));
    take("defend", inFamily("COVER", "MOVE_OBJECT", "ACCESS"));
    take("information", inFamily("INSPECT"));
    take("retreat", inFamily("RETREAT", "TRAVEL"));
  } else if (context.mode === "EXPLORE") {
    take("work", inFamily("WORK"));
    take("progress", pool.some(unlocks) ? unlocks : inFamily("COLLECT", "ACCESS"));
    take("object", inFamily(pool.some(o => o.family === "OPEN_CONTAINER") ? "OPEN_CONTAINER" : "TOOL"));
    take("information", inFamily("INSPECT"));
    take("destination", inFamily(pool.some(o => o.family === "TRAVEL") ? "TRAVEL" : pool.some(o => o.family === "RETREAT") ? "RETREAT" : "FOCUS"));
    if (selected.length < 5) take("special", inFamily("TOOL", "RETREAT", "HANDLE"));
  } else {
    take("primary", pool.some(unlocks) ? unlocks : o => (context.mode === "MANIPULATE" ? ["WORK", "COLLECT", "ACCESS", "TOOL"] : ["WORK", "CARE", "TRADE", "TRAVEL", "COLLECT", "ACCESS", "TOOL", "OPEN_CONTAINER"]).includes(o.family) && (o.targetId === context.focusEntityId || o.family === "COLLECT" || o.family === "TOOL"));
    const information = pool.filter(o => o.family === "INSPECT" || o.family === "OPEN_CONTAINER" && o.actions?.at(-1)?.type !== "CLOSE");
    // A known obstruction should lead back to unexamined surroundings without a menu escape.
    // This uses visible inspection candidates, never the hidden reward or its location.
    const surroundings = information.filter(unexploredSurface);
    const freshCollection = (o: typeof pool[number]) => o.family === "COLLECT" && (o.targetId === context.focusEntityId || Boolean(o.actions?.some(a => a.target && context.newlyDiscoveredIds.includes(a.target))));
    take("information", pool.some(unlocks) && pool.some(freshCollection) ? freshCollection : blockedFocus && surroundings.length ? o => surroundings.includes(o) : information.length ? o => information.includes(o) : inFamily("FOCUS"));
    take("situational", context.mode === "MANIPULATE" ? inFamily(pool.some(o => o.family === "PLACE_OBJECT") ? "PLACE_OBJECT" : "TOOL") : pool.some(o => o.family === "PLACE_OBJECT") ? inFamily("PLACE_OBJECT") : inFamily("TRADE", "CARE", "MOVE_OBJECT", "TOOL", "OPEN_CONTAINER", "HANDLE"));
    take("release", context.mode === "MANIPULATE" ? inFamily("HANDLE", "DEFOCUS") : inFamily("DEFOCUS"));
    if (selected.length < 5) take("route", inFamily(pool.some(o => o.family === "TRAVEL") ? "TRAVEL" : pool.some(o => o.family === "RETREAT") ? "RETREAT" : "ACCESS"));
  }
  // Populate unused roles with distinct useful intentions, never recap/reward-free reinspection filler.
  if (selected.length < (context.mode === "EXPLORE" && pool.some(o => o.family === "WORK") ? 5 : 3) && context.mode !== "THREAT") take("shift_attention", inFamily("FOCUS", "TOOL", "TRAVEL", "RETREAT"));
  return selected.slice(0, 5);
}
export function rememberChoices(world: TextWorld, options: { id: string; family?: string; selectionSignature?: string }[]) {
  // Recorded once during rendering, never by read-only action lists or polls.
  world.choiceHistory = [...(world.choiceHistory ?? []), { revision: world.revision, signature: options[0]?.selectionSignature ?? "", shownIds: options.map(o => o.id), chosenId: world.lastIntent.id, families: options.map(o => o.family ?? "") }].slice(-3);
}
