import type { SceneDefinition } from "../../../schemas";

export const kitchenSceneDefinitions: SceneDefinition[] = [
  {
    id: "kitchen_first_intro",
    locationId: "kitchen",
    title: "급식소",
    paragraphs: [
      "급식소 앞에는 이미 사람들이 모여 있다. 빈 그릇을 든 채 줄을 선 이들 사이로 묽은 국 냄새와 금세 식어 버릴 김이 번지고, 누구도 크게 말하지 않지만 모두가 자기 차례를 놓치지 않으려 어깨를 세운다.",
      "배식대 쪽에서는 노파가 접시를 밀어 넣는 손놀림으로 사람들을 재촉한다. \"다음 사람, 빨리.\" 짧고 메마른 그 말 사이에도, 줄 끝에 선 사람들의 눈빛에는 오늘 하루만큼은 더 버텨 보겠다는 기색이 남아 있다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "flag_not", flag: "intro_seen_kitchen" },
    ],
    introFlag: "intro_seen_kitchen",
  },
  {
    id: "kitchen_repeat_intro",
    locationId: "kitchen",
    title: "급식소",
    paragraphs: [
      "사람들이 줄을 이룬 채 묵묵히 자기 순서를 기다리고 있다. 배식대 앞 공기에는 허기와 소문이 한데 뒤섞여 천천히 떠돈다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "flag", flag: "intro_seen_kitchen" },
    ],
  },
];
