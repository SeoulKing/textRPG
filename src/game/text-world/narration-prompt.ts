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
    "한국어 탐색 소설을 렌더링한다. intent는 선택한 의도다. requiredFacts의 kind=result 항목은 data에 실제 실행 결과를 담고 있으며 배열의 순서대로 일어났다. 이 결과와 현재 관찰의 성공·실패·발견·공간 정보를 빠짐없이 전달한다. direction.focusTargetId는 장면의 관심 대상이며 detailLinks는 동작과 관찰의 연결 근거다. 문장이나 문단의 분할 지시가 아니다.",
    "optionalFacts는 필요한 감각만 골라 쓴다. knownFacts는 과거 관찰이며 지금 보인다는 뜻이 아니다. recentScenes는 최근 세 장면의 문장 연결용으로만 쓰고 새 사실의 근거로 삼지 않는다. 이미 소개한 배치는 되풀이하지 않되, requiredFacts에 있는 배치나 연결은 지금 장면에서 전달해야 한다.",
    "response 감각은 action에 적힌 실제 조작의 반응이다. 현재 facts에 감각이 있을 때만 한두 개를 동작에 섞고 재질에서 촉감·온도를 추론하지 않는다. 첫 문단은 1~2문장으로 시작하되 움직임과 관찰을 함께 엮는다. 손에 든 물건이나 낮춘 자세는 현재 동작과 관련될 때 연결한다.",
    "명칭·위치·설명에서 겹치는 말은 한 번만 쓰되 발견 위치와 수량은 남긴다. 긴 placement 문구를 이름 앞에 통째로 붙이기보다 이동과 관찰 속에 풀어 쓴다. 접촉에서는 손과 물건의 관계를 분명히 한다.",
    "placement에 오른쪽 벽이라고만 적혔다면 그쪽에 보인다고 쓴다. 걸려 있다·고정되어 있다처럼 매달림이나 부착 상태를 새로 정하지 않는다.",
    "player의 현재 위치·시선·자세·도구에서 이어 쓴다. POSTURE 결과 없는 새 자세 변경을 만들지 않는다. 데이터에 없는 물건·재질·색·소리·냄새·사연·NPC·위험·감정·중요한 결정을 보태지 않는다. 수납 위치가 없으면 가방이나 주머니도 만들지 않는다.",
    "발견과 수집 모두 contents와 필수 결과의 물건 수량을 보존한다. 단위가 없는 쌀 같은 재료에 봉지·포대·자루 같은 포장을 붙이지 말고 주어진 이름 그대로 쓴다. 데이터에 없는 용기를 새로 만들지 않는다.",
    "paragraphCount.preferred를 기본으로 쓰고 min~max를 지킨다. JSON의 첫 속성 paragraphs를 먼저 완성하고 그 뒤 choiceLabels를 쓴다. {paragraphs:[{factIds,text}],choiceLabels:[{optionId,label,thought}]}만 반환한다. 각 문단은 factIds를 먼저 고른 뒤 그 사실들을 함께 담는 text를 쓴다. 앞 문단에서 다루지 않은 필수 사실은 다음 문단에 연결한다. factIds에는 해당 문단에서 실제 표현한 사실 ID만 쓴다. 본문에 ID·선택지·구조 설명을 노출하지 않는다.",
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
  if (types.has("THROW")) instructions.push("THROW는 실제 물건 한 개가 destinationName에 남고 충돌 소리가 난 사건이다. 명중·피해·파손이나 상대가 속았다는 결과를 만들지 않는다. 상대의 확인 가능한 이동은 ACTOR_MOVE에 있을 때만 서술한다.");
  if (types.has("STOPPED")) instructions.push("STOPPED에서 중단됐다. 이미 실행된 부분과 실패를 구분하고 그 뒤 미수행 행동을 성공했다고 쓰지 않는다.");
  if(context.results.some(e=>e.type==="OPEN" && e.after.actorKnown===false)) instructions.push("actorKnown이 false인 OPEN은 문이 열리는 것만 보이고 행위자는 확인하지 못한 사건이다. 누가 열었는지 이름이나 정체를 붙이지 말고, 내 행동으로도 쓰지 않는다.");
  if(context.results.some(e=>["ACTOR_ACTIVITY","NPC_CONSUME"].includes(e.type))) instructions.push("ACTOR_ACTIVITY와 NPC_CONSUME는 NPC가 실제로 한 행동이다. 플레이어 행동으로 바꾸지 않으며, 먹은 물건·양과 이동한 공간은 결과에 근거한다. NPC_CONSUME는 명시된 양의 음식을 실제로 먹은 사건이다. 먹는 주체를 그 문장에서 이름이나 분명한 지칭으로 드러내며, 받은 채 들고 있다는 이전 상태로 대신하지 않는다. 최근 선물 장면보다 이번 필수 결과의 식사 사실을 우선한다. ACTOR_ACTIVITY가 이어지면 식사와 휴식을 자연스럽게 연결한다. 식사나 휴식만으로 앉거나 일어섰다고 추론하지 말고 인물의 자세는 관찰된 경우에만 쓴다. NPC의 의도·배고픔 수치나 보지 못한 행동을 추측하지 않는다.");
  if(types.has("HIDE") || types.has("EMERGE")) instructions.push("HIDE의 relation under는 가구 아래, behind는 뒤이다. 두 위치를 바꾸지 않는다. EMERGE는 몸을 낮춘 채 숨은 자리에서 빠져나오는 행동이며, 일어선 자세는 그 뒤 POSTURE 결과가 있을 때만 쓴다. 숨은 상태만으로 상대가 나를 잊거나 위험이 사라졌다고 쓰지 않는다.");
  if(types.has("COMBAT") || context.results.some(e=>e.type==="ACTOR_MOVE" || e.type==="OPEN"&&e.after.actorName))instructions.push("COMBAT는 서버가 확정한 전투 결과다. damageDealt·damageTaken·resolution과 coverName·coverRelation만으로 적중, 부상, 엄폐 효과와 전투 종료를 판단한다. 엄폐는 반격 가능성을 낮추며 무적이나 은신 성공을 뜻하지 않는다. ACTOR_MOVE와 actorName이 있는 OPEN은 상대의 행동이다. 상대가 문을 열거나 따라오는 장면을 내 행동으로 바꾸지 않는다. ACTOR_MOVE 없이 상대가 뒤따라왔다고 쓰지 않는다. CLOSE 뒤 OPEN은 닫은 다음 다시 열린 순서이며, 닫으려다 실패한 것으로 바꾸지 않는다. 닫혀 있던 문을 여는 결과라면, 데이터에 없는 틈이나 구멍 너머로 손을 뻗는 동작을 만들지 않는다. 적의 무기·상처 부위·대사·시체의 전리품을 새로 만들지 않는다.");
  if (context.requiredFacts.some(f => ["lighting", "layout", "connection"].includes(f.kind))) instructions.push(
    "필수 lighting은 지금 구별할 수 있는 범위, layout은 눈앞 공간의 방향과 배치, connection은 실제 출입구의 연결이다. 문을 지났다는 말만으로 이 정보를 대신하지 않는다. 이동·상대의 반응과 섞어 현재 보이는 계단·사물·출입구를 짚는다. 첫 문단에 다 넣을 필요는 없고 paragraphCount 안에서 이어지는 문단을 사용할 수 있다.");
  instructions.push("최종 확인: requiredFacts의 모든 내용을 본문에서 실제로 표현하고 해당 문단의 factIds에 연결한다. paragraphs 전체 factIds의 합집합에 requiredFacts의 ID가 모두 있어야 한다. ID만 붙여 누락된 서술을 대신하지 않는다. optionalFacts는 모두 쓸 필요가 없다.");
  return instructions.join(" ");
}
