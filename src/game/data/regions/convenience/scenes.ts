import type { SceneDefinition } from "../../../schemas";

export const convenienceSceneDefinitions: SceneDefinition[] = [
  {
    id: "convenience_shelf_three",
    locationId: "convenience",
    title: "진열대",
    paragraphs: [
      "기울어진 진열대 안쪽에는 아직 손이 닿지 않은 통조림 세 개가 가지런히 남아 있다. 누군가 급히 뒤지다가 끝내 챙기지 못한 마지막 몫처럼 보인다.",
      "유리 조각과 먼지가 발밑에서 서걱이지만, 지금 손만 뻗으면 오늘 하루를 버틸 식량이 분명히 손안에 들어온다.",
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
      "방금 비워 낸 자리 옆으로 통조림 두 개가 더 남아 있다. 먼지가 두껍게 내려앉아 있지만, 아직은 다른 누구보다 당신의 손이 먼저 닿을 만큼 가까운 거리다.",
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
      "이제 마지막 통조림 하나만 비스듬히 남아 있다. 손을 뻗으면 닿는 거리인데도, 그 한 개가 오늘 당신의 숨을 얼마나 바꿔 놓을지 알기에 오히려 더 조심스러워진다.",
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
      "통조림이 놓여 있던 자리에는 희미한 사각 자국과 먼지만 남아 있다. 더 챙길 것은 없고, 여기에서 오래 머무는 일은 불안만 키울 뿐이다.",
    ],
    choiceIds: ["leave_stock_node"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_shelf" },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_shelf", itemId: "cannedFood", amount: 1 },
    ],
  },
  {
    id: "convenience_register_full",
    locationId: "convenience",
    title: "계산대",
    paragraphs: [
      "깨진 플라스틱 덮개 아래 계산대 서랍이 반쯤 열린 채 걸려 있다. 안쪽 구석에는 아직 누군가 미처 챙기지 못한 지폐와 동전이 흩어져 있다.",
      "큰돈은 아니어도, 이런 때엔 손바닥만 한 잔돈 몇 장이 오늘 저녁을 바꿔 놓는다. 급식 한 끼를 사거나 물건 하나를 더 마련할 수 있을 만큼은 되어 보인다.",
    ],
    choiceIds: ["collect_cash_from_register", "leave_convenience_register"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_register" },
      { type: "stock_money_gte", locationId: "convenience", nodeId: "convenience_register", amount: 1200 },
    ],
  },
  {
    id: "convenience_register_low",
    locationId: "convenience",
    title: "계산대",
    paragraphs: [
      "서랍 안에는 이제 접힌 천 원짜리 몇 장과 바닥에 들러붙은 동전들만 남아 있다. 아까보다 초라해졌지만, 그래도 그냥 두고 가기에는 아까운 돈이다.",
    ],
    choiceIds: ["collect_cash_from_register", "leave_convenience_register"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_register" },
      { type: "stock_money_gte", locationId: "convenience", nodeId: "convenience_register", amount: 600 },
      { type: "stock_money_lt", locationId: "convenience", nodeId: "convenience_register", amount: 1200 },
    ],
  },
  {
    id: "convenience_register_empty",
    locationId: "convenience",
    title: "빈 계산대",
    paragraphs: [
      "계산대 서랍 안에는 먼지와 영수증 조각만 남아 있다. 더 챙길 돈은 없고, 이 앞에서 시간을 끄는 일은 불안만 키울 뿐이다.",
    ],
    choiceIds: ["leave_convenience_register"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_register" },
      { type: "stock_money_lt", locationId: "convenience", nodeId: "convenience_register", amount: 600 },
    ],
  },
  {
    id: "convenience_scene_discovered",
    locationId: "convenience",
    title: "편의점 잔해",
    paragraphs: [
      "무너진 안쪽 벽 틈 사이로 아직 완전히 쓰러지지 않은 진열대가 보이고, 입구 가까운 계산대 서랍도 반쯤 열린 채 걸려 있다. 식량이든 돈이든, 이 가게는 아직 마지막 몫을 조금쯤 숨겨 두고 있는 듯하다.",
    ],
    choiceIds: ["go_to_convenience_shelf", "go_to_convenience_register"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "flag", flag: "convenience_shelf_found" },
      { type: "active_stock_node_not", nodeId: "convenience_shelf" },
      { type: "active_stock_node_not", nodeId: "convenience_register" },
    ],
  },
  {
    id: "convenience_first_intro",
    locationId: "convenience",
    title: "편의점 잔해",
    paragraphs: [
      "편의점은 반쯤 주저앉은 채, 마지막 형태만 간신히 붙들고 있다. 깨진 자동문은 비스듬히 매달려 있고 바닥에는 유리 조각과 찢긴 포장지, 누군가 급히 쓸고 간 흔적이 먼지 위에 어지럽게 남아 있다.",
      "진열대 대부분은 이미 비어 있고 계산대는 비스듬히 기울어 있지만, 그 공백조차 아직 생활의 자취를 품고 있다. 누군가가 허겁지겁 챙겨 간 뒤에도, 이곳 어딘가에는 아직 손대지 못한 식량이나 돈이 숨어 있을 것만 같다.",
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
      "반쯤 무너진 가게 안에는 아직 먼지와 생활의 흔적이 함께 남아 있다. 조금만 더 뒤지면, 오늘을 버틸 식량이나 잔돈이 어딘가에서 모습을 드러낼지도 모른다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "flag_not", flag: "convenience_shelf_found" },
      { type: "flag", flag: "intro_seen_convenience" },
    ],
  },
];
