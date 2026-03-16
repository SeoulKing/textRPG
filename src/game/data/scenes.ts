import type { SceneDefinition } from "../schemas";

export const sceneDefinitions: SceneDefinition[] = [
  {
    id: "prologue_opening",
    eventId: "prologue_event",
    locationId: "shelter",
    title: "프롤로그",
    paragraphs: [
      "지붕인지 천막인지 모를 것을 겨우 이어 붙인 아래로 스민 공기가 새벽보다 먼저 폐 안으로 파고든다. 눈을 뜨자마자 떠오르는 건 어젯밤이 아니라, 오늘을 버티지 못하면 여기서 끝난다는 감각이다.",
      "사람들은 제 각기 숨을 죽인 채 누워 있지만 잠든 얼굴은 거의 없다. 몸을 일으키기 전부터, 오늘 하루를 어떻게든 살아남아야 한다는 말이 속에서 먼저 문장을 갖춘다.",
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
      "오늘은 그냥 견디는 날이 아니다. 어떻게든 살아남겠다고 입 밖에 꺼내야만 움직일 수 있을 것 같은 순간이 아직 가슴에 붙어 있다.",
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
      "살아남겠다고 겨우 마음을 다잡은 순간, 천막 틈이 들리며 급식소 배식을 맡는 노파가 얼굴을 내민다. 노파는 오늘 급식이 오래 버티지 못할 거라고, 편의점 잔해 안쪽 진열대에 아직 통조림이 남아 있을 수 있다고 낮게 말한다.",
      "말을 마친 노파는 더 설명하지 않는다. 대신 지금 이 거처의 공기와 사람들을 직접 보라는 듯, 천막 안쪽을 한 번 훑어보고는 조용히 자리를 비켜 준다.",
    ],
    choiceIds: ["enter_shelter_after_old_woman"],
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
      "임시 거처는 방이라고 부르기에도 민망한 천막과 덧댄 판자들로 이어져 있다. 바람이 스며드는 자리는 많지만, 그럼에도 사람들은 이곳에서만 겨우 등을 벽에 붙이고 숨을 고른다.",
      "젖은 천 냄새와 눅눅한 흙 냄새 사이로 낮게 기침하는 소리, 끓는 물이 모자라 금세 식어 버린 냄비 소리가 얇게 깔려 있다. 밖보다 안전하다는 말은 결국 여기에서만 다음 한 끼를 생각할 수 있다는 뜻이다.",
    ],
    choiceIds: ["accept_first_canned_food_quest"],
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
      "천막 아래 공기는 여전히 축축하고 차갑지만, 이제 무엇을 해야 하는지는 분명하다. 편의점 잔해에서 통조림을 찾으면 오늘 하루는 조금 덜 잔인해진다.",
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
      "임시 거처 안은 여전히 눅눅하고 비좁지만, 바깥으로 나가기 전 마지막으로 생각을 정리하기에는 이곳만 한 데가 없다.",
      "노파가 남긴 말이 아직 귓가에 남아 있다. 오늘 첫 식량이 필요하다면 편의점 잔해부터 확인하는 편이 가장 현실적이다.",
    ],
    choiceIds: ["accept_first_canned_food_quest"],
    conditions: [
      { type: "location", locationId: "shelter" },
      { type: "flag", flag: "opening_seen" },
      { type: "flag", flag: "intro_seen_shelter" },
      { type: "flag_not", flag: "first_canned_food_started" },
    ],
  },
  {
    id: "convenience_shelf_three",
    locationId: "convenience",
    title: "진열대",
    paragraphs: [
      "기울어진 진열대 안쪽에 아직 손이 닿지 않은 통조림 세 개가 가지런히 남아 있다. 누군가 급하게 뒤지다 말고 마지막까지 챙기지 못한 흔적처럼 보인다.",
      "유리 조각과 먼지가 발밑에서 서걱이지만, 지금 손을 뻗으면 오늘 하루를 버틸 식량이 분명히 손안에 들어온다.",
    ],
    choiceIds: ["collect_canned_food_from_shelf", "leave_stock_node"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_shelf" },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_shelf", itemId: "cannedFood", amount: 3 },
    ],
  },
  {
    id: "convenience_shelf_two",
    locationId: "convenience",
    title: "진열대",
    paragraphs: [
      "방금 비워 낸 자리 옆으로 통조림 두 개가 더 남아 있다. 먼지가 잔뜩 쌓여 있지만 아직은 누군가의 손보다 당신의 손이 먼저 닿을 만큼 가까운 거리다.",
    ],
    choiceIds: ["collect_canned_food_from_shelf", "leave_stock_node"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_shelf" },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_shelf", itemId: "cannedFood", amount: 2 },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_shelf", itemId: "cannedFood", amount: 3 },
    ],
  },
  {
    id: "convenience_shelf_one",
    locationId: "convenience",
    title: "진열대",
    paragraphs: [
      "이제 마지막 통조림 하나만 비스듬히 남아 있다. 손을 뻗으면 닿겠지만, 그 한 개가 오늘 당신의 숨을 얼마나 바꿔 놓을지 알아서 더 조심스럽다.",
    ],
    choiceIds: ["collect_canned_food_from_shelf", "leave_stock_node"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_shelf" },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_shelf", itemId: "cannedFood", amount: 1 },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_shelf", itemId: "cannedFood", amount: 2 },
    ],
  },
  {
    id: "convenience_shelf_empty",
    locationId: "convenience",
    title: "빈 진열대",
    paragraphs: [
      "통조림이 놓여 있던 자리에는 사각 자국과 먼지만 남아 있다. 더 챙길 것은 없고, 여기에서 오래 머무는 건 불안만 키울 뿐이다.",
    ],
    choiceIds: ["leave_stock_node"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_shelf" },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_shelf", itemId: "cannedFood", amount: 1 },
    ],
  },
  {
    id: "convenience_scene_discovered",
    locationId: "convenience",
    title: "편의점 잔해",
    paragraphs: [
      "안쪽 벽이 무너진 틈 사이로 아직 완전히 뒤집히지 않은 진열대 하나가 보인다. 먼지가 두껍게 내려앉았지만, 그만큼 아직 남은 것이 있을지도 모른다.",
    ],
    choiceIds: ["go_to_convenience_shelf"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "flag", flag: "convenience_shelf_found" },
      { type: "active_stock_node_not", nodeId: "convenience_shelf" },
    ],
  },
  {
    id: "convenience_first_intro",
    locationId: "convenience",
    title: "편의점 잔해",
    paragraphs: [
      "편의점은 반쯤 주저앉은 채 마지막 모양만 간신히 붙들고 있다. 깨진 자동문은 비스듬히 매달려 있고, 바닥에는 유리 조각과 찢긴 포장지, 누군가 급히 쓸고 간 자국이 먼지 위에 남아 있다.",
      "진열대 대부분은 이미 비어 있지만, 그 비어 있음조차 아직 생활의 자취를 품고 있다. 누군가가 허겁지겁 챙겨 간 뒤에도, 이곳 어딘가에는 아직 손대지 못한 식량이 숨어 있을 것만 같다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "flag_not", flag: "convenience_shelf_found" },
      { type: "flag_not", flag: "intro_seen_convenience" },
    ],
    introFlag: "intro_seen_convenience",
  },
  {
    id: "convenience_repeat_intro",
    locationId: "convenience",
    title: "편의점 잔해",
    paragraphs: [
      "반쯤 무너진 가게 안에는 아직 먼지와 생활의 흔적이 함께 남아 있다. 이 안을 더 뒤지면 오늘을 버틸 식량이 숨어 있을지도 모른다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "flag_not", flag: "convenience_shelf_found" },
      { type: "flag", flag: "intro_seen_convenience" },
    ],
  },
  {
    id: "kitchen_first_intro",
    locationId: "kitchen",
    title: "급식소",
    paragraphs: [
      "급식소 앞에는 이미 사람들이 모여 있다. 빈 그릇을 들고 줄을 선 이들 사이로 묽은 국 냄새와 금세 식어 버릴 김이 번지고, 누구도 크게 말하지 않지만 모두가 자기 차례를 놓치지 않으려 몸을 세우고 있다.",
      "배식대 쪽에서는 노파가 접시를 밀어 넣는 손놀림으로 급한 사람들을 재촉하지만, 그 와중에도 아직 하루를 더 버텨 보려는 사람들의 눈빛이 줄 끝에 남아 있다.",
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
      "사람들이 줄을 이룬 채 자기 순서를 기다리고 있다. 배식대 앞 공기에는 허기와 소문이 함께 떠돈다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "flag", flag: "intro_seen_kitchen" },
    ],
  },
];
