import type { GameState } from "../schemas";
import type { TextWorld, WorldAction } from "../schemas/text-world";
import { worldRooms } from "./world";
import { carriedByPlayer } from "./spatial";
import { isHeld } from "./hands";
import { interactionContext, type InteractionContext } from "./interaction-context";

export type ChoiceCandidate = { id: string; label: string; hint: string; actions?: WorldAction[]; nodeId?: string; contentActionId?: string; need?: "food" | "health"; combatChoice?: { intent: { primary: string; target?: string } } };
export type ChoiceFamily = "SOCIAL" | "DISTRACT" | "TRAVEL" | "RETREAT" | "FOCUS" | "INSPECT" | "OPEN_CONTAINER" | "ACCESS" | "COLLECT" | "TOOL" | "PLACE_OBJECT" | "MOVE_OBJECT" | "COVER" | "DEFOCUS" | "STORY" | "WAIT" | "WORK" | "HANDLE" | "CARE" | "TRADE" | "ATTACK" | "NEGOTIATE";
export type DirectedChoice<T> = T & { family: ChoiceFamily; targetId?: string; slot: string; selectionSignature: string };
export function describeChoice(option: ChoiceCandidate, world: TextWorld) {
  const prefix = option.id.split(":")[0], kind = prefix === "repair" ? "care" : prefix, last = option.actions?.at(-1), meaningful = option.actions?.find(a => !["POSTURE", "MOVE"].includes(a.type));
  const targetId = option.nodeId ?? (kind === "collect" ? option.id.slice(8) : meaningful?.target ?? last?.target);
  const combat=option.combatChoice?.intent.primary;
  const family: ChoiceFamily = kind === "talk" ? "SOCIAL" : combat ? combat==="persuade"?"NEGOTIATE":combat==="retreat"?"RETREAT":(["defend","evade"].includes(combat) || combat==="use_item"&&option.combatChoice?.intent.target==="self")?"COVER":"ATTACK" : option.id.startsWith("separate:") ? "RETREAT" : option.id === "journey:return" ? "RETREAT" : ["hold", "stow"].includes(kind) ? "HANDLE" : ["harvest", "work"].includes(kind) ? "WORK" : kind === "care" ? "CARE" : kind === "toolwork" ? "TOOL" : kind === "trade" ? "TRADE" : ["story", "delivery"].includes(kind) ? "STORY" : kind === "focus" ? "FOCUS" : kind === "defocus" ? "DEFOCUS" : ["leave", "emerge"].includes(kind) || option.hint === "귀환" ? "RETREAT" : ["travel", "journey"].includes(kind) ? "TRAVEL"
    : kind === "throw" ? "DISTRACT" : ["put", "drop"].includes(kind) ? "PLACE_OBJECT" : kind === "push" ? "MOVE_OBJECT" : kind === "hide" ? "COVER" : kind === "wait" ? "WAIT"
    : ["collect", "take"].includes(kind) ? "COLLECT" : ["equip", "light", "tool"].includes(kind) ? "TOOL" : ["open", "unlock"].includes(kind) ? "ACCESS"
    : kind === "close" ? "ACCESS" : kind === "lid" || kind === "explore" && world.entities[targetId ?? ""]?.components.openable ? "OPEN_CONTAINER" : "INSPECT";
  return { family, targetId };
}
function stable(value: unknown): unknown { return Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)])) : value; }
function hash(text: string) { let value = 2166136261; for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619); return (value >>> 0).toString(16); }
export function choiceSignature(world: TextWorld, candidates: ChoiceCandidate[], context = interactionContext(world), preferences?: GameState["choicePreferences"], needs?: boolean[]) {
  // Entity maps may be reordered by JSONB. Only semantic changes invalidate a displayed frame.
  const ordered = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  const stableContext = { ...context, newlyDiscoveredIds: [...context.newlyDiscoveredIds].sort() };
  const knowledge = ordered.map(o => {
    const targetId = describeChoice(o, world).targetId;
    const known = world.observations[targetId ?? ""];
    return [targetId, Boolean(known?.inspected), [...(known?.stages ?? [])].sort(), Boolean(known?.collected)];
  });
  return hash(JSON.stringify(stable(["recommendations-v2", preferences?.scores ?? {}, needs, stableContext, ordered.map(o => [o.id, o.label, o.actions, o.hint, o.combatChoice]), world.player, knowledge])));
}
/** Select by context roles, with family diversity as a hard constraint. Scoring only ranks within a role. */
export function directChoices<T extends ChoiceCandidate>(world: TextWorld, state: GameState, candidates: T[]): DirectedChoice<T>[] {
  const context = interactionContext(world, state), previous = world.choiceHistory?.at(-1);
  const pool = candidates.map(option => ({ ...option, ...describeChoice(option, world) })).filter(option => {
    const last = option.actions?.at(-1);
    if (option.id.startsWith("close:") && context.threat?.kind!=="hostile") return false; // Deliberate door control remains in the object catalogue.
    if (context.mode === "EXPLORE" && option.id.startsWith("lid:")) return false;
    // Detailed inventory handling remains executable in the object catalogue.
    if (["HANDLE", "PLACE_OBJECT"].includes(option.family)) return false;
    if (last?.type === "TAKE" && last.target && carriedByPlayer(world, world.entities[last.target]) && world.entities[last.target].inventoryRegistered) return false;
    if (["FOCUS", "INSPECT"].includes(option.family) && candidates.some(candidate => {
      const other = describeChoice(candidate, world);
      return other.targetId === option.targetId && ["SOCIAL", "WORK", "TRADE", "CARE", "STORY"].includes(other.family);
    })) return false;
    if (option.family === "MOVE_OBJECT" && last?.relation === "blocking") return context.threat?.kind === "hostile" || context.threat?.kind === "door_closing" && last.destination === context.threat.sourceId;
    if (option.family === "DISTRACT" && !["MANIPULATE", "THREAT"].includes(context.mode)) return false;
    if (option.family === "COVER") return context.mode === "THREAT";
    if (context.mode === "THREAT" && option.family === "TOOL" && last?.type === "LIGHT" && world.entities[last.target!]?.components.light?.on && !option.actions?.some(a => a.type === "TAKE")) return false;
    if (context.mode === "THREAT" && !["TRAVEL", "RETREAT", "ACCESS", "TOOL", "COVER", "INSPECT", "MOVE_OBJECT", "ATTACK", "NEGOTIATE", ...(context.threat?.kind === "hostile" ? ["COLLECT", "DISTRACT", "WAIT"] : [])].includes(option.family)) return false;
    return true;
  });
  const unlocks = (o: typeof pool[number]) => Boolean(o.actions?.some(a => a.type === "UNLOCK"));
  const blockedFocus = Boolean(context.focusEntityId && world.observations[context.focusEntityId]?.blocked
    && world.entities[context.focusEntityId]?.components.openable?.locked);
  const unexploredSurface = (o: typeof pool[number]) => o.family === "INSPECT" && !world.observations[o.targetId ?? ""]?.inspected;
  const signature = choiceSignature(world, pool, context, state.choicePreferences, [state.stats.hp <= 5, state.stats.energy <= 6]);
  const retained = pool.filter(o => previous?.shownIds.includes(o.id));
  const preservesProgress = (!pool.some(unlocks) || retained.some(unlocks))
    && (!blockedFocus || !pool.some(unexploredSurface) || retained.some(unexploredSurface));
  if (preservesProgress && previous?.signature === signature && previous.shownIds.every(id => pool.some(o => o.id === id)))
    return previous.shownIds.map(id => ({ ...pool.find(o => o.id === id)!, slot: "retained", selectionSignature: signature }));
  const lastFamily = world.choiceHistory?.at(-2)?.families ?? [];
  const score = (o: typeof pool[number]) => {
    const focused = o.targetId === context.focusEntityId;
    let value = o.family === "HANDLE" ? 105 : o.family === "WORK" ? 125 : o.family === "COLLECT" ? 130 : o.family === "TOOL" ? 95 : o.family === "ACCESS" ? 85 : o.family === "INSPECT" || o.family === "OPEN_CONTAINER" ? 80 : o.family === "FOCUS" ? 45 : 35;
    value += state.choicePreferences?.scores[preferenceKey(world, state, o)] ?? 0;
    if (o.family === "SOCIAL") value += 120;
    if (o.need === "health" && state.stats.hp <= 5) value += 160;
    if (o.need === "food" && state.stats.energy <= 6) value += 100;
    if (focused) value += 60;
    if (o.family === "DISTRACT") {
      value += context.threat?.kind === "hostile" ? 110 : 35;
      const destination=o.actions?.at(-1)?.destination;
      if(destination && worldRooms(world)[destination] && destination!==world.player.zone)value+=60;
      if(destination===world.player.coverId)value-=100;
    }
    if(o.combatChoice?.intent.primary==="use_item")value+=110;
    if (o.family === "HANDLE" && o.actions?.at(-1)?.type === "HOLD" && o.targetId && isHeld(world, o.targetId)) value += 30;
    const repeatable = ["WORK", "TRADE", "CARE", "SOCIAL"].includes(o.family);
    if (!repeatable) value += previous?.shownIds.includes(o.id) ? -20 : 30;
    if (o.id === world.lastIntent.id) value -= repeatable ? 4 : 40;
    if (lastFamily.includes(o.family)) value -= 5;
    if (o.actions?.some(a => a.target && context.newlyDiscoveredIds.includes(a.target))) value += 30;
    if (o.actions?.some(a => a.type === "TAKE" || a.type === "UNLOCK")) value += 40;
    // The affordance has already verified the matching key. Entity IDs and inventory item IDs differ.
    if (unlocks(o)) value += 120;
    if (o.family === "MOVE_OBJECT" && o.actions?.at(-1)?.relation === "beside" && world.entities[o.targetId ?? ""]?.components.position.relation === "blocking") value += 180;
    if (context.threat?.kind === "door_closing" && o.family === "MOVE_OBJECT" && o.actions?.at(-1)?.relation === "blocking" && o.actions?.at(-1)?.destination === context.threat.sourceId) value += 200;
    if (o.id.startsWith("emerge:")) value += 250;
    if(context.threat?.kind==="hostile" && o.id.startsWith("hide:"))value+=160;
    if(context.threat?.kind==="hostile" && o.id.startsWith("separate:"))value+=170;
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
    if (selected.length >= 5) return;
    const found = ranked.find(o => !families.has(o.family) && accepts(o) && !selected.some(s => s.id === o.id || o.family === "FOCUS" && s.targetId === o.targetId || o.actions?.at(-1)?.type === "CLOSE" && s.actions?.at(-1)?.type === "CLOSE" && o.actions.at(-1)!.target === s.actions.at(-1)!.target));
    if (found) { selected.push({ ...found, slot, selectionSignature: signature }); families.add(found.family); }
  };
  // Story forks are explicit alternatives. Their IDs represent different decisions, unlike mechanical synonyms.
  const stories = ranked.filter(o => o.family === "STORY");
  for (const story of stories.slice(0, 2)) selected.push({ ...story, slot: "story", selectionSignature: signature });
  if (stories.length) families.add("STORY");
  const inFamily = (...kinds: ChoiceFamily[]) => (o: typeof pool[number]) => kinds.includes(o.family);
  if (context.threat?.kind === "hostile") {
    take("respond", inFamily("ATTACK"));
    take("defend", inFamily("COVER", "ACCESS", "MOVE_OBJECT"));
    take("negotiate", inFamily("NEGOTIATE"));
    take("retreat", inFamily("RETREAT", "TRAVEL"));
    take("opportunity", o=>inFamily("DISTRACT", "COLLECT", "TOOL", "ACCESS", "WAIT")(o) || unexploredSurface(o));
  } else if (context.mode === "THREAT") {
    take("respond", inFamily("TOOL", "ACCESS", "MOVE_OBJECT"));
    take("defend", inFamily("COVER", "MOVE_OBJECT", "ACCESS"));
    take("information", inFamily("INSPECT"));
    take("retreat", inFamily("RETREAT", "TRAVEL"));
  } else {
    // Reserve outcomes first; personalization only competes inside useful roles.
    take("urgent", o => unlocks(o) || o.id.startsWith("emerge:") || o.need === "health" && state.stats.hp <= 5);
    if (blockedFocus) take("obstruction_clue", unexploredSurface);
    take("discovery_reward", o => o.family === "COLLECT" && Boolean(o.actions?.some(a => a.target && context.newlyDiscoveredIds.includes(a.target))));
    take("conversation", inFamily("SOCIAL"));
    take("main_activity", inFamily("WORK", "CARE", "TRADE", "TOOL", "ACCESS"));
    take("discovery", o => inFamily("COLLECT", "OPEN_CONTAINER")(o) && o.actions?.at(-1)?.type !== "CLOSE" || unexploredSurface(o));
    take("route", inFamily("TRAVEL", "RETREAT"));
    // A second practical role can coexist with the main activity (e.g. earn food / buy food).
    take("practical", inFamily("WORK", "CARE", "TRADE", "TOOL", "ACCESS"));
    take("new_interest", o => o.family === "FOCUS" && !selected.some(s => s.targetId === o.targetId));
    take("information", unexploredSurface);
    take("release", inFamily("DEFOCUS"));
    if (selected.length < 3) take("watch", inFamily("WAIT"));
  }
  return selected.slice(0, 5);
}
export function rememberChoices(world: TextWorld, options: { id: string; family?: string; selectionSignature?: string }[]) {
  // Recorded once during rendering, never by read-only action lists or polls.
  world.choiceHistory = [...(world.choiceHistory ?? []), { revision: world.revision, signature: options[0]?.selectionSignature ?? "", shownIds: options.map(o => o.id), chosenId: world.lastIntent.id, families: options.map(o => o.family ?? "") }].slice(-3);
}

function preferenceKey(world: TextWorld, state: GameState, option: ChoiceCandidate) {
  const { family } = describeChoice(option, world);
  // Stable authored action IDs distinguish, for example, paid meals and ration exchange.
  return interactionContext(world, state).mode + "|" + family + "|" + (option.contentActionId ?? option.id).slice(0, 140);
}
export function learnChoice(state: GameState, before: TextWorld, option: ChoiceCandidate) {
  const { family } = describeChoice(option, before);
  if (["HANDLE", "PLACE_OBJECT", "DEFOCUS", "WAIT"].includes(family)) return;
  const token = state.location + ":" + before.revision + ":" + option.id;
  if (state.choicePreferences?.lastSelection === token) return;
  const key = preferenceKey(before, state, option), mode = key.split("|")[0] + "|";
  const scores = Object.fromEntries(Object.entries(state.choicePreferences?.scores ?? {})
    .map(([id, value]) => [id, Math.max(0, value - (id.startsWith(mode) && id !== key ? 1 : 0))] as const).filter(([, value]) => value > 0));
  scores[key] = Math.min(24, (scores[key] ?? 0) + 4);
  state.choicePreferences = { scores: Object.fromEntries(Object.entries(scores).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,64)), lastSelection: token };
}
