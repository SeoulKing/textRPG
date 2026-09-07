import type { NarrativeContext, WorldEvent, WorldFact } from "../schemas/text-world";

export type NarrativeDirection = {
  focusTargetId?: string;
  beats: { role: "approach" | "contact" | "reveal" | "change" | "aftermath"; resultFactIds: string[]; detailFactIds: string[] }[];
};
const typeOf = (fact: WorldFact) => String(fact.data.type);
/** The director orders attention, never creates a world fact or chooses an action. */
export function directScene(context: NarrativeContext, narrated: Record<string, string> = {}): NarrativeContext {
  const results = context.requiredFacts.filter(f => f.kind === "result");
  const substantive = results.filter(f => !["MOVE", "POSTURE", "INSPECT", "LOOK", "SURVEY"].includes(typeOf(f)));
  const last = substantive.at(-1) ?? results.at(-1);
  const event = last?.data as WorldEvent | undefined;
  const focus = event?.type === "TAKE" ? String(event.before.zone ?? "") : last?.targetId ?? context.player.facing ?? undefined;
  const score = (fact: WorldFact) => (fact.targetId === focus ? 40 : 0) + (fact.id.startsWith("touch:") ? 35 : fact.kind === "sound" ? 30 : fact.kind === "sensory" ? 20 : 5) - (narrated[fact.id] === JSON.stringify(fact.data) ? 35 : 0);
  const optionalFacts = [...context.optionalFacts].sort((a, b) => score(b) - score(a)).filter(f => score(f) > 0).slice(0, 6);
  const beats: NarrativeDirection["beats"] = [];
  for (const fact of results) {
    const type = typeOf(fact);
    const role = ["ENTER", "MOVE", "POSTURE"].includes(type) ? "approach" : type === "INSPECT" ? "contact" : type === "OPEN" ? "reveal" : ["TAKE", "HOLD", "STOW", "PUT", "DROP", "CLOSE"].includes(type) ? "aftermath" : "change";
    const previous = beats.at(-1);
    if (previous?.role === role && role === "approach") previous.resultFactIds.push(fact.id);
    else beats.push({ role, resultFactIds: [fact.id], detailFactIds: [] });
  }
  if (!beats.length) beats.push({ role: "change", resultFactIds: [], detailFactIds: [] });
  for (const detail of [...context.requiredFacts.filter(f => f.kind !== "result"), ...optionalFacts]) {
    let responsible: WorldFact | undefined;
    if (detail.kind === "contents") responsible = [...results].reverse().find(f => typeOf(f) === "TAKE" && (f.data.before as Record<string, unknown>).zone === detail.targetId || ["OPEN", "INSPECT"].includes(typeOf(f)) && f.targetId === detail.targetId);
    else if (detail.kind === "entity" && detail.data.discovered) responsible = results.find(f => ((f.data.after as Record<string, unknown>)?.revealedIds as string[] | undefined)?.includes(detail.targetId!));
    else if (detail.kind === "layout") responsible = [...results].reverse().find(f => ["ENTER", "MOVE", "LIGHT"].includes(typeOf(f)));
    else if (detail.kind === "lighting") responsible = [...results].reverse().find(f => ["LIGHT", "LIGHT_EXPIRED", "STOW", "HOLD", "CLOSE", "AUTO_CLOSE", "OPEN", "PUT", "DROP", "MOVE"].includes(typeOf(f)));
    else responsible = results.find(f => f.targetId === detail.targetId && (detail.id.startsWith("touch:") ? ["TAKE", "HOLD", "STOW", "OPEN", "CLOSE", "LIGHT", "UNLOCK", "PUSH", "PUT", "DROP"].includes(typeOf(f)) : typeOf(f) === "INSPECT"));
    const beat = responsible ? beats.find(b => b.resultFactIds.includes(responsible!.id))! : beats.at(-1)!;
    beat.detailFactIds.push(detail.id);
  }
  return { ...context, optionalFacts, direction: { focusTargetId: focus, beats } };
}
