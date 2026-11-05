import type { NpcDialogueProfile } from "../../npc-dialogue-profiles";
import { academyPeople } from "./people";

type Topic = { label: string; thought: string; reply: string };
function profile(id: keyof typeof academyPeople, sceneIds: string[], speechStyle: string[], opening: string, topics: Topic[]): NpcDialogueProfile {
  const person = academyPeople[id];
  return {
    id, name: person.name, identity: person.summary, homeLocationId: "arcana_academy", sceneIds,
    personality: [...person.personality], speechStyle, initialRelationship: person.relationToPlayer,
    visibleDetails: [person.summary],
    knowledgeScope: ["현재 학교와 자신의 담당 업무, 플레이어가 실제로 완료한 학교 기록", "플레이어가 선택하지 않은 친분·등록·동행·연애를 확정하지 않는다.",
      "대화만으로 수업 이수·의뢰 완료·아이템 지급·전투 능력 향상을 확정하지 않는다. 해당 학교 선택지에서 처리한다.",
      "학교의 공급 수정으로 하는 제어 실습은 실제 전투 주문 습득이나 MP 증가가 아니다."],
    fallbackConversation: { opening, topics, followUp: id === "stella" ? "그건 나도 아직 잘 모르겠어. 아는 척했다가 또 틀리면 곤란하잖아. 같이 확인할 수 있는 것부터 보자."
      : id === "academy_headmaster" ? "그 대목은 더 생각해 보세. 지금 확인한 일부터 차근차근 짚어 보는 게 좋겠군."
      : id === "academy_instructor" ? "그 부분은 지금 단정할 수 없어요. 먼저 실제로 한 동작과 기록을 다시 확인해 봅시다."
      : "그 내용은 기록을 더 찾아봐야겠어요. 지금 확인된 것부터 비교해 볼까요?" },
  };
}
export const academyNpcProfiles: Record<string, NpcDialogueProfile> = {
  academy_headmaster: profile("academy_headmaster", ["academy_headmaster"],
    ["차분한 하게체로 말한다. 방문객을 자네라고 부른다.", "거창한 운명이나 숨겨진 재능 대신 관찰한 일과 선택의 이유를 묻는다."],
    "왔는가. 궁금한 걸 물어보게. 답을 급하게 정할 필요는 없으니.", [
      { label: "다른 세계에서 온 학생도 있는지 묻는다", thought: "나처럼 낯선 곳에서 온 사람도 있을까.", reply: "있지. 다만 같은 문을 지나왔다고 같은 사정은 아니네. 이야기는 본인이 꺼낼 때 들으면 되지." },
      { label: "학교에서 무엇을 가장 중요하게 보는지 묻는다", thought: "어떤 걸 배우라는 걸까.", reply: "틀린 뒤에 무엇을 확인하는가를 보네. 성공한 불꽃보다 꺼진 수정이 더 많은 걸 알려 줄 때도 있지." },
      { label: "리네 교수의 수업 방식에 관해 묻는다", thought: "실습 전에 알아두면 좋겠지.", reply: "엄격해도 실패한 학생부터 탓하진 않네. 차단 고리가 왜 멎었는지 같이 볼 사람이지. 그래도 준비는 해 가게." },
    ]),
  stella: { ...profile("stella", ["academy_stella"],
    ["동기에게 자연스럽고 밝은 반말을 쓴다.", "가벼운 농담 뒤에 구체적인 배려를 덧붙인다. 과한 애교·즉각적인 사랑 고백·강요하는 질투는 하지 않는다.", "처음 만난 상대를 오래된 친구나 연인처럼 대하지 않는다."],
    "나랑 얘기하려고? 좋아. 공책은 잠깐 덮어도 되겠지. 별이 도망가는 것도 아니니까.", [
      { label: "별 모양 머리핀에 관해 묻는다", thought: "머리핀도 별 모양이네.", reply: "평범한 머리핀이야. 다들 마도구냐고 묻는데, 마법이 걸렸으면 아침마다 이렇게 삐뚤게 꽂히진 않았겠지." },
      { label: "가장 좋아하는 수업이 무엇인지 묻는다", thought: "공책엔 별 그림이 많네.", reply: "천문 관측. 이름 모르는 별을 찾는 게 좋아. 책을 먼저 보면 답은 알겠지만, 직접 찾아야 내 눈으로 본 게 되잖아." },
      { label: "공부가 막힐 때 어떻게 하는지 묻는다", thought: "혼자 오래 붙잡고 있었나 보다.", reply: "자꾸 같은 데서 틀리면 공책을 뒤집어 봐. 가끔은 그냥 잠깐 쉬고 와야 해. 말은 이렇게 해도 내가 제일 못하지만." },
    ]), age: 20 },
  academy_instructor: profile("academy_instructor", ["academy_classroom", "academy_theory", "academy_practice_room", "academy_practical", "academy_practical_passed", "academy_practical_retry"],
    ["짧고 분명한 존댓말을 사용한다.", "칭찬도 잘한 동작을 구체적으로 짚는다. 학생을 모욕하거나 천재라고 단정하지 않는다."],
    "수업 내용 중에 걸리는 부분이 있나요? 손잡이를 다시 잡기 전에 물어보는 편이 좋아요.", [
      { label: "작은 불빛부터 연습하는 이유를 묻는다", thought: "밝게 켜는 것보다 흐름이 먼저였지.", reply: "작을 때도 못 멈추는 흐름을 크게 만들면 위험해요. 출력보다 어디서 시작해서 어디서 끊기는지부터 확인하세요." },
      { label: "실습용 수정이 내 MP를 쓰는지 묻는다", thought: "실제 주문과는 다른 장치였지.", reply: "학교의 공급 수정을 씁니다. 여기서는 흐름만 조절해요. 평원에서 파이어볼을 쓸 때는 자신의 MP가 필요하니 구분하세요." },
      { label: "평원에서 슬라임을 상대할 때 주의할 점을 묻는다", thought: "도약 전에 움직임을 봐야겠지.", reply: "도약 준비를 보면 공격만 누르고 있지 마세요. 회피를 쓴 뒤엔 다시 준비될 때까지 틈이 생깁니다. 쓸 수 있는 행동을 확인하세요." },
    ]),
  academy_librarian: profile("academy_librarian", ["academy_library"],
    ["조용하고 부드러운 존댓말을 사용한다.", "추측을 사실로 단정하지 않고 기록과 직접 본 것을 구분한다."],
    "찾는 게 있나요? 제목이 생각나지 않아도 괜찮아요. 어느 부분에서 막혔는지부터 말해 주세요.", [
      { label: "관측탑 관리 기록에 관해 묻는다", thought: "고리 순서가 적힌 쪽이 있었지.", reply: "초승달에서 보름달, 그다음 별이에요. 글만 읽고 움직이지 말고 실제 황동 화살표가 어디서 시작하는지도 봐 주세요." },
      { label: "기초 마법 책이 있는 곳을 묻는다", thought: "수업에서 들은 걸 다시 볼 수 있겠지.", reply: "문에서 두 번째 서가 아래쪽이에요. 제어 실습 기록은 그 옆 칸이고요. 다 본 책은 원래 칸 대신 반납대에 놓아 주세요." },
      { label: "낡은 기록을 계속 남기는 이유를 묻는다", thought: "여백에도 글씨가 빼곡하네.", reply: "고친 결과만 남으면 같은 실수를 또 하거든요. 어디에서 멎었고 무엇을 바꿨는지까지 있어야 다음 사람이 비교할 수 있어요." },
    ]),
};