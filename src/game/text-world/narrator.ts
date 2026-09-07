import { z } from "zod";
import { EXPLORATION_PROSE_STYLE } from "./narrative-style";
import { generateGeminiJson, hasGeminiConfig } from "../gemini-client";
import type { NarrativeContext, WorldEvent, WorldFact } from "../schemas/text-world";
import { particle } from "./world";
import { resolveChoiceLabels, type ChoiceLabel } from "./choice-labels";
import { withoutRepeatedSubwayNarrative } from "../subway-narrative";

export type Narration = { paragraphs: string[]; source: "template" | "llm"; usedFactIds: string[]; choiceLabels?: ChoiceLabel[] };
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
    case "OPEN": return particle(name, "을", "를") + " 연다.";
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
    case "LEAVE": return "역무실 입구를 지나 대합실로 돌아간다.";
    case "STOPPED": return e.reason + " 그 지점에서 움직임을 멈춘다.";
  }
}
function factText(f: WorldFact): string {
  const d = f.data;
  if (f.kind === "result") return eventText(d as WorldEvent);
  if (f.kind === "resource") {
    const status = Number(d.remaining) === 0 ? String(d.name) + (d.recoveryMinutes ? "은 잠시 쉬어 두어야 다시 작업할 수 있다." : "에서는 더 챙길 만한 것이 남아 있지 않다.") : String(d.name) + "에는 아직 작업할 부분이 남아 있다.";
    const tools = d.missingTools as string[];
    return status + (tools?.length ? " 다른 작업 방법에는 " + particle(tools.join(", "), "이", "가") + " 필요하다." : "");
  }
  if (f.kind === "connection") return d.name + "은 " + d.from + "과 " + d.to + " 사이를 잇는다.";
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
  if (context.location.id === "store") {
    const emptied = context.requiredFacts.some(f => f.kind === "contents" && Array.isArray(f.data.items) && f.data.items.length === 0 && !f.data.previouslyObserved);
    if (emptied && !/비어|비었|비운|비워|비게|아무것도|남은.{0,8}없|남아.{0,5}않|남지.{0,5}않/.test(text)) return true;
    const allowed = JSON.stringify([...context.requiredFacts, ...context.optionalFacts]);
    if (/포대|자루/.test(text) && !/포대|자루/.test(allowed)) return true;
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
export function validateNarration(context: NarrativeContext, raw: unknown): Narration | null {
  const parsed = NarrationSchema.safeParse(raw);
  if (!parsed.success) return null;
  const paragraphs = parsed.data.paragraphs.flatMap(p => {
    const text = withoutRepeatedSubwayNarrative([p.text], context.alreadyDisplayed).join(" ");
    return text ? [{ ...p, text }] : [];
  });
  const allowed = new Set([...context.requiredFacts, ...context.optionalFacts].map(f => f.id));
  const used = new Set(paragraphs.flatMap(p => p.factIds));
  if (paragraphs.length < context.paragraphCount.min || paragraphs.length > context.paragraphCount.max ||
    paragraphs.some(p => !p.text.trim() || p.factIds.some(id => !allowed.has(id)) || /(?:result|entity|contents|layout|surface|touch|interior|threshold|light|ambient|connection):[\w-]+/.test(p.text)) ||
    context.requiredFacts.some(f => !used.has(f.id)) || hasContradictoryAction(context, paragraphs.map(p => p.text).join(" ")) || paragraphs.some(p => /당신(?:은|이|을|의)|너는|네가|플레이어(?:는|가)|주인공(?:은|이)/.test(p.text))) return null;
  return { paragraphs: paragraphs.map(p => p.text.replace(/마저\s+마저/g, "마저")), source: "llm", usedFactIds: [...used], choiceLabels: resolveChoiceLabels(context, parsed.data.choiceLabels) };
}
export function validateRenderedNarration(context: NarrativeContext, raw: unknown): Narration | null {
  const value = raw as Partial<Narration> | null;
  if (!value || !Array.isArray(value.paragraphs) || !Array.isArray(value.usedFactIds) || !["template", "llm"].includes(value.source ?? "")) return null;
  const valid = validateNarration(context, { paragraphs: value.paragraphs.map(text => ({ text, factIds: value.usedFactIds })), choiceLabels: value.choiceLabels });
  return valid ? { ...valid, source: value.source! } : null;
}
export const narrateTextWorld: TextWorldNarrator = async (context, gameId) => {
  if (context.intent.id === "overview" || !hasGeminiConfig()) return fallbackNarration(context);
  try {
    const result = await generateGeminiJson(
      EXPLORATION_PROSE_STYLE + " " +
      "당신은 탐색 게임의 소설 장면을 한국어로 렌더링한다. 현재 시제의 1인칭 체험으로 쓴다. 서술하는 본인은 나다. 나를 당신·너·플레이어·주인공이라 부르거나 밖에서 관찰하지 않는다. 나는·나의도 반복하지 않고, 주어를 생략한 동작과 감각으로 이어 간다. 내 손·내 눈처럼 구분이 필요할 때만 1인칭을 드러낸다. " +
      "행동 결과를 보고하는 목록이 아니라 직접 겪고 있는 장면을 쓴다. 한 동작 때문에 시야가 바뀌고, 닿은 감촉 때문에 다음 움직임이 이어지도록 쓴다. 불필요한 멈춤·시선 들기·다시 웅크리기를 꾸며 넣지 않는다. 이미 낮춘 자세이면 그 상태에서 이어 간다. 위치의 전체 주소를 매번 반복하지 않는다. intent는 시도한 의도이고 results는 엔진이 실제 수행한 순서다. STOPPED 뒤의 미수행 행동을 성공했다고 쓰지 않는다. requiredFacts의 성공·실패·발견·변화는 모두 전달한다. " +
      "direction은 시선의 중심과 사건별로 연결할 사실 ID를 정리한 연출 정보다. beats의 순서를 따라 감각과 발견을 실제 원인에 붙인다. 이는 문단 구획이나 별도 문장 목록이 아니며, 여러 beat를 자연스럽게 이어 한 문단에 쓸 수 있다. 결과 ID 하나마다 문장을 하나씩 만들지 않는다. " +
      "optionalFacts의 감각과 표면 정보는 필요한 것만 고른다. 모든 사실을 나열할 필요는 없다. knownFacts는 과거에 확인한 것으로 현재 볼 수 있다는 뜻이 아니다. " +
      "recentScenes의 최근 세 장면을 이어 쓴다. 이미 묘사한 상자의 갈라진 뚜껑이나 방 배치를 매 장면 다시 소개하지 않는다. 문단 수를 채우려고 이전 문장을 의역하지 않는다. 수집이라면 물건을 챙기는 순서와 남은 상태를 따라 장면을 진행한다. 재입장 때 이미 확인한 방을 처음 발견한 듯 소개하지 않는다. 위치와 방향은 입구 기준의 고정 배치이며 현재 좌우로 뒤집지 않는다. " +
      "lighting의 lit은 사물을 구별할 정도라는 뜻이며 환한 조명이나 복도 전체가 밝다는 뜻이 아니다. 어두운 구역에서는 데이터에 있는 광원이 닿는 범위로 표현한다. connection은 문이 직접 연결하는 두 공간이다. 역무실의 대합실 쪽 입구와 복도로 통하는 철문은 서로 다른 출입구다. 입구 기준 좌우를 현재 시선 기준 좌우처럼 쓰지 않는다. 구역이 바뀐 MOVE 결과는 그곳으로 이동했음을 분명히 쓴다. 배경이 보인다는 문장으로 실제 이동을 생략하지 않는다. POSTURE 결과가 없는 장면에서 새로 앉거나 일어서는 동작을 쓰지 않는다. player의 현재 위치·시선·자세·손에 든 도구를 존중하고 직전 동작에서 이어진다. 몸을 낮춘 상태와 손에 든 손전등은 필요한 문장에서 자연스럽게 연결한다. " +
      "held는 실제 손에 든 물건, carried는 소유하고 지닌 물건, stowed는 챙겨 둔 물건이다. HOLD는 이미 지닌 것을 꺼내 들거나 고쳐 쥐는 행동이며 새 획득이 아니다. TAKE도 before.carried와 before.inventoryRegistered가 둘 다 참이면 이미 챙긴 물건을 용기에서 꺼내 드는 행동이다. inventoryDelta가 실제 인벤토리 변화를 정한다. containedItems는 이미 챙겨 둔 채 함께 옮긴 내용물이며, 그 밖의 숨은 내용물은 추측하지 않는다. STOW는 소유를 유지한 채 챙겨 두는 행동이고 PUT·DROP은 방에 남기는 행동이다. interaction.holding은 지금 조작에 관심을 둔 물건이며 null이어도 다른 물건이나 조명을 손에 들고 있을 수 있다. " +
      "신체 감각과 관찰에 근거한 짧은 생각은 가능하지만 데이터에 없는 재질·색·소리·냄새·물건·사연·NPC·전투·위험을 만들지 않는다. 감정과 중요한 결정을 대신 정하지 않는다. " +
      "SERVICE의 paragraphs는 실제 실행된 고유 사건의 기록이고 rewards·stats·moneyDelta는 실제 결과다. 기록에 있는 사람과 처치는 사용할 수 있지만 다른 무작위 결과를 만들지 않는다. 중단된 행동은 이미 실행된 부분까지만 쓴다. " +
      "recentScenes는 문장 연결용이며 새로운 감각적 사실의 근거로 삼지 않는다. 수납 위치가 데이터에 없으면 가방이나 주머니를 새로 만들어 넣었다고 쓰지 말고 챙기는 동작만 쓴다. 같은 부사를 연달아 반복하지 않는다. " +
      "선택하지 않은 수집·이동을 쓰지 않는다. 열어 발견했을 뿐이면 챙겼다고 쓰지 않는다. 물건 수량을 보존한다. 단위가 정해지지 않은 쌀을 한 포대나 한 자루로 바꾸지 않는다. 수집 후 내용물이 비었다는 사실이 주어지면 그 빈 상태를 반드시 서술한다. " +
      "paragraphCount의 문단 수를 지킨다. 중요한 장면은 2~3문단 안에서 움직임·시선·사물·발견을 엮으며 문단별 역할을 고정하지 않는다. 재확인은 짧은 1문단이다. " +
      "이번 결과 문장은 아직 화면에 표시되지 않았다. 선택한 의도에서 실제 행동과 발견까지 한 장면으로 자연스럽게 서술한다. 행동을 미리 출력했다고 가정하거나 준비 동작을 생략하지 않는다. " +
      "nextChoices는 서버가 확정한 다음 행동이다. choiceLabels에는 optionId와 자연스러운 버튼 문구 label, 그리고 선택한 줄 아래에 표시할 짧은 속말 thought를 쓴다. thought는 8~30자 정도의 일상적인 1인칭 독백 한 문장이다. 예: 계산대로 다가갈 때 돈이 좀 있을래나. 상황을 보고 생긴 궁금증이나 가벼운 의도만 담는다. defaultThought는 안전한 예시다. hidden contents를 아는 척하거나 수량·새 물건·감정·성공을 단정하지 않는다. 손을 뻗거나 다가가는 행동 묘사로 쓰지 않는다. 주어진 행동·대상·방향·수량과 labelNames의 이름을 보존한다. 새로운 기능이나 선택의 결과, 미리 보여줄 행동 서사는 만들지 않는다. 미래 선택의 결과를 paragraphs에도 넣지 않는다. " +
      "intent.thought는 클릭할 때 이미 보여 준 속말이며 행동 완료가 아니다. 본문에서 속말을 반복하지 않고 실제 행동과 관찰부터 자연스럽게 이어 쓴다. JSON {paragraphs:[{text,factIds}],choiceLabels:[{optionId,label,thought}]}만 반환한다. factIds에는 해당 문단에서 실제 표현한 사실의 ID만 기록하고 requiredFacts를 빠뜨리지 않는다. " +
      "본문에 ID, 선택지, 게임 수치, 구조 설명을 쓰지 않는다.",
      { context }, { responseSchema: NarrationSchema, responseJsonSchema: {
        type: "object", required: ["paragraphs", "choiceLabels"], properties: { choiceLabels: {
          type: "array", minItems: context.nextChoices?.length ?? 0, maxItems: context.nextChoices?.length ?? 0,
          items: { type: "object", required: ["optionId", "label", "thought"], properties: {
            optionId: { type: "string", ...((context.nextChoices?.length ?? 0) > 0 ? { enum: context.nextChoices!.map(o => o.id) } : {}) }, label: { type: "string" }, thought: { type: "string" },
          } },
        }, paragraphs: {
          type: "array", minItems: context.paragraphCount.min, maxItems: context.paragraphCount.max,
          items: { type: "object", required: ["text", "factIds"], properties: {
            text: { type: "string" }, factIds: { type: "array", minItems: 1, items: { type: "string", enum: [...context.requiredFacts, ...context.optionalFacts].map(f => f.id) } },
          } },
        } },
      }, timeoutMs: 20_000, trace: { gameId, scope: context.location.id === "store" ? "card" : "subway", target: "text-world:" + context.location.id + ":narrator" } },
    );
    return validateNarration(context, result) ?? fallbackNarration(context);
  } catch { return fallbackNarration(context); }
};
