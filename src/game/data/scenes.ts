import type { SceneDefinition } from "../schemas";

export const sceneDefinitions: SceneDefinition[] = [
  {
    id: "shelter_opening",
    locationId: "shelter",
    title: "거처는 당신보다 먼저 깨어난다",
    paragraphs: [
      "천막 틈으로 스며든 새벽빛은 늘 병든 색이었다. 눅눅한 담요와 찌그러진 양은그릇 사이에서, 사람들은 밤새 미뤄 둔 한숨을 조금씩 토해 내고 있었다.",
      "오늘도 버틸 수 있을지는 아직 누구도 모른다. 다만 가만히 앉아 운을 기다리는 것만으로는, 이 도시가 한 끼도 더 내어주지 않으리라는 사실만은 분명했다.",
    ],
    choiceIds: ["opening_commit"],
    conditions: [
      { type: "location", locationId: "shelter" },
      { type: "day_lt", value: 2 },
      { type: "flag_not", flag: "opening_seen" },
    ],
  },
  {
    id: "shelter_day_intro",
    locationId: "shelter",
    title: "잠시 숨을 고를 수 있는 곳",
    paragraphs: [
      "이 거처는 안전이라기보다, 아직 무너지지 않았다는 말에 가까웠다. 그래도 바깥보다 먼저 생각할 수 있는 곳이 있다는 것만으로 숨이 조금은 길어졌다.",
      "식량과 물, 오늘을 견딜 만한 소문과 길의 조각들. 필요한 모든 것은 여기서 시작되지만, 오래 머무는 것은 하나도 없다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "shelter" }],
  },
  {
    id: "convenience_scene",
    locationId: "convenience",
    title: "무너진 진열대 사이로 아직 하루치 생존이 남아 있다",
    paragraphs: [
      "자동문은 반쯤 열린 채 비틀어져 있었고, 바닥에는 깨진 유리와 오래전에 쏟아진 과자 부스러기가 눅눅하게 달라붙어 있었다. 선반마다 비어 있는 칸이 더 많았지만, 손을 뻗으면 아직 무언가 건져 올릴 수 있을 것 같은 빈틈이 군데군데 남아 있었다.",
      "형광등은 이미 죽었고, 안쪽 냉장 진열대는 검은 입처럼 벌어져 있었다. 이곳에서 필요한 건 용기보다는 인내였다. 남들이 지나친 작고 하찮은 것들 속에서, 오늘 저녁을 겨우 이어 줄 조각을 찾아내야 했다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "convenience" }],
  },
  {
    id: "kitchen_scene",
    locationId: "kitchen",
    title: "허기가 줄을 세우는 곳",
    paragraphs: [
      "급식소 앞의 줄은 이상할 만큼 조용했다. 사람들은 접시보다 눈치를 먼저 들고 있었고, 냄비에서 오르는 김보다 내일 이야기 쪽에 더 오래 시선을 두고 있었다.",
      "여기서는 한 끼가 곧 안도였고, 안도는 언제나 작은 대가를 데리고 왔다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "kitchen" }],
  },
];
