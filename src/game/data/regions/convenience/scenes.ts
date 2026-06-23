import type { SceneDefinition } from "../../../schemas";

export const convenienceSceneDefinitions: SceneDefinition[] = [
  {
    id: "convenience_shelf_three",
    locationId: "convenience",
    title: "진열대",
    paragraphs: [
      "기울어진 진열대 안쪽에 아직 멀쩡한 통조림 세 개가 나란히 놓여 있다. 바로 앞에 서 있으니, 오늘 챙길 수 있는 몫이 정확히 얼마나 되는지 한눈에 들어온다.",
      "유리 조각과 먼지가 발밑에서 서걱이지만, 지금 손만 뻗으면 저 통조림 세 개를 한 번에 전부 챙길 수 있다. 오늘 하루를 버틸 식량이 눈앞에 놓인 셈이다.",
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
      "방금 비워 낸 자리 옆으로 통조림 두 개가 더 남아 있다. 이제 눈앞에 남은 수량도 분명하다. 딱 두 개, 그게 전부다.",
      "먼지가 얇게 내려앉아 있지만 아직 다른 누군가보다 당신의 손이 먼저 닿을 거리다. 지금 고르면 이 두 개도 한 번에 전부 챙길 수 있다.",
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
      "이제 마지막 통조림 하나만 비스듬히 놓여 있다. 남은 건 정확히 하나, 더 망설일 것도 없이 보이는 수량이 전부다.",
      "손을 뻗으면 바로 닿는 거리다. 이번에 챙기면 진열대는 완전히 비게 되고, 당신은 마지막 남은 한 끼 가능성을 손에 넣는다.",
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
      "통조림이 놓여 있던 자리에는 얇은 먼지 자국과 깨진 유리만 남아 있다. 방금 전까지 눈앞에 있던 식량을 전부 챙겼다는 사실만이 선명하다.",
      "더 뒤질 것도 없이 진열대는 완전히 비었다. 여기서 오래 머무는 건 불안만 키울 뿐이다.",
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
      "깨진 플라스틱 덮개 아래 계산대 서랍이 반쯤 열린 채 걸려 있다. 안쪽에는 천 원짜리 한 장, 오백 원짜리 한 장, 그리고 동전 몇 개가 섞인 1,800원이 그대로 남아 있다.",
      "세상이 무너진 뒤의 돈이 예전만 못하더라도, 급식 한 끼나 작은 거래 하나를 바꿀 수 있는 액수다. 지금이라면 이 돈도 전부 네 몫이 된다.",
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
      "서랍 안에는 이제 구겨진 지폐 몇 장과 바닥을 구르는 동전만 듬성듬성 남아 있다. 아까보다는 초라하지만, 그냥 두고 가기엔 아직 아까운 액수다.",
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
      "계산대 서랍 안에는 먼지와 영수증 조각만 남아 있다. 챙길 수 있는 돈은 이미 전부 손에 넣었다.",
    ],
    choiceIds: ["leave_convenience_register"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_register" },
      { type: "stock_money_lt", locationId: "convenience", nodeId: "convenience_register", amount: 600 },
    ],
  },
  {
    id: "convenience_supply_pile_full",
    locationId: "convenience",
    title: "창고 자재 더미",
    paragraphs: [
      "반쯤 무너진 창고 선반 아래에는 아직 손대지 않은 자재가 뒤엉켜 있다. 버틸 만한 판자와 질긴 천 조각, 금속 부품이 한눈에 들어온다.",
    ],
    choiceIds: [
      "collect_wood_from_supply_pile",
      "collect_cloth_from_supply_pile",
      "collect_metal_from_supply_pile",
      "collect_cordage_from_supply_pile",
      "leave_convenience_supply_pile",
    ],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_supply_pile" },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "woodPlank", amount: 1 },
    ],
  },
  {
    id: "convenience_supply_pile_cloth",
    locationId: "convenience",
    title: "창고 자재 더미",
    paragraphs: [
      "굵직한 판자는 거의 다 챙겼고, 이제는 해지지 않은 천 조각과 마지막 금속 부품만 더미 한쪽에 남아 있다.",
    ],
    choiceIds: [
      "collect_cloth_from_supply_pile",
      "collect_metal_from_supply_pile",
      "collect_cordage_from_supply_pile",
      "leave_convenience_supply_pile",
    ],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_supply_pile" },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "woodPlank", amount: 1 },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "clothScrap", amount: 1 },
    ],
  },
  {
    id: "convenience_supply_pile_metal",
    locationId: "convenience",
    title: "창고 자재 더미",
    paragraphs: [
      "천 조각까지 거의 추려 내고 나니, 더미 한쪽에 마지막 금속 부품만 외롭게 걸려 있다.",
    ],
    choiceIds: ["collect_metal_from_supply_pile", "collect_cordage_from_supply_pile", "leave_convenience_supply_pile"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_supply_pile" },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "woodPlank", amount: 1 },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "clothScrap", amount: 1 },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "scrapMetal", amount: 1 },
    ],
  },
  {
    id: "convenience_supply_pile_cordage",
    locationId: "convenience",
    title: "창고 자재 더미",
    paragraphs: [
      "판자와 금속, 천 조각까지 거의 챙기고 나니 선반 밑에는 엉킨 전선 피복과 포장 끈만 남아 있다. 도구를 묶거나 설비를 고정할 때 쓸 만하다.",
    ],
    choiceIds: ["collect_cordage_from_supply_pile", "leave_convenience_supply_pile"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_supply_pile" },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "woodPlank", amount: 1 },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "clothScrap", amount: 1 },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "scrapMetal", amount: 1 },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "cordage", amount: 1 },
    ],
  },
  {
    id: "convenience_supply_pile_empty",
    locationId: "convenience",
    title: "비워진 자재 더미",
    paragraphs: [
      "창고 자재 더미에는 쓸모없는 조각과 먼지만 남아 있다. 지금 더 뒤져 봐야 건질 만한 건 없어 보인다.",
    ],
    choiceIds: ["leave_convenience_supply_pile"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_supply_pile" },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "woodPlank", amount: 1 },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "clothScrap", amount: 1 },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "scrapMetal", amount: 1 },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "cordage", amount: 1 },
    ],
  },
  {
    id: "convenience_food_crate_full",
    locationId: "convenience",
    title: "보관함",
    paragraphs: [
      "계산대 뒤쪽 아래에 밀려 있던 플라스틱 보관함은 눅눅한 먼지 냄새를 품고 열린다. 안쪽에는 습기를 먹은 빵 봉지와 물병, 작은 쌀 봉지가 아직 남아 있다.",
      "상태가 좋다고 말하긴 어렵지만, 오늘 하루를 넘기기에는 무엇이든 필요하다. 쓸 수 있는 것부터 차분히 챙기는 편이 낫다.",
    ],
    choiceIds: [
      "collect_stale_bread_from_food_crate",
      "collect_water_from_food_crate",
      "collect_rice_from_food_crate",
      "leave_convenience_food_crate",
    ],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_food_crate" },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_food_crate", itemId: "staleBread", amount: 1 },
    ],
  },
  {
    id: "convenience_food_crate_water",
    locationId: "convenience",
    title: "보관함",
    paragraphs: [
      "빵 봉지를 모두 챙기고 나니 보관함 바닥의 얼룩이 그대로 드러난다. 구석에는 아직 물병 하나와 작은 쌀 봉지가 남아 있다.",
      "먼지가 내려앉은 손잡이를 잡을 때마다 플라스틱이 낮게 삐걱거린다. 오래 머물 곳은 아니다.",
    ],
    choiceIds: ["collect_water_from_food_crate", "collect_rice_from_food_crate", "leave_convenience_food_crate"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_food_crate" },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_food_crate", itemId: "staleBread", amount: 1 },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_food_crate", itemId: "waterBottle", amount: 1 },
    ],
  },
  {
    id: "convenience_food_crate_rice",
    locationId: "convenience",
    title: "보관함",
    paragraphs: [
      "보관함 안에는 이제 작은 쌀 봉지만 남아 있다. 봉지 겉면은 먼지로 거칠지만, 안쪽까지 젖은 것 같지는 않다.",
      "쌀 한 줌도 불을 피우고 물을 맞추면 식사가 된다. 챙겨 둘 가치가 있다.",
    ],
    choiceIds: ["collect_rice_from_food_crate", "leave_convenience_food_crate"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_food_crate" },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_food_crate", itemId: "staleBread", amount: 1 },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_food_crate", itemId: "waterBottle", amount: 1 },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_food_crate", itemId: "rawRice", amount: 1 },
    ],
  },
  {
    id: "convenience_food_crate_empty",
    locationId: "convenience",
    title: "빈 보관함",
    paragraphs: [
      "보관함 안에는 눅눅한 먼지와 찢어진 포장지뿐이다. 손끝으로 바닥을 한 번 더 훑어 봐도 더 챙길 만한 것은 없다.",
    ],
    choiceIds: ["leave_convenience_food_crate"],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "active_stock_node", nodeId: "convenience_food_crate" },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_food_crate", itemId: "staleBread", amount: 1 },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_food_crate", itemId: "waterBottle", amount: 1 },
      { type: "stock_item_lt", locationId: "convenience", nodeId: "convenience_food_crate", itemId: "rawRice", amount: 1 },
    ],
  },
  {
    id: "convenience_scene_discovered",
    locationId: "convenience",
    title: "편의점 폐허",
    paragraphs: [
      "무너진 편의점 안쪽에는 아직 완전히 쓸리지 않은 자리들이 남아 있다. 진열대에는 통조림 몇 개가 그대로 놓여 있고, 입구 가까운 계산대 뒤쪽에는 보관함이, 창고 선반 아래에는 판자와 천 조각, 금속 부품, 엉킨 끈이 뒤엉킨 자재 더미가 보인다.",
      "뒤편 골목으로는 약품 냄새가 희미하게 흘러온다. 깨진 간판 너머로 작은 병원 쪽 길이 이어지는 듯하다.",
    ],
    choiceIds: [
      "go_to_convenience_shelf",
      "go_to_convenience_register",
      "go_to_convenience_food_crate",
      "go_to_convenience_supply_pile",
    ],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "flag", flag: "intro_seen_convenience" },
      { type: "active_stock_node_not", nodeId: "convenience_shelf" },
      { type: "active_stock_node_not", nodeId: "convenience_register" },
      { type: "active_stock_node_not", nodeId: "convenience_food_crate" },
      { type: "active_stock_node_not", nodeId: "convenience_supply_pile" },
    ],
  },
  {
    id: "convenience_first_intro",
    locationId: "convenience",
    title: "편의점 폐허",
    paragraphs: [
      "편의점은 반쯤 주저앉은 채 마지막 형태만 간신히 붙들고 있다. 깨진 자동문은 비스듬히 매달려 있고 바닥에는 유리 조각과 찢긴 포장지, 누군가 급히 훑고 간 흔적이 여기저기 남아 있다.",
      "진열대 대부분은 이미 비어 있지만, 계산대 뒤쪽 보관함과 창고 쪽에는 아직 손이 덜 닿은 자리도 보인다. 판자와 천, 금속 부품, 묶을 끈 같은 재료가 필요하다면 먼저 살펴볼 만하다. 뒤편 골목에서는 희미한 약품 냄새가 흘러오고, 깨진 간판 너머로 작은 병원 쪽 길이 이어지는 듯하다.",
    ],
    choiceIds: [
      "go_to_convenience_shelf",
      "go_to_convenience_register",
      "go_to_convenience_food_crate",
      "go_to_convenience_supply_pile",
    ],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "flag_not", flag: "intro_seen_convenience" },
    ],
    introFlag: "intro_seen_convenience",
  },
  {
    id: "convenience_repeat_intro",
    locationId: "convenience",
    title: "편의점 폐허",
    paragraphs: [
      "반쯤 무너진 가게 안에는 아직 먼지와 생활의 잔해가 그대로 남아 있다. 진열대, 계산대, 보관함, 창고 자재 더미 사이에서 지금 챙길 것을 골라야 한다.",
      "뒤편 골목은 작은 병원 쪽으로 이어진다. 약품이나 전원 부품이 필요해지면 그 길을 따라가 볼 수 있다.",
    ],
    choiceIds: [
      "go_to_convenience_shelf",
      "go_to_convenience_register",
      "go_to_convenience_food_crate",
      "go_to_convenience_supply_pile",
    ],
    conditions: [
      { type: "location", locationId: "convenience" },
      { type: "flag", flag: "intro_seen_convenience" },
    ],
  },
];
