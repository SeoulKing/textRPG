import type { NarrativeContext } from "../schemas/text-world";
import { EXPLORATION_PROSE_STYLE } from "./narrative-style";

export function compactNarrativeContext(context: NarrativeContext): NarrativeContext {
  const relevant = new Set([context.location.id, context.player.near, context.player.facing, context.player.heldToolId, context.player.heldItemId,
    ...context.results.flatMap(e => [e.targetId, String(e.before.zone ?? ""), String(e.after.zone ?? "")]),
    ...context.requiredFacts.map(f => f.targetId), ...(context.nextChoices ?? []).map(c => c.targetId)]);
  const currentIds = new Set([...context.requiredFacts, ...context.optionalFacts].map(f => f.id));
  return { ...context, knownFacts: context.knownFacts.filter(f => !currentIds.has(f.id) && Boolean(f.targetId && relevant.has(f.targetId))).slice(-12) };
}

export function needsGeneratedNarration(context: NarrativeContext) {
  if (context.intent.id === "overview") return false;
  const routine = context.results.length > 0 && context.results.every(e => ["HOLD", "STOW", "DEFOCUS", "LIGHT"].includes(e.type));
  const newInformation = context.requiredFacts.some(f => f.kind !== "result" && f.kind !== "lighting" && !(f.kind === "entity" && !f.data.discovered));
  return !routine || newInformation || context.interaction?.mode === "THREAT";
}

export function buildNarrationPrompt(context: NarrativeContext) {
  const types = new Set<string>(context.results.map(e => e.type));
  const instructions = [EXPLORATION_PROSE_STYLE,
    "한국어 탐색 소설을 렌더링한다. intent는 시도, results는 실제 실행 순서다. requiredFacts의 성공·실패·발견·변화를 빠짐없이 전달하고 선택하지 않은 행동을 완료하지 않는다. direction.beats는 원인에 감각과 발견을 연결하는 안내이며 문단별 역할은 고정하지 않는다.",
    "optionalFacts는 필요한 감각만 골라 쓴다. knownFacts는 과거 관찰이며 지금 보인다는 뜻이 아니다. recentScenes는 최근 세 장면의 문장 연결용으로만 쓰고 새 사실의 근거로 삼지 않는다. 이미 소개한 배치를 되풀이하지 않는다.",
    "response 감각은 action에 적힌 실제 조작 때만 발생한 반응이다. 현재 facts에 감각이 있을 때만 한두 개를 움직임 속에 섞는다. 감각 정보가 없으면 실제 움직임과 상태 변화만 이어 쓰며, 나무나 금속이라는 재질만 보고 거칠기·매끄러움·온도를 추론하지 않는다. 그 뒤 새로 드러난 정보에 호흡을 준다. 첫 문단은 1~2문장으로 읽을 거리를 빠르게 시작하고 남은 발견은 이어지는 문단에 쓴다. 손에 든 물건이나 낮춘 자세를 끝에 상태표처럼 덧붙이지 말고 지금 동작에 연결한다.",
    "사실을 전달한다는 것은 이름표를 전부 읽는다는 뜻이 아니다. '작은 금속 열쇠인 철문 열쇠'처럼 명칭과 설명을 겹치지 말고 '먼지 사이로 작은 톱니가 드러난다. 열쇠다.'처럼 관찰을 이어 쓴다. 발견 위치와 수량은 남긴다. 접촉을 쓰면 손과 물건의 관계를 분명히 한다. 손끝으로 전해지는 것은 차가움 같은 감각이며 물건 자체가 전해진다고 쓰지 않는다.",
    "placement에 오른쪽 벽이라고만 적혔다면 그쪽에 보인다고 쓴다. 걸려 있다·고정되어 있다처럼 매달림이나 부착 상태를 새로 정하지 않는다.",
    "player의 현재 위치·시선·자세·도구에서 이어 쓴다. POSTURE 결과 없는 새 자세 변경을 만들지 않는다. 데이터에 없는 물건·재질·색·소리·냄새·사연·NPC·위험·감정·중요한 결정을 보태지 않는다. 수납 위치가 없으면 가방이나 주머니도 만들지 않는다.",
    "발견과 수집 모두 contents와 results의 물건 수량을 보존한다. 단위가 없는 쌀 같은 재료에 봉지·포대·자루 같은 포장을 붙이지 말고 주어진 이름 그대로 쓴다. 데이터에 없는 용기를 새로 만들지 않는다.",
    "paragraphCount를 지킨다. JSON의 첫 속성 paragraphs를 먼저 완성하고 그 뒤 choiceLabels를 쓴다. {paragraphs:[{text,factIds}],choiceLabels:[{optionId,label,thought}]}만 반환한다. factIds에는 각 문단에서 실제 표현한 사실 ID만 쓴다. 본문에 ID·선택지·구조 설명을 노출하지 않는다.",
    "nextChoices는 엔진이 확정한 다음 행동이다. label의 행동·대상·방향·수량과 labelNames를 보존하고 표현만 다듬는다. thought는 8~30자의 짧은 속말이다. 예: 돈이 좀 있을래나. 궁금증이나 가벼운 의도만 쓰며 숨은 내용물·성공·행동 완료·미래 결과를 단정하지 않는다. defaultThought는 안전한 예시다. intent.thought는 클릭 때 이미 보여준 독백이므로 본문에 반복하지 않는다.",
  ];
  if (types.has("MOVE") || types.has("ENTER") || context.requiredFacts.some(f => f.kind === "connection" || f.kind === "layout")) instructions.push(
    "배치는 입구 기준의 고정 방향이다. 현재 시선 기준 좌우로 뒤집지 않는다. MOVE에서 구역이 바뀌면 실제로 걸어 이동했음을 쓴다. connection은 직접 연결된 두 공간이다. 역무실의 대합실 쪽 입구와 안쪽 복도의 철문은 서로 다른 출입구다.");
  if (["TAKE", "HOLD", "STOW", "PUT", "DROP"].some(type => types.has(type))) instructions.push(
    "held는 손에 든 물건, carried는 소유해 지닌 물건, stowed는 챙겨 둔 물건이다. HOLD와 before.carried·inventoryRegistered가 모두 참인 TAKE는 새 획득이 아니다. STOW는 소유를 유지하고 PUT·DROP은 방에 남긴다. 실제 증감은 inventoryDelta이며 containedItems는 함께 옮긴 소유 물건이다. 수량·단위를 보존하고 쌀을 임의로 포대나 자루로 만들지 않는다. 수집 후 빈 내용물이 주어지면 그 빈 상태도 쓴다.");
  if (types.has("OPEN") || types.has("INSPECT")) instructions.push("열거나 살펴 발견했을 뿐이면 물건을 챙겼다고 쓰지 않는다. 아직 열지 않은 내부를 묘사하지 않는다.");
  if (types.has("USE_TOOL")) instructions.push("USE_TOOL의 integrity가 남아 있으면 부분 손상이며 파괴나 통과를 완료했다고 쓰지 않는다. destroyed·opened·lockBroken을 구별한다. salvage는 부서진 자리에서 드러난 재료이며 별도로 TAKE하기 전에는 획득이 아니다. 도구가 망가졌으면 그 사실을 전달한다.");
  if (types.has("REPAIR")) instructions.push("REPAIR는 materials를 실제 소모해 사물의 구조를 복원한 행동이다. effort를 움직임의 근거로 사용한다. 내용물·잠금장치를 되살리거나 문을 저절로 닫았다고 쓰지 않는다. toolBroken과 남아 있는 lockBroken은 전달한다.");
  if (context.requiredFacts.some(f => f.kind === "facility")) instructions.push("facility는 이번에 알게 된 사용 조건과 효과다. 복원했다는 말만으로 대신하지 않는다. available이 참인 작업대는 kinds의 작업에 어떤 도움을 주는지 전달한다. durationMultiplier가 1보다 작으면 그 작업에 드는 시간이 줄어든다는 뜻이며, 수치를 쓰면 실제 감소율을 지킨다. 재료 보관함은 열어 둔 재료를 이곳의 작업에 사용할 수 있다는 조건을 전달한다.");
  if (types.has("LIGHT") || context.player.heldTool || context.location.lighting === "dark") instructions.push("lit은 구별할 정도의 빛이다. 광원이 닿는 범위만 묘사하며 구역 전체가 환하다고 단정하지 않는다.");
  if (types.has("SERVICE")) instructions.push("SERVICE의 paragraphs는 실제 고유 사건 기록이다. 기록의 인물과 처치만 사용하고 rewards·stats·moneyDelta와 다른 결과를 만들지 않는다.");
  if (types.has("STOPPED")) instructions.push("STOPPED에서 중단됐다. 이미 실행된 부분과 실패를 구분하고 그 뒤 미수행 행동을 성공했다고 쓰지 않는다.");
  return instructions.join(" ");
}
