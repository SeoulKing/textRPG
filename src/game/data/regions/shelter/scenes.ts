import type { SceneDefinition } from "../../../schemas";

export const shelterSceneIdsWithoutLocationInteractions = [
  "prologue_opening",
  "prologue_repeat",
  "prologue_old_woman_visit",
  "shelter_crafting_menu",
] as const;

export const shelterSceneDefinitions: SceneDefinition[] = [
  {
    id: "prologue_opening",
    eventId: "prologue_event",
    locationId: "shelter",
    title: "프롤로그",
    paragraphs: [
      "지붕이라 부르기에도 민망한 천막 조각과 젖은 판자 사이로 스며드는 차가운 공기가, 눈을 뜨자마자 오늘이 악몽의 연장이 아니라 현실이라는 사실을 다시 알려 준다.",
      "주변 사람들은 저마다 몸을 웅크린 채 겨우 숨을 붙들고 있지만, 길게 말을 잇는 사람은 거의 없다. 마음속에 떠오르는 문장은 하나뿐이다. \"오늘은 어떻게든 살아남아야 한다.\"",
    ],
    choiceIds: ["opening_commit"],
    conditions: [
      { type: "location", locationId: "shelter" },
      { type: "flag_not", flag: "opening_seen" },
      { type: "flag_not", flag: "prologue_seen" },
    ],
    introFlag: "prologue_seen",
  },
  {
    id: "prologue_repeat",
    eventId: "prologue_event",
    locationId: "shelter",
    title: "프롤로그",
    paragraphs: [
      "\"어떻게든 살아남아야 한다.\" 그 문장을 붙잡고 있어야만 몸이 다시 움직일 것 같은 시간이 아직 가슴팍에 달라붙어 있다.",
    ],
    choiceIds: ["opening_commit"],
    conditions: [
      { type: "location", locationId: "shelter" },
      { type: "flag_not", flag: "opening_seen" },
      { type: "flag", flag: "prologue_seen" },
    ],
  },
  {
    id: "prologue_old_woman_visit",
    eventId: "prologue_event",
    locationId: "shelter",
    title: "프롤로그",
    paragraphs: [
      "마음을 다잡을 즈음, 천막 자락이 들리며 급식소 배식을 맡는 노파가 안으로 고개를 내민다. \"오늘 굶는 쪽으론 오래 못 버텨. 편의점 폐허에 가 봐. 안쪽 진열대에 아직 통조림이 남았을지도 몰라.\"",
      "그녀는 충고를 다 던져 놓고는 다른 생존자들을 살피러 돌아선다. \"생각만 있으면 지금 움직여.\" 짧은 한마디가 천막 안에 오래 남는다.",
    ],
    choiceIds: ["accept_first_canned_food_quest"],
    conditions: [
      { type: "location", locationId: "shelter" },
      { type: "flag", flag: "opening_seen" },
      { type: "flag_not", flag: "prologue_old_woman_seen" },
    ],
    introFlag: "prologue_old_woman_seen",
  },
  {
    id: "shelter_crafting_menu",
    locationId: "shelter",
    title: "제작 자리",
    paragraphs: [
      "당신은 주워 온 자재를 천막 바닥에 펼쳐 놓고, 지금 만들 수 있는 것들을 차분히 따져 본다.",
      "각 레시피에는 필요한 재료와 완성했을 때 도움이 되는 점이 적혀 있다. 재료가 모자라면 지금 당장은 만들 수 없지만, 무엇을 노려야 할지는 분명해진다.",
    ],
    choiceIds: [
      "craft_shelter_wall_patch",
      "craft_shelter_brazier",
      "craft_shelter_rain_bucket",
      "cook_at_shelter",
      "leave_shelter_crafting",
    ],
    conditions: [
      { type: "location", locationId: "shelter" },
      { type: "flag", flag: "shelter_crafting_open" },
    ],
  },
  {
    id: "shelter_first_intro",
    eventId: "prologue_event",
    locationId: "shelter",
    title: "임시 거처",
    paragraphs: [
      "임시 거처는 방이라기보다 천막과 낡은 판자를 겨우 이어 붙인 막사에 가깝다. 바람은 틈새로 스며들고, 습기는 천 조각마다 눅눅하게 배어 있다.",
      "그래도 당장 비를 피하고 숨을 고를 곳은 여기뿐이다. 오늘 밤을 넘기려면 쉬거나, 잠자리를 챙기거나, 주운 재료로 거처를 손볼 방법을 생각해야 한다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "shelter" },
      { type: "flag", flag: "opening_seen" },
      { type: "flag", flag: "prologue_old_woman_seen" },
      { type: "flag_not", flag: "intro_seen_shelter" },
    ],
    introFlag: "intro_seen_shelter",
  },
  {
    id: "shelter_repeat_postquest",
    locationId: "shelter",
    title: "임시 거처",
    paragraphs: [
      "천막 아래 공기는 여전히 차갑고 축축하지만, 이제는 여기서 무엇을 해야 하는지 조금은 분명하다. 쉬고, 만들고, 내일을 버틸 준비를 하는 곳이 바로 이 거처다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "shelter" },
      { type: "flag", flag: "opening_seen" },
      { type: "flag", flag: "intro_seen_shelter" },
      { type: "flag", flag: "first_canned_food_started" },
    ],
  },
  {
    id: "shelter_repeat_prequest",
    locationId: "shelter",
    title: "임시 거처",
    paragraphs: [
      "임시 거처는 여전히 서늘하고 비좁지만, 바깥으로 나가기 전에 숨을 고르기엔 이만한 곳도 없다.",
      "노파가 남긴 말이 아직 귀에 걸려 있다. \"생각만 있으면 지금 움직여.\" 오늘 식량이 필요하다면 편의점 폐허부터 확인해야 한다.",
    ],
    choiceIds: ["accept_first_canned_food_quest"],
    conditions: [
      { type: "location", locationId: "shelter" },
      { type: "flag", flag: "opening_seen" },
      { type: "flag", flag: "intro_seen_shelter" },
      { type: "flag_not", flag: "first_canned_food_started" },
    ],
  },
];
