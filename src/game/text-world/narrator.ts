import { z } from "zod";
import { buildNarrationPrompt, compactNarrativeContext, needsGeneratedNarration } from "./narration-prompt";
import { completedParagraphs } from "../gemini-stream";
import { currentObservation, markAction, publishParagraph, recordActionTiming } from "../action-observation";
import { generateGeminiJson, hasGeminiConfig } from "../gemini-client";
import type { NarrativeContext, WorldEvent, WorldFact } from "../schemas/text-world";
import { particle } from "./world";
import { resolveChoiceLabels, type ChoiceLabel } from "./choice-labels";
import { withoutRepeatedSubwayNarrative } from "../subway-narrative";

export type Narration = { paragraphs: string[]; paragraphSources?: ("llm" | "template")[]; source: "template" | "llm"; usedFactIds: string[]; choiceLabels?: ChoiceLabel[] };
export type TextWorldNarrator = (context: NarrativeContext, gameId: string) => Promise<Narration>;
function movedContents(e: WorldEvent) {
  const contents = e.after.containedItems as { name: string; amount: number }[] | undefined;
  return contents?.length ? " " + contents.map(item => item.name + (item.amount > 1 ? " " + item.amount + "개" : "")).join(", ") + "도 함께 옮긴다." : "";
}
function serviceParagraphs(e: WorldEvent) {
  const paragraphs = [...((e.after.paragraphs ?? []) as string[])];
  const rewards = (e.after.rewards ?? []) as { name: string; amount: number }[];
  if (rewards.length) {
    const receipt = particle(rewards.map(item => item.name + (item.amount > 1 ? " " + item.amount + "개" : "")).join(", "), "을", "를") + " 챙겨 둔다.";
    if (paragraphs.length) paragraphs[paragraphs.length - 1] += " " + receipt;
    else paragraphs.push(receipt);
  }
  return paragraphs.length ? paragraphs : [e.after.interrupted ? "행동을 이어가던 도중 멈춘다." : String(e.after.label) + "."];
}
function eventText(e: WorldEvent) {
  const name = String(e.after.name ?? "").split(" · ").at(-1)!;
  switch (e.type) {
    case "ENTER": return e.after.entryText ? String(e.after.entryText) : "대합실에서 역무실 입구로 발을 들인다.";
    case "MOVE": return e.before.zone !== e.after.zone ? name + (e.after.position === "far-door" ? "의 철문 안쪽으로 돌아온다." : e.after.position === "storage-end" ? "의 창고 쪽 끝으로 나온다." : " 입구까지 걸음을 옮긴다.") : (e.after.placement ?? "주변") + "의 " + particle(name, "으로", "로") + " 다가간다.";
    case "POSTURE": return e.after.posture === "crouching" ? "무릎을 굽혀 몸을 낮춘다." : "몸을 일으켜 선다.";
    case "INSPECT": return particle(name, "을", "를") + " 가까이서 살핀다.";
    case "UNLOCK": return particle(String(e.after.keyName), "을", "를") + " 자물쇠에 끼워 돌려 " + name + "의 잠금을 푼다.";
    case "USE_TOOL": {
      const method = e.after.technique === "pry" ? "의 잠금장치를 비틀어 연다." : e.after.technique === "cut" ? "의 구조에 날을 대어 자른다." : "에 충격을 가한다.";
      return particle(String(e.after.toolName), "으로", "로") + " " + name + method
        + (e.after.destroyed ? " 구조가 부서진다." + (e.after.opened ? e.after.portal ? " 막혔던 통로가 열린다." : " 가려져 있던 안쪽이 드러난다." : "") : e.after.technique !== "pry" ? " 아직 구조가 남아 있다." : "")
        + (e.after.toolBroken ? " 사용한 도구가 닳아 더는 쓸 수 없다." : "");
    }
    case "NPC_REACTION": return name + "의 목소리가 들린다. “" + String(e.after.dialogue) + "”";
    case "OPEN": return particle(name, "을", "를") + " 연다.";
    case "REPAIR": return String(e.after.effort) + " " + particle(name, "을", "를") + " 다시 쓸 수 있게 손본다."
      + (e.after.lockBroken ? " 망가진 잠금장치는 그대로다." : "") + (e.after.toolBroken ? " 사용한 도구가 닳아 더는 쓸 수 없다." : "");
    case "CLOSE": return particle(name, "을", "를") + " 닫는다.";
    case "TAKE": if (e.before.carried && e.before.inventoryRegistered) return particle(name, "을", "를") + (e.before.relation === "on" ? " 다시 집어 든다." : " 꺼내 손에 든다.") + movedContents(e);
      return e.after.money ? "서랍에 남은 돈 " + e.after.amount + "원을 챙긴다." : particle(name, "을", "를") + (Number(e.after.amount) > 1 ? " " + e.after.amount + "개" : "") + (e.after.held || e.after.zone === "player" && e.after.itemId === null ? " 집어 들어 손에 쥔다." : " 챙긴다.") + movedContents(e);
    case "HOLD": return particle(name, "을", "를") + (e.before.held ? " 손에 고쳐 쥔다." : " 꺼내 손에 든다.");
    case "STOW": return particle(name, "을", "를") + (e.before.on ? " 끄고 챙겨 둔다." : " 챙겨 둔다.");
    case "PUSH": return particle(name, "을", "를") + " 밀어 " + e.after.destinationName + (e.after.relation === "blocking" ? " 앞을 막는다." : " 옆으로 옮긴다.");
    case "PUT": return particle(name, "을", "를") + " " + e.after.destinationName + (e.after.relation === "inside" ? " 안에 넣는다." : " 위에 내려놓는다.") + movedContents(e);
    case "DROP": return particle(name, "을", "를") + " 지금 자리 옆에 내려놓는다." + movedContents(e);
    case "WAIT": return "움직임을 멈추고 잠시 주변의 변화를 기다린다.";
    case "HIDE": return name + " 뒤로 몸을 옮겨 낮춘다.";
    case "AUTO_CLOSE": return name + "이 저절로 닫힌다.";
    case "LIGHT_EXPIRED": return name + "의 불이 꺼진다.";
    case "SOUND": return String(e.after.description ?? "");
    case "WORK": {
      const tools = (e.after.tools ?? []) as { name: string; before: number; after: number }[];
      const wear = tools.map(tool => tool.after === 0 ? particle(tool.name, "이", "가") + " 닳아 더는 사용할 수 없다." : particle(tool.name, "은", "는") + " 작업한 만큼 닳아 있다.").join(" ");
      return (e.after.interrupted ? name + "에서 작업을 이어가던 도중 멈춘다." : String(e.after.effort) + (e.after.empty ? " 시간을 들였지만 챙길 만한 물건은 찾지 못한다." : "")) + (wear ? " " + wear : "");
    }
    case "SERVICE": return serviceParagraphs(e).join(" ");
    case "STORY": return String(e.after.text ?? "");
    case "LIGHT": return name + "의 스위치를 눌러 불을 " + (e.after.on ? "켠다." : "끈다.");
    case "FOCUS": return name + " 쪽으로 시선을 모은다.";
    case "DEFOCUS": return name + "에서 시선을 떼고 주변으로 관심을 옮긴다.";
    case "LOOK": return "지금 있는 자리에서 방의 배치와 확인한 상태를 짚어 본다.";
    case "SURVEY": return "손전등 빛을 벽에서 바닥으로 옮기며 통로를 살핀다.";
    case "LEAVE": return String(e.after.exitText ?? "역무실 입구를 지나 대합실로 돌아간다.");
    case "STOPPED": return e.reason + " 그 지점에서 움직임을 멈춘다.";
  }
}
function factText(f: WorldFact): string {
  const d = f.data;
  if (f.kind === "result") return eventText(d as WorldEvent);
  if (f.kind === "resource") {
    const status = d.unlimited ? String(d.name) + "에서 작업을 이어갈 수 있다." : Number(d.remaining) === 0 ? String(d.name) + (d.recoveryMinutes ? "은 잠시 쉬어 두어야 다시 작업할 수 있다." : "에서는 더 챙길 만한 것이 남아 있지 않다.") : String(d.name) + "에는 아직 작업할 부분이 남아 있다.";
    const tools = d.missingTools as string[];
    return status + (tools?.length ? " 다른 작업 방법에는 " + particle(tools.join(", "), "이", "가") + " 필요하다." : "");
  }
  if (f.kind === "connection") return d.name + "은 " + d.from + "과 " + d.to + " 사이를 잇는다.";
  if (f.kind === "facility") {
    if (d.storage) return String(d.name) + "에 넣어 둔 재료는 뚜껑을 열어 두면 이곳에서 작업할 때 쓸 수 있다.";
    if (!d.available) return String(d.name) + "는 구조를 복원해야 작업에 쓸 수 있다.";
    const kinds = (d.kinds as string[] ?? []).map(kind => ({ craft: "제작", cook: "요리", build: "건설" } as Record<string, string>)[kind] ?? "작업").join("·");
    const reduction = Math.round((1 - Number(d.durationMultiplier)) * 100);
    return String(d.name) + (reduction > 0 ? "를 사용하면 " + kinds + " 시간이 " + reduction + "% 줄어든다." : "에서 " + kinds + " 작업을 할 수 있다.");
  }
  if (f.kind === "structure") return d.destroyed ? d.name + "의 구조는 부서진 상태다." : d.lockBroken ? d.name + "의 잠금장치가 망가져 있다." : d.integrity !== d.maxIntegrity ? d.name + "의 " + d.material + " 구조에 손상이 남아 있다." : d.name + "의 구조는 " + d.material + "로 되어 있다.";
  if (f.kind === "layout") return String(d.layout);
  if (f.kind === "surface" || f.kind === "sensory") return String(d.detail);
  if (f.kind === "sound") return (d.direction ? d.direction + "에서 " : "") + d.description + (d.intensity === "muffled" ? " 소리는 희미하게 전해진다." : "");
  if (f.kind === "lighting") return d.lit ? "가까운 사물을 구별할 만큼 빛이 닿는다." : "빛이 없어 안쪽 사물의 윤곽을 구별할 수 없다.";
  if (f.kind === "threshold") return "열린 " + d.name + " 너머의 " + d.destination + "에는 빛이 없어 길을 더 살피기 어렵다.";
  if (f.kind === "contents") {
    const items = d.items as { name: string; amount: number; detail: string; unit?: string }[];
    const prefix = d.previouslyObserved ? "앞서 확인했을 때 " : "";
    return items.length ? prefix + d.name + " 안에는 " + particle(items.map(i => i.name + (i.unit ? " " + i.amount + i.unit : i.amount > 1 ? " " + i.amount + "개" : "")).join(", "), "이", "가") + (d.previouslyObserved ? " 있었다." : " 보인다.") : prefix + d.name + (d.previouslyObserved ? " 안은 비어 있었다." : " 안은 비어 있다.");
  }
  if (f.kind === "entity" && d.discovered) return d.placement + "에서 " + particle(String(d.name), "을", "를") + " 발견한다.";
  if (f.kind === "entity" && d.carried && !d.held) return particle(String(d.name), "은", "는") + " 지니고 있다.";
  if (f.kind === "entity") return d.held ? "손에는 " + particle(String(d.name), "이", "가") + " 들려 있다." + (typeof d.on === "boolean" ? " 불은 " + (d.on ? "켜져 있다." : "꺼져 있다.") : "") : d.placement + "의 " + particle(String(d.name), "은", "는") + (typeof d.isOpen === "boolean" ? d.isOpen ? " 열려 있다." : d.locked ? " 잠겨 있다." : " 닫혀 있다." : " 그 자리에 놓여 있다.");
  return "";
}
export function fallbackNarration(context: NarrativeContext): Narration {
  const all = [...context.requiredFacts, ...context.optionalFacts];
  if (context.intent.id === "overview") {
    const layout = all.find(f => f.kind === "layout");
    const parts = [layout?.data.geometry ? String(layout.data.geometry) : "지금 자리에서 확인했던 배치를 떠올린다."];
    for (const f of context.requiredFacts) {
      if (f.kind === "layout" || f.kind === "result" || f.kind === "lighting" && context.location.lighting === "lit") continue;
      parts.push(factText(f));
    }
    return { paragraphs: [parts.join(" ")], source: "template", usedFactIds: context.requiredFacts.map(f => f.id), choiceLabels: resolveChoiceLabels(context, []) };
  }
  const used = new Set<string>();
  const beats: string[] = [];
  const use = (fact: WorldFact | undefined) => { if (!fact || used.has(fact.id)) return ""; used.add(fact.id); return factText(fact); };
  const find = (kind: string, target?: string) => all.find(f => f.kind === kind && f.targetId === target && !used.has(f.id));
  const results = context.requiredFacts.filter(f => f.kind === "result");
  for (let i = 0; i < results.length; i++) {
    const fact = results[i];
    if (used.has(fact.id)) continue;
    const e = fact.data as WorldEvent, next = results[i + 1], after = next?.data as WorldEvent | undefined;
    if (e.type === "SERVICE") {
      used.add(fact.id); beats.push(...serviceParagraphs(e)); continue;
    }
    let text = use(fact);
    if (e.type === "TAKE" && e.after.itemId) {
      const group = [fact];
      for (let j = i + 1; j < results.length; j++) {
        const other = results[j].data as WorldEvent;
        if (other.type !== "TAKE" || !other.after.itemId || other.before.zone !== e.before.zone) break;
        group.push(results[j]);
      }
      if (group.length > 1) {
        for (const member of group) used.add(member.id);
        const names = group.map(member => { const data = (member.data as WorldEvent).after; return data.name + (Number(data.amount) > 1 ? " " + data.amount + "개" : ""); }).join(", ");
        text = particle(names, "을", "를") + (group.every(member => { const event = member.data as WorldEvent; return event.before.carried && event.before.inventoryRegistered; }) ? " 차례로 꺼내 든다." : " 차례로 챙긴다.");
        i += group.length - 1;
      }
    }
    if (e.type === "POSTURE" && e.after.posture === "standing" && after?.type === "MOVE") {
      used.add(next.id);
      text = "몸을 일으켜 " + eventText(after);
    } else if (e.type === "MOVE" && after?.type === "POSTURE" && after.after.posture === "crouching") {
      used.add(next.id);
      text = text.replace(/다가간다[.]$/, "다가가 무릎을 굽힌다.");
    }
    if (e.type === "INSPECT") {
      const surface = find("surface", e.targetId);
      if (surface) text = (context.results.some(result => result.type === "MOVE" && result.targetId === e.targetId) ? "가까워진 자리에서 보니 " : "시선을 모아 살펴보니 ") + use(surface);
    }
    if (["UNLOCK", "OPEN", "CLOSE", "TAKE", "HOLD", "STOW", "LIGHT"].includes(e.type)) {
      const touch = all.find(f => f.id.startsWith("touch:") && f.targetId === e.targetId && !used.has(f.id));
      if (touch) {
        const detail = use(touch);
        text = e.type === "OPEN" && detail.includes("가장자리") ? detail + " 그 가장자리를 짚고 " + particle(String(e.after.name), "을", "를") + " 연다." : detail + " " + text;
      }
    }
    const response = all.find(f => f.id.startsWith("response:") && f.targetId === e.targetId && f.data.action === e.type && !used.has(f.id));
    if (response) text += " " + use(response);
    if (e.type === "OPEN" || e.type === "INSPECT") {
      const openedLater = e.type === "INSPECT" && results.slice(i + 1).some(f => f.data.type === "OPEN" && f.targetId === e.targetId);
      const contents = openedLater ? undefined : find("contents", e.targetId);
      if (contents) text += " " + use(contents);
    }
    if (e.type === "TAKE") {
      const parent = String(e.before.zone ?? "");
      if (!results.slice(i + 1).some(f => f.data.type === "TAKE" && (f.data.before as Record<string, unknown>)?.zone === parent)) text += " " + use(find("contents", parent));
    }
    if (e.type === "PUSH") text += " " + use(find("sound", e.targetId));
    if (e.type === "SURVEY") text += " " + use(find("surface", context.location.id));
    if (e.type === "ENTER" || e.type === "MOVE") {
      const ambient = all.find(f => f.id.startsWith("ambient:") && !used.has(f.id));
      if (ambient) text += " " + use(ambient);
    }
    beats.push(text.trim());
  }
  for (const fact of context.requiredFacts) if (!used.has(fact.id)) beats.push(use(fact));
  const held = all.find(f => f.kind === "entity" && f.data.held && !used.has(f.id));
  if (held && !context.results.some(e => e.type === "LIGHT" || e.type === "TAKE" && e.after.zone === "player")) beats.push(use(held));
  if (beats.length < context.paragraphCount.min) {
    beats.push(context.player.posture === "crouching" ? "몸을 낮춘 채 " + context.player.positionLabel + "에 머문다." : context.player.positionLabel + "에 서 있다.");
  }
  // Break at whole causal beats, never between a result and the discovery it exposes.
  const split = Math.max(1, Math.ceil(beats.length / 2));
  const paragraphs = context.paragraphCount.min === 1 ? [beats.join(" ")] : [beats.slice(0, split).join(" "), beats.slice(split).join(" ")];
  return { paragraphs, source: "template", usedFactIds: [...used], choiceLabels: resolveChoiceLabels(context, []) };
}
export const NarrationSchema = z.object({ paragraphs: z.array(z.object({ text: z.string().min(1).max(1100), factIds: z.array(z.string()).min(1) })).min(1).max(3), choiceLabels: z.unknown().optional() });
export function hasContradictoryAction(context: NarrativeContext, text: string): boolean {
  // These surface qualities were invented in a real repair response. Material or
  // earlier narration alone is not evidence for a current tactile observation.
  const evidence = JSON.stringify([...context.requiredFacts, ...context.optionalFacts].map(f => f.data));
  if ([/거칠|거친|까칠/, /매끄럽|매끄러|매끈/].some(quality => quality.test(text) && !quality.test(evidence))) return true;
  if (context.location.id === "store") {
    const emptied = context.requiredFacts.some(f => f.kind === "contents" && Array.isArray(f.data.items) && f.data.items.length === 0 && !f.data.previouslyObserved);
    if (emptied && !/비어|비었|비운|비워|비게|아무것도|남은.{0,8}없|남아.{0,5}않|남지.{0,5}않/.test(text)) return true;
    const allowed = JSON.stringify([...context.requiredFacts, ...context.optionalFacts]);
    if (["포대", "자루", "봉지"].some(unit => text.includes(unit) && !allowed.includes(unit))) return true;
  }
  const crossed = context.results.some(e => e.type === "MOVE" && e.before.zone !== e.after.zone);
  if (crossed && !/들어(?:선|온|간)|돌아(?:온|간)|걸어|걸음|발(?:을|걸음)|지나|옮|나온|나선/.test(text)) return true;
  if (context.results.some(e => e.type === "TAKE") && !/챙|집어|쥐|거둬|가져|수거/.test(text)) return true;
  const crouched = context.results.some(e => (e.type === "POSTURE" || e.type === "HIDE") && e.after.posture === "crouching");
  const stood = context.results.some(e => e.type === "POSTURE" && e.after.posture === "standing");
  if (!crouched && /(?:쪼그|쭈그|쭈구)(?:려|리고) 앉는다|몸을 낮춘다|무릎을 굽힌다/.test(text)) return true;
  if (!stood && /몸을 일으(?:켜|킨다)|몸을 일으켜 세운다|자리에서 일어선다/.test(text)) return true;
  const connections = [...context.requiredFacts, ...context.optionalFacts].filter(f => f.kind === "connection");
  for (const f of connections) {
    // The concourse is outside the room network. A room-to-room door cannot become its exit.
    const name = String(f.data.name).replace(/[.*+?^${}()|[\]\\]/g, char => "\\" + char);
    if (f.data.from !== "대합실" && f.data.to !== "대합실" && new RegExp("대합실(?:로|에)\\s*(?:곧장\\s*|바로\\s*)?(?:통하는|이어지는|연결된)\\s*" + name).test(text)) return true;
  }
  return false;
}
function missingFacilityEffect(context: NarrativeContext, paragraphs: { text: string; factIds: string[] }[]) {
  return context.requiredFacts.filter(f => f.kind === "facility" && !f.data.storage && f.data.available && Number(f.data.durationMultiplier) < 1).some(f => {
    const text = paragraphs.filter(p => p.factIds.includes(f.id)).map(p => p.text).join(" ");
    const work = /제작|만들|요리|조리|건설|짓|작업/.test(text);
    const faster = /시간.{0,20}(줄|덜|짧|단축|절약)|덜 (걸|들)|빨리|빠르게|빨라|빨랐|빠르/.test(text);
    const percentages = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|퍼센트)/g)].map(match => Number(match[1]));
    const expected = Math.round((1 - Number(f.data.durationMultiplier)) * 100);
    return !work || !faster || (percentages.length > 0 && !percentages.includes(expected));
  });
}
export function validateNarration(context: NarrativeContext, raw: unknown): Narration | null {
  const parsed = NarrationSchema.safeParse(raw);
  if (!parsed.success) return null;
  const paragraphs = parsed.data.paragraphs.flatMap(p => {
    let text = withoutRepeatedSubwayNarrative([p.text], context.alreadyDisplayed).join(" ");
    // A wall location does not imply a hook. Preserve the observed location while
    // removing the unsupported attachment inferred in actual generated prose.
    const facts = [...context.requiredFacts, ...context.optionalFacts];
    for (const entity of facts.filter(f => f.kind === "entity" && !f.data.carried)) {
      const evidence = JSON.stringify(facts.filter(f => f.targetId === entity.targetId).map(f => f.data));
      if (/걸려|매달려/.test(evidence)) continue;
      const name = String(entity.data.name).replace(/[.*+?^${}()|[\]\\]/g, char => "\\" + char);
      text = text.replace(new RegExp("(" + name + "(?:이|가))\\s*(?:걸려|매달려)\\s*있다", "g"), "$1 보인다");
    }
    return text ? [{ ...p, text }] : [];
  });
  const allowed = new Set([...context.requiredFacts, ...context.optionalFacts].map(f => f.id));
  const used = new Set(paragraphs.flatMap(p => p.factIds));
  if (paragraphs.length < context.paragraphCount.min || paragraphs.length > context.paragraphCount.max ||
    paragraphs.some(p => !p.text.trim() || p.factIds.some(id => !allowed.has(id)) || /(?:result|entity|contents|layout|surface|touch|interior|threshold|light|ambient|connection):[\w-]+/.test(p.text)) ||
    context.requiredFacts.some(f => !used.has(f.id)) || missingFacilityEffect(context, paragraphs) || hasContradictoryAction(context, paragraphs.map(p => p.text).join(" ")) || paragraphs.some(p => /당신(?:은|이|을|의)|너는|네가|플레이어(?:는|가)|주인공(?:은|이)/.test(p.text))) return null;
  return { paragraphs: paragraphs.map(p => p.text.replace(/마저\s+마저/g, "마저")), source: "llm", usedFactIds: [...used], choiceLabels: resolveChoiceLabels(context, parsed.data.choiceLabels) };
}
export function validateRenderedNarration(context: NarrativeContext, raw: unknown): Narration | null {
  const value = raw as Partial<Narration> | null;
  if (!value || !Array.isArray(value.paragraphs) || !Array.isArray(value.usedFactIds) || !["template", "llm"].includes(value.source ?? "")) return null;
  const valid = validateNarration(context, { paragraphs: value.paragraphs.map(text => ({ text, factIds: value.usedFactIds })), choiceLabels: value.choiceLabels });
  return valid ? { ...valid, source: value.source!, paragraphSources: value.paragraphSources?.length === valid.paragraphs.length && value.paragraphSources.every(s => s === "llm" || s === "template") ? value.paragraphSources : undefined } : null;
}
export const narrateTextWorld: TextWorldNarrator = async (fullContext, gameId) => {
  const context = compactNarrativeContext(fullContext);
  if (!needsGeneratedNarration(context) || !hasGeminiConfig()) {
    recordActionTiming({ narration: "template", fallbackReason: hasGeminiConfig() ? "routine_action" : "not_configured" });
    return fallbackNarration({ ...context, paragraphCount: needsGeneratedNarration(context) ? context.paragraphCount : { min: 1, max: 1 } });
  }
  const accepted: { text: string; factIds: string[] }[] = [];
  let invalidPrefix = false;
  const remainingFallback = () => {
    const used = new Set(accepted.flatMap(p => p.factIds));
    let requiredFacts = context.requiredFacts.filter(f => !used.has(f.id));
    const optionalFacts = context.optionalFacts.filter(f => !used.has(f.id));
    if (!requiredFacts.length && accepted.length >= context.paragraphCount.min) return { paragraphs: [], usedFactIds: [] };
    // The first paragraph can cover every mandatory fact. A fallback still needs an
    // observed fact for the remaining paragraph, not an untagged posture filler.
    if (!requiredFacts.length) requiredFacts = optionalFacts.filter(f => ["sensory", "surface", "entity", "connection"].includes(f.kind)).slice(0, 1);
    const results = requiredFacts.filter(f => f.kind === "result").map(f => f.data as WorldEvent);
    return fallbackNarration({ ...context, results, requiredFacts, optionalFacts, paragraphCount: { min: 1, max: 1 } });
  };
  const recover = (reason: string): Narration => {
    recordActionTiming({ narration: accepted.length ? "mixed" : "template", fallbackReason: reason });
    if (!accepted.length) return fallbackNarration(context);
    const tail = remainingFallback();
    return { paragraphs: [...accepted.map(p => p.text), ...tail.paragraphs],
      paragraphSources: [...accepted.map(() => "llm" as const), ...tail.paragraphs.map(() => "template" as const)],
      source: tail.paragraphs.length ? "template" : "llm", usedFactIds: [...new Set([...accepted.flatMap(p => p.factIds), ...tail.usedFactIds])],
      choiceLabels: resolveChoiceLabels(context, []) };
  };
  try {
    const result = await generateGeminiJson(buildNarrationPrompt(context), { context }, {
      // Partial output is usable before the final JSON object and its choice wording exist.
      onJsonProgress: currentObservation()?.observer.onParagraph ? text => {
        if (!currentObservation()?.observer.onParagraph || invalidPrefix) return;
        const paragraphs = completedParagraphs(text);
        // Reserve one paragraph for any missing facts if the stream fails or is truncated.
        while (accepted.length < paragraphs.length && accepted.length < context.paragraphCount.max - 1) {
          const raw = paragraphs[accepted.length];
          const paragraph = NarrationSchema.shape.paragraphs.element.safeParse(raw);
          if (!paragraph.success) { invalidPrefix = true; break; }
          const ids = new Set(paragraph.data.factIds);
          const localContext = { ...context, paragraphCount: { min: 1, max: 1 },
            requiredFacts: context.requiredFacts.filter(f => ids.has(f.id)),
            results: context.requiredFacts.filter(f => f.kind === "result" && ids.has(f.id)).map(f => f.data as WorldEvent) };
          const valid = validateNarration(localContext, { paragraphs: [paragraph.data] });
          if (!valid) { invalidPrefix = true; break; }
          accepted.push({ text: valid.paragraphs[0], factIds: paragraph.data.factIds });
          // Before publishing, prove a deterministic continuation can still complete this scene.
          const tail = remainingFallback();
          const completion = { paragraphs: [...accepted, ...tail.paragraphs.map(text => ({ text, factIds: tail.usedFactIds }))] };
          if (!validateNarration(context, completion)) { accepted.pop(); break; }
          publishParagraph(valid.paragraphs[0], "llm");
        }
      } : undefined,
      responseJsonSchema: {
        type: "object", required: ["paragraphs", "choiceLabels"], properties: {
          paragraphs: { type: "array", minItems: context.paragraphCount.min, maxItems: context.paragraphCount.max,
            items: { type: "object", required: ["text", "factIds"], properties: {
              text: { type: "string" }, factIds: { type: "array", minItems: 1, items: { type: "string", enum: [...context.requiredFacts, ...context.optionalFacts].map(f => f.id) } },
            } } },
          choiceLabels: { type: "array", minItems: context.nextChoices?.length ?? 0, maxItems: context.nextChoices?.length ?? 0,
            items: { type: "object", required: ["optionId", "label", "thought"], properties: {
              optionId: { type: "string", ...((context.nextChoices?.length ?? 0) ? { enum: context.nextChoices!.map(o => o.id) } : {}) },
              label: { type: "string" }, thought: { type: "string" },
            } } },
        },
      },
      timeoutMs: 20_000, trace: { gameId, scope: context.location.id === "store" ? "card" : "subway", target: "text-world:" + context.location.id + ":narrator" },
    });
    const valid = validateNarration(context, result);
    if (!valid || accepted.some((p, i) => p.text !== valid.paragraphs[i])) return recover("invalid_narration");
    recordActionTiming({ narration: "llm" });
    return valid;
  } catch (error) { return recover(error instanceof Error && /timeout|abort/i.test(error.name + error.message) ? "timeout" : "generation_failed"); }
};

/** All room adapters share final validation and exactly-once paragraph publication. */
export async function renderNarration(context: NarrativeContext, gameId: string, narrator: TextWorldNarrator) {
  markAction("rulesMs");
  const observation = currentObservation(), start = observation?.paragraphs.length ?? 0;
  let rendered: Narration;
  try { rendered = validateRenderedNarration(context, await narrator(structuredClone(context), gameId)) ?? fallbackNarration(context); }
  catch { rendered = fallbackNarration(context); }
  const emitted = (observation?.paragraphs.length ?? start) - start;
  for (let i = emitted; i < rendered.paragraphs.length; i++) publishParagraph(rendered.paragraphs[i], rendered.paragraphSources?.[i] ?? rendered.source);
  return rendered;
}
