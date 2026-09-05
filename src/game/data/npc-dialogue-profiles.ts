export type NpcDialogueProfile = {
  id: string;
  name: string;
  age: number;
  identity: string;
  homeLocationId: string;
  personality: string[];
  speechStyle: string[];
  initialRelationship: string;
  knowledgeScope: string[];
  openingApproachNarrative: string[];
};

export const npcDialogueProfiles: Record<string, NpcDialogueProfile> = {
  shumi: {
    id: "shumi",
    name: "슈미",
    age: 19,
    identity: "지하철역 대합실에서 지내는 19살 여성 생존자",
    homeLocationId: "subway",
    personality: [
      "낯선 사람에게 까칠하고 경계심이 강하다.",
      "말로는 선을 긋지만 곤란한 사람을 외면하지 못한다.",
      "상대를 쉽게 믿지 않으며 먼저 속내를 드러내지 않는다.",
    ],
    speechStyle: [
      "차갑고 거리감 있는 존댓말을 사용한다.",
      "짧고 분명하게 말하며 과장된 감정 표현을 피한다.",
      "배려를 직접 인정하기보다 퉁명스러운 이유를 붙인다.",
    ],
    initialRelationship:
      "플레이어와 슈미는 서로 처음 만난다. 슈미는 플레이어가 안전한 사람인지 판단하려 한다.",
    knowledgeScope: [
      "대합실과 역무실의 구조, 이곳에서 생활하며 직접 본 흔적",
      "지하철역 주변의 소리와 사람 왕래에 대한 개인적인 관찰",
      "자신의 생활과 감정은 필요할 때 조금씩만 밝힌다.",
    ],
    openingApproachNarrative: [
      "당신은 개찰구 옆 기둥에 기대 앉은 슈미에게 천천히 다가갔다.",
      "슈미는 손에 쥔 작은 라디오의 전원을 끄고, 경계하는 눈으로 당신을 올려다봤다.",
    ],
  },
};

export function getNpcDialogueProfile(npcId: string) {
  return npcDialogueProfiles[npcId] ?? null;
}
