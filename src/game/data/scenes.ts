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
    title: "오늘 버틸 첫 목표가 필요했다",
    paragraphs: [
      "이 거처는 안전이라기보다, 아직 무너지지 않았다는 말에 가까웠다. 그래도 바깥보다 먼저 생각할 수 있는 곳이 있다는 것만으로 숨이 조금은 길어졌다.",
      "가장 먼저 해결해야 할 것은 식량이었다. 급식소를 기다리기엔 시간이 걸리고, 오늘 저녁을 넘길 만큼 확실한 건 편의점 잔해 어딘가에 남아 있을지 모를 통조림뿐이었다.",
      "지금 필요한 건 막연한 각오가 아니라, 바로 움직일 수 있는 첫 목표였다.",
    ],
    choiceIds: ["accept_first_canned_food_quest"],
    conditions: [
      { type: "location", locationId: "shelter" },
      { type: "flag_not", flag: "first_canned_food_started" },
    ],
  },
  {
    id: "shelter_day_intro_after_quest",
    locationId: "shelter",
    title: "이제 갈 곳은 분명했다",
    paragraphs: [
      "목표를 정하고 나자, 거처 안의 소음도 조금 멀어졌다. 오늘 필요한 첫 식량은 편의점 잔해 쪽에 있을 가능성이 가장 컸다.",
      "이동 탭으로 나가 편의점 잔해를 향하면 된다. 거기서 통조림만 손에 넣어도 오늘 하루의 모양은 조금 달라질 수 있었다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "shelter" },
      { type: "flag", flag: "first_canned_food_started" },
    ],
  },
  {
    id: "convenience_shelf_three",
    locationId: "convenience",
    title: "먼지 속에서 셋이 아직 버티고 있다",
    paragraphs: [
      "진열대 앞까지 다가서자 찌그러진 철제 칸 안에 통조림 셋이 아직 가지런히 남아 있는 것이 보였다. 누군가 급히 훑고 지나간 자리 같았지만, 마지막까지 손이 닿지 않은 모양이었다.",
      "유리 조각 위에서 발을 잘못 디디면 소리가 날 수 있었다. 그래도 지금 이 셋은, 오늘을 버틸 수 있다는 드문 증거처럼 보였다.",
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
    title: "먼지 사이로 두 개가 남아 있다",
    paragraphs: [
      "한 칸이 비어 있었다. 방금 집어 넣은 통조림의 묵직함이 주머니에 닿는 사이, 진열대에는 두 개가 먼지 사이에 남아 희미한 빛을 받고 있었다.",
      "욕심을 내기에는 조용해야 했고, 망설이기에는 이 두 개가 너무 선명했다.",
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
    title: "마지막 하나가 비스듬히 기대 있다",
    paragraphs: [
      "이제 진열대에는 마지막 하나만 비스듬히 기대어 있었다. 손을 뻗으면 금방 챙길 수 있었지만, 이상하게도 그 하나가 가장 크게 눈에 들어왔다.",
      "이곳에 더 남겨 둘 이유는 없었다. 남은 건 집어 가거나, 발소리를 남기지 않고 돌아서는 일뿐이었다.",
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
    title: "이제 진열대에는 빈 자국만 남았다",
    paragraphs: [
      "통조림이 놓여 있던 자리에는 먼지가 비켜난 자국만 남아 있었다. 금속 바닥에 눌린 원형 흔적이, 방금 전까지 이곳에 식량이 있었다는 사실을 대신 말해 주고 있었다.",
      "더 뒤질 만한 것은 없어 보였다. 이쯤이면 만족하고 돌아서는 편이 나았다.",
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
    title: "안쪽 진열대에 아직 손대지 않은 무언가가 보인다",
    paragraphs: [
      "가게 안쪽을 훑던 눈이 무너진 선반 하나에 붙잡혔다. 다 뜯겨 나간 자판 사이에서, 아직 완전히 비워지지 않은 진열대가 어둠 속에 남아 있었다.",
      "가까이 가서 확인하면 오늘을 버틸 만한 식량이 나올지도 몰랐다. 다만 그만큼 더 안으로 들어가야 했다.",
    ],
    choiceIds: ["go_to_convenience_shelf"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "flag", flag: "convenience_shelf_found" },
      { type: "active_stock_node_not", nodeId: "convenience_shelf" },
    ],
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
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "flag_not", flag: "convenience_shelf_found" },
    ],
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
