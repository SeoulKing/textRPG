import { z } from "zod";
import { generateGeminiJson, hasGeminiConfig } from "../gemini-client";
import type { NarrativeContext, WorldEvent, WorldFact } from "../schemas/text-world";
import { particle } from "./world";
import { resolveChoiceNarratives, type ChoiceNarrative } from "./choice-narrative";
import { withoutRepeatedSubwayNarrative } from "../subway-narrative";

export type Narration = { paragraphs: string[]; source: "template" | "llm"; usedFactIds: string[]; choiceNarratives?: ChoiceNarrative[] };
export type TextWorldNarrator = (context: NarrativeContext, gameId: string) => Promise<Narration>;
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
    case "TAKE": return e.after.money ? "서랍에 남은 돈 " + e.after.amount + "원을 챙긴다." : particle(name, "을", "를") + (Number(e.after.amount) > 1 ? " " + e.after.amount + "개" : "") + (e.after.zone === "player" ? " 집어 들어 손에 쥔다." : " 챙긴다.");
    case "STORY": return String(e.after.text ?? "");
    case "LIGHT": return name + "의 스위치를 눌러 불을 " + (e.after.on ? "켠다." : "끈다.");
    case "LOOK": return "지금 있는 자리에서 방의 배치와 확인한 상태를 짚어 본다.";
    case "SURVEY": return "손전등 빛을 벽에서 바닥으로 옮기며 통로를 살핀다.";
    case "LEAVE": return "역무실 입구를 지나 대합실로 돌아간다.";
    case "STOPPED": return e.reason + " 그 지점에서 움직임을 멈춘다.";
  }
}
function factText(f: WorldFact): string {
  const d = f.data;
  if (f.kind === "result") return eventText(d as WorldEvent);
  if (f.kind === "connection") return d.name + "은 " + d.from + "과 " + d.to + " 사이를 잇는다.";
  if (f.kind === "layout") return String(d.layout);
  if (f.kind === "surface" || f.kind === "sensory") return String(d.detail);
  if (f.kind === "lighting") return d.lit ? "가까운 사물을 구별할 만큼 빛이 닿는다." : "빛이 없어 안쪽 사물의 윤곽을 구별할 수 없다.";
  if (f.kind === "threshold") return "열린 " + d.name + " 너머의 " + d.destination + "에는 빛이 없어 길을 더 살피기 어렵다.";
  if (f.kind === "contents") {
    const items = d.items as { name: string; amount: number; detail: string; unit?: string }[];
    const prefix = d.previouslyObserved ? "앞서 확인했을 때 " : "";
    return items.length ? prefix + d.name + " 안에는 " + particle(items.map(i => i.name + (i.unit ? " " + i.amount + i.unit : i.amount > 1 ? " " + i.amount + "개" : "")).join(", "), "이", "가") + (d.previouslyObserved ? " 있었다." : " 보인다.") : prefix + d.name + (d.previouslyObserved ? " 안은 비어 있었다." : " 안은 비어 있다.");
  }
  if (f.kind === "entity" && d.discovered) return d.placement + "에서 " + particle(String(d.name), "을", "를") + " 발견한다.";
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
    return { paragraphs: [parts.join(" ")], source: "template", usedFactIds: context.requiredFacts.map(f => f.id), choiceNarratives: resolveChoiceNarratives(context, []) };
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
    let text = use(fact);
    if (e.type === "POSTURE" && e.after.posture === "standing" && after?.type === "MOVE") {
      used.add(next.id);
      text = "몸을 일으켜 " + eventText(after);
    } else if (e.type === "MOVE" && after?.type === "POSTURE" && after.after.posture === "crouching") {
      used.add(next.id);
      text = text.replace(/다가간다[.]$/, "다가가 무릎을 굽힌다.");
    }
    if (e.type === "INSPECT") {
      const surface = find("surface", e.targetId);
      if (surface) text = "가까이 살펴보니 " + use(surface);
    }
    if (["UNLOCK", "OPEN", "CLOSE", "TAKE", "LIGHT"].includes(e.type)) {
      const touch = all.find(f => f.id.startsWith("touch:") && f.targetId === e.targetId && !used.has(f.id));
      if (touch) text = use(touch) + " " + text;
    }
    if (e.type === "OPEN" || e.type === "INSPECT") {
      const contents = find("contents", e.targetId);
      if (contents) text += " " + use(contents);
    }
    if (e.type === "TAKE") {
      const parent = String(e.before.zone ?? "");
      if (!results.slice(i + 1).some(f => f.data.type === "TAKE" && (f.data.before as Record<string, unknown>)?.zone === parent)) text += " " + use(find("contents", parent));
    }
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
    beats.push(context.player.posture === "crouching" ? "몸을 낮춘 채 " + context.player.facingLabel + " 앞에 머문다." : context.player.positionLabel + "에 서 있다.");
  }
  // Break at whole causal beats, never between a result and the discovery it exposes.
  const split = Math.max(1, Math.ceil(beats.length / 2));
  const paragraphs = context.paragraphCount.min === 1 ? [beats.join(" ")] : [beats.slice(0, split).join(" "), beats.slice(split).join(" ")];
  return { paragraphs, source: "template", usedFactIds: [...used], choiceNarratives: resolveChoiceNarratives(context, []) };
}
export const NarrationSchema = z.object({ paragraphs: z.array(z.object({ text: z.string().min(1).max(1100), factIds: z.array(z.string()).min(1) })).min(1).max(3), choiceNarratives: z.unknown().optional() });
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
  const crouched = context.results.some(e => e.type === "POSTURE" && e.after.posture === "crouching");
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
  return { paragraphs: paragraphs.map(p => p.text.replace(/마저\s+마저/g, "마저")), source: "llm", usedFactIds: [...used], choiceNarratives: resolveChoiceNarratives(context, parsed.data.choiceNarratives) };
}
export function validateRenderedNarration(context: NarrativeContext, raw: unknown): Narration | null {
  const value = raw as Partial<Narration> | null;
  if (!value || !Array.isArray(value.paragraphs) || !Array.isArray(value.usedFactIds) || !["template", "llm"].includes(value.source ?? "")) return null;
  const valid = validateNarration(context, { paragraphs: value.paragraphs.map(text => ({ text, factIds: value.usedFactIds })), choiceNarratives: value.choiceNarratives });
  return valid ? { ...valid, source: value.source! } : null;
}
export const narrateTextWorld: TextWorldNarrator = async (context, gameId) => {
  if (context.intent.id === "overview" || !hasGeminiConfig()) return fallbackNarration(context);
  try {
    const result = await generateGeminiJson(
      "당신은 탐색 게임의 소설 장면을 한국어로 렌더링한다. 현재 시제의 1인칭 체험으로 쓴다. 서술하는 본인은 나다. 나를 당신·너·플레이어·주인공이라 부르거나 밖에서 관찰하지 않는다. 나는·나의도 반복하지 않고, 주어를 생략한 동작과 감각으로 이어 간다. 내 손·내 눈처럼 구분이 필요할 때만 1인칭을 드러낸다. " +
      "행동 결과를 보고하는 목록이 아니라 직접 겪고 있는 장면을 쓴다. 한 동작 때문에 시야가 바뀌고, 닿은 감촉 때문에 다음 움직임이 이어지도록 쓴다. 불필요한 멈춤·시선 들기·다시 웅크리기를 꾸며 넣지 않는다. 이미 낮춘 자세이면 그 상태에서 이어 간다. 위치의 전체 주소를 매번 반복하지 않는다. intent는 시도한 의도이고 results는 엔진이 실제 수행한 순서다. STOPPED 뒤의 미수행 행동을 성공했다고 쓰지 않는다. requiredFacts의 성공·실패·발견·변화는 모두 전달한다. " +
      "optionalFacts의 감각과 표면 정보는 필요한 것만 고른다. 모든 사실을 나열할 필요는 없다. knownFacts는 과거에 확인한 것으로 현재 볼 수 있다는 뜻이 아니다. " +
      "recentScenes의 최근 세 장면을 이어 쓴다. 이미 묘사한 상자의 갈라진 뚜껑이나 방 배치를 매 장면 다시 소개하지 않는다. 문단 수를 채우려고 이전 문장을 의역하지 않는다. 수집이라면 물건을 챙기는 순서와 남은 상태를 따라 장면을 진행한다. 재입장 때 이미 확인한 방을 처음 발견한 듯 소개하지 않는다. 위치와 방향은 입구 기준의 고정 배치이며 현재 좌우로 뒤집지 않는다. " +
      "lighting의 lit은 사물을 구별할 정도라는 뜻이며 환한 조명이나 복도 전체가 밝다는 뜻이 아니다. 어두운 구역에서는 데이터에 있는 광원이 닿는 범위로 표현한다. connection은 문이 직접 연결하는 두 공간이다. 역무실의 대합실 쪽 입구와 복도로 통하는 철문은 서로 다른 출입구다. 입구 기준 좌우를 현재 시선 기준 좌우처럼 쓰지 않는다. 구역이 바뀐 MOVE 결과는 그곳으로 이동했음을 분명히 쓴다. 배경이 보인다는 문장으로 실제 이동을 생략하지 않는다. POSTURE 결과가 없는 장면에서 새로 앉거나 일어서는 동작을 쓰지 않는다. player의 현재 위치·시선·자세·손에 든 도구를 존중하고 직전 동작에서 이어진다. 몸을 낮춘 상태와 손에 든 손전등은 필요한 문장에서 자연스럽게 연결한다. " +
      "신체 감각과 관찰에 근거한 짧은 생각은 가능하지만 데이터에 없는 재질·색·소리·냄새·물건·사연·NPC·전투·위험을 만들지 않는다. 감정과 중요한 결정을 대신 정하지 않는다. " +
      "recentScenes는 문장 연결용이며 새로운 감각적 사실의 근거로 삼지 않는다. 수납 위치가 데이터에 없으면 가방이나 주머니를 새로 만들어 넣었다고 쓰지 말고 챙기는 동작만 쓴다. 같은 부사를 연달아 반복하지 않는다. " +
      "선택하지 않은 수집·이동을 쓰지 않는다. 열어 발견했을 뿐이면 챙겼다고 쓰지 않는다. 물건 수량을 보존한다. 단위가 정해지지 않은 쌀을 한 포대나 한 자루로 바꾸지 않는다. 수집 후 내용물이 비었다는 사실이 주어지면 그 빈 상태를 반드시 서술한다. " +
      "paragraphCount의 문단 수를 지킨다. 중요한 장면은 2~3문단 안에서 움직임·시선·사물·발견을 엮으며 문단별 역할을 고정하지 않는다. 재확인은 짧은 1문단이다. " +
      "alreadyDisplayed는 이번 선택 직후 이미 화면에 출력한 행동 시작 문장이다. 이를 반복·인용·의역하지 않고 바로 그 다음 결과부터 쓴다. 아직 결과가 나기 전의 준비 동작이므로 실제 results의 이동·개방·수집 성공이나 실패를 생략하지 않는다. " +
      "nextChoices는 이 장면 다음에 고를 수 있는 서버 확정 선택지다. 각 선택지에 대해 클릭 즉시 보여줄 짧은 한 문장(30~65자)을 choiceNarratives에 미리 쓴다. optionId를 그대로 보존한다. actionLead는 안전한 기본 동작 예시다. 이를 참고해 현재 시선과 움직임에 자연스럽게 연결한다. 그 선택을 시작하려는 의도·손 뻗기·시선만 쓴다. 이동 완료, 자세 변경, 발견, 문 개방, 잠금 해제, 수집 성공·실패, 숨은 내용물, 새 사물·감각은 미리 단정하지 않는다. 미래 선택의 결과는 paragraphs에도 넣지 않는다. " +
      "JSON {paragraphs:[{text,factIds}],choiceNarratives:[{optionId,text}]}만 반환한다. 각 문단의 factIds에는 실제 표현한 requiredFacts/optionalFacts ID만 넣는다. requiredFacts ID를 빠뜨리지 않는다. " +
      "본문에 ID, 선택지, 게임 수치, 구조 설명을 쓰지 않는다.",
      { context }, { responseSchema: NarrationSchema, responseJsonSchema: {
        type: "object", required: ["paragraphs", "choiceNarratives"], properties: { choiceNarratives: {
          type: "array", minItems: context.nextChoices?.length ?? 0, maxItems: context.nextChoices?.length ?? 0,
          items: { type: "object", required: ["optionId", "text"], properties: {
            optionId: { type: "string", ...((context.nextChoices?.length ?? 0) > 0 ? { enum: context.nextChoices!.map(o => o.id) } : {}) }, text: { type: "string" },
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
