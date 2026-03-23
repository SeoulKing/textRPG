import type { SceneDefinition } from "../../../schemas";

export const shelterSceneIdsWithoutLocationInteractions = [
  "prologue_opening",
  "prologue_repeat",
  "prologue_old_woman_visit",
] as const;

export const shelterSceneDefinitions: SceneDefinition[] = [
  {
    id: "prologue_opening",
    eventId: "prologue_event",
    locationId: "shelter",
    title: "프롤로그",
    paragraphs: [
      "지붕이라 부르기에도 민망한 천막 조각과 판자 틈새 사이로 스민 찬 공기가 새벽보다 먼저 폐 안으로 파고든다. 눈을 뜨자마자 떠오르는 것은 어젯밤의 꿈이 아니라, 오늘을 버티지 못하면 여기서 끝난다는 감각이다.",
      "사람들은 저마다 몸을 웅크린 채 누워 있지만, 깊이 잠든 얼굴은 거의 없다. 몸을 일으키기도 전에 마음속에서는 이미 한 문장이 또렷해진다. \"오늘은 어떻게든 살아남아야 한다.\"",
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
      "오늘은 그저 시간을 견디는 날이 아니다. \"어떻게든 살아남겠다\"고 스스로에게 말해야만 비로소 몸이 움직일 것 같은 순간이 아직 가슴 한복판에 붙어 있다.",
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
      "간신히 마음을 다잡은 순간, 천막 자락이 들리며 급식소 배식을 맡는 노파가 얼굴을 내민다. 주름이 깊게 패인 얼굴은 피곤해 보였지만, 목소리만은 이상하리만치 또렷했다. \"오늘 나가는 죽으로는 오래 못 버틴다. 편의점 잔해로 가 봐. 안쪽 진열대엔 아직 손 안 탄 통조림이 남았을지도 몰라.\"",
      "그 말은 위로라기보다 오늘을 버티기 위한 지시처럼 들린다. 노파는 더 설명하지 않고 천막 안쪽 사람들을 턱짓으로 가리킨 뒤, \"살 생각이 있으면 지금 움직여\" 하고 낮게 덧붙이며 조용히 자리를 비켜 선다.",
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
    id: "shelter_first_intro",
    eventId: "prologue_event",
    locationId: "shelter",
    title: "임시 거처",
    paragraphs: [
      "임시 거처는 방이라기보다, 천막과 덧댄 판자를 겨우 이어 붙여 만든 숨 돌릴 틈에 가깝다. 바람은 사방에서 스며들고 틈새마다 냉기가 배어 나오지만, 사람들은 그마저도 이곳에서야 겨우 등을 기대고 숨을 고른다.",
      "젖은 천 냄새와 눅눅한 흙 냄새 사이로 낮은 기침 소리와 금세 식어 버린 냄비의 쇳소리가 얇게 깔려 있다. 이곳이 바깥보다 안전하다는 말은, 결국 여기에서만 다음 한 끼를 생각할 여유를 낼 수 있다는 뜻인지도 모른다.",
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
      "천막 아래 공기는 여전히 축축하고 차갑다. 그래도 이제는 무엇을 해야 하는지 분명하다. 편의점 잔해에서 통조림만 찾아 와도, 오늘 하루는 조금 덜 잔인해질 것이다.",
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
      "임시 거처 안은 여전히 눅눅하고 비좁지만, 바깥으로 나가기 전 마지막으로 생각을 정리하기에는 이만한 곳도 없다.",
      "아까 노파가 남긴 말이 아직 귓가에 걸려 있다. \"살 생각이 있으면 지금 움직여.\" 오늘 첫 식량이 필요하다면, 편의점 잔해부터 확인하는 편이 가장 현실적이다.",
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
