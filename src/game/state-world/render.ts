import { list, particle, quantity } from "../korean";
import type { Fact, Observation, Outcome } from "./model";

export function describeFact(fact: Fact): string {
  if (fact.kind === "room") return fact.status === "dark" ? "어두워서 주변을 확인할 수 없습니다." : fact.description ?? fact.name + "입니다.";
  if (fact.kind === "exit") return particle(fact.name, "으로", "로") + " 이어지는 출구가 있습니다.";
  if (fact.kind === "lock") return particle(fact.name, "은", "는") + (fact.locked ? " 잠겨 있습니다." : " 잠금이 풀려 있습니다.");
  if (fact.kind === "contents") {
    const items = list((fact.items ?? []).map(i => i.name + " " + quantity(i.quantity, i.unit)));
    const visible = items ? particle(items, "이", "가") + " 놓여 있습니다." : "";
    switch (fact.status) {
      case "empty": return particle(fact.name, "은", "는") + " 비어 있습니다.";
      case "closed": return visible + " " + particle(fact.name, "은", "는") + " 닫혀 있어 내부를 볼 수 없습니다.";
      case "dark": return "어두워서 내용물을 확인할 수 없습니다.";
      case "occluded": return particle(fact.name, "은", "는") + " 안쪽이 가려져 내용물을 확인할 수 없습니다.";
      case "partial": return visible + " 일부가 가려져 전체 내용물은 확인하지 못했습니다.";
      case "far": return "";
      default: return visible;
    }
  }
  if (fact.status === "dark") return particle(fact.name, "은", "는") + " 어두워서 현재 상태를 확인할 수 없습니다.";
  if (fact.openable) return particle(fact.name, "은", "는") + (fact.open ? " 열려 있습니다." : " 닫혀 있습니다.");
  return particle(fact.name + (fact.portable ? " " + quantity(fact.quantity!, fact.unit) : ""), "이", "가") + " 보입니다.";
}
export function signature(fact: Fact) { return JSON.stringify(fact); }

/** Select facts before writing. This function cannot change the world or observation history. */
export function render(observation: Observation, outcome: Outcome, narrated: ReadonlyMap<string, string>) {
  const wholeRoom = outcome.type === "enter" || outcome.type === "move" || outcome.type === "defocus" || outcome.type === "look" && !observation.focusId;
  const explicit = wholeRoom || outcome.type === "look" || outcome.type === "approach";
  const selected = observation.facts.filter(fact => {
    if (fact.kind === "room") return wholeRoom || fact.status === "dark" && narrated.get(fact.id) !== signature(fact);
    if (fact.kind === "exit") return wholeRoom;
    if (wholeRoom) return fact.kind === "object" || fact.kind === "contents" && fact.status !== "far";
    if (explicit || ["open", "close", "unlock"].includes(outcome.type)) return fact.targetId === observation.focusId;
    return narrated.get(fact.id) !== signature(fact) && fact.kind !== "object";
  });
  const lead = outcome.name ? particle(outcome.name, "을", "를") : "";
  const result = outcome.failed === "locked" ? particle(outcome.name!, "은", "는") + " 잠겨 있습니다."
    : outcome.type === "take" ? particle(outcome.name! + " " + quantity(outcome.quantity!, outcome.unit), "을", "를") + " 챙겼습니다."
    : outcome.type === "open" ? lead + " 열었습니다."
    : outcome.type === "close" ? lead + " 닫았습니다."
    : outcome.type === "unlock" ? outcome.name + "의 잠금을 풀었습니다."
    : outcome.type === "approach" ? particle(outcome.name!, "으로", "로") + " 다가갑니다."
    : outcome.type === "move" ? particle(outcome.name!, "으로", "로") + " 이동합니다." : "";
  // Contents already name the items; don't repeat their separate object facts in the same paragraph.
  const listed = new Set(selected.flatMap(f => f.kind === "contents" ? (f.items ?? []).map(i => i.id) : []));
  const described = new Set(selected.filter(f => f.kind === "contents" && ["closed", "empty", "occluded", "partial", "visible"].includes(f.status ?? "")).map(f => f.targetId));
  const paragraphs = [result, ...selected.filter(f => !(f.kind === "object" && described.has(f.targetId) && (!f.openable || !f.open))).filter(f => !(f.kind === "object" && listed.has(f.targetId))).map(describeFact)].filter(s => s.trim()).map(s => s.trim());
  return { paragraphs: paragraphs.length ? paragraphs : ["새롭게 확인한 변화는 없습니다."], selected };
}
