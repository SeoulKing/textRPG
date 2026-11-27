import type { NarrativeContext, WorldEvent } from "../schemas/text-world";

type Paragraph = { text: string; factIds: string[] };
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const consumption = /먹(?:는다|는\s*(?:동안|사이|중)|고|으며|은|었다|었고|기\s*시작한다|어\s*치운다|어\s*치우고)|식사(?:를)?\s*(?:마친다|마치고|끝낸다|끝내고)|비(?:운다|우고|웠다|우며|운)/g;

/** A deliberately bounded Korean check for an irreversible, observed result.
 * Fact IDs alone are declarations, not proof that the named actor actually ate.
 * Unclear attribution is left to the factual fallback, never guessed from history.
 */
function describesActorAction(text: string, actor: string, actorNames: string[], verbs: RegExp, relativeVerb?: RegExp) {
  let antecedent: string | undefined;
  for (const sentence of text.split(/[.!?\n]+/).filter(Boolean)) {
    const subjects: { at: number; end: number; name: string }[] = [];
    for (const name of actorNames) {
      for (const match of sentence.matchAll(new RegExp(escape(name) + "(?:은|는|이|가|도)(?=\\s|$)", "g")))
        subjects.push({ at: match.index!, end: match.index! + match[0].length, name });
    }
    for (const match of sentence.matchAll(/(?:^|\s)(나는|내가|나도|난)(?=\s|$)/g))
      subjects.push({ at: match.index!, end: match.index! + match[0].length, name: "player" });
    for (const match of sentence.matchAll(/(?:^|\s)(그는|그가|그녀는|그녀가)(?=\s|$)/g))
      subjects.push({ at: match.index!, end: match.index! + match[0].length, name: antecedent ?? "unknown" });
    subjects.sort((a, b) => a.at - b.at);
    for (const match of sentence.matchAll(verbs)) {
      const at = match.index!, tail = sentence.slice(at + match[0].length);
      if (/(?:안|못)\s*$/.test(sentence.slice(0, at)) || /^\s*(?:싶|척|싶어|싶다)/.test(tail)
        || /^\s*(?:것|건|게)\s*(?:아니|아닌)/.test(tail)) continue;
      const subject = subjects.filter(s => s.end <= at).at(-1)?.name;
      // A postposed subject, e.g. "캔 음식 하나를 먹은 슈미가 쉰다".
      const relative = relativeVerb?.test(match[0]) && new RegExp("^\\s*" + escape(actor) + "(?:은|는|이|가)(?=\\s|$)").test(tail);
      if (subject === actor || relative) return true;
    }
    if (subjects.length) antecedent = subjects.at(-1)!.name;
  }
  return false;
}

function describesConsumption(text: string, actor: string, actorNames: string[]) {
  return describesActorAction(text, actor, actorNames, consumption, /(?:먹은|비운)$/);
}
const rest = /쉬고\s*있|쉰다|쉬며|쉬는\s*(?:동안|사이)/g;
const sitting = /앉(?:아|았|는다|고|으며|은)/g;
function observedActors(context: NarrativeContext) {
  return context.results.filter(e=>e.actorId && e.actorId!=="player")
    .map(e=>({id:e.actorId!, name:String(e.after.actorName ?? e.after.name ?? "")})).filter(actor=>actor.name);
}
/** A rest or meal does not imply a sitting posture. Never use generated history as evidence. */
export function hasUnsupportedActorPosture(context: NarrativeContext, paragraphs: Paragraph[]) {
  const actors=observedActors(context),names=[...new Set(actors.map(actor=>actor.name))];
  return actors.some(actor=>{
    if (!paragraphs.some(p=>describesActorAction(p.text,actor.name,names,sitting,/(?:앉은)$/))) return false;
    const evidence=[...context.requiredFacts,...context.optionalFacts,...context.knownFacts]
      .filter(f=>f.targetId===actor.id || f.kind==="result" && f.data.actorId===actor.id).map(f=>f.data);
    return !/앉(?:아|았|는다|고|으며|은)|"posture":"(?:sitting|seated)"/.test(JSON.stringify(evidence));
  });
}

export function missingEventOutcomes(context: NarrativeContext, paragraphs: Paragraph[], actorContext = context) {
  const names = [...new Set(actorContext.results.filter(e => e.actorId && e.actorId !== "player")
    .map(e => String(e.after.actorName ?? e.after.name ?? "")).filter(Boolean))];
  return context.requiredFacts.filter(fact => {
    if (fact.kind !== "result") return false;
    const event = fact.data as WorldEvent;
    if (event.type !== "NPC_CONSUME") return false;
    const name = String(event.after.name ?? "");
    return !name || !paragraphs.some(p => describesConsumption(p.text, name, names));
  }).map(fact => fact.id);
}

/** Do not stream a claimed player-move paragraph that reinstates already eaten food. */
export function contradictoryActorOutcomes(context: NarrativeContext, paragraphs: Paragraph[]) {
  return context.requiredFacts.filter(fact => {
    const event=fact.data as WorldEvent;
    if(fact.kind!=="result" || event.type!=="NPC_CONSUME")return false;
    const name=String(event.after.name??""),item=String(event.after.itemName??"");
    return paragraphs.some(p=>p.text.split(/[.!?\n]+/).some(sentence=>sentence.includes(name) && sentence.includes(item)
      && /(?:받아\s*쥔|손에\s*(?:쥔|든)|들고)\s*채/.test(sentence)
      && /쉬고\s*있다|쉰다|서\s*있다|머물[고며]/.test(sentence)
      && !describesConsumption(sentence,name,[name])));
  }).map(f=>f.id);
}
/** Wait for the complete response if prose performs an event whose ID is assigned elsewhere. */
export function hasUnclaimedEventOutcome(context: NarrativeContext, paragraph: Paragraph) {
  const names=[...new Set(observedActors(context).map(actor=>actor.name))];
  return context.requiredFacts.some(f=>{
    if(f.kind!=="result" || paragraph.factIds.includes(f.id))return false;
    const event=f.data as WorldEvent,name=String(event.after.name??"");
    if(event.type==="NPC_CONSUME")return describesConsumption(paragraph.text,name,names);
    // An untagged rest in the early prose would otherwise be repeated by recovery.
    return event.type==="ACTOR_ACTIVITY" && /쉬고\s*있|쉰다/.test(String(event.after.detail??""))
      && describesActorAction(paragraph.text,name,names,rest);
  });
}
