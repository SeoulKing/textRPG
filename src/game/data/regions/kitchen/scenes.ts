import type { SceneDefinition } from "../../../schemas";

export const kitchenSceneDefinitions: SceneDefinition[] = [
  {
    id: "kitchen_ingredient_crate_full",
    locationId: "kitchen",
    title: "식재료 상자",
    paragraphs: [
      "배식대 뒤쪽 낡은 상자 안에는 쌀 봉지와 시든 채소, 뜯지 않은 물병이 조금 남아 있다. 배식용으로 쓰기엔 모자라도, 거처에서 끓여 먹기엔 충분하다.",
    ],
    choiceIds: [
      "collect_rice_from_kitchen_crate",
      "collect_vegetables_from_kitchen_crate",
      "collect_water_from_kitchen_crate",
      "leave_kitchen_ingredient_crate",
    ],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "active_stock_node", nodeId: "kitchen_ingredient_crate" },
      { type: "stock_item_gte", locationId: "kitchen", nodeId: "kitchen_ingredient_crate", itemId: "rawRice", amount: 1 },
    ],
  },
  {
    id: "kitchen_ingredient_crate_vegetables",
    locationId: "kitchen",
    title: "식재료 상자",
    paragraphs: [
      "쌀 봉지는 모두 챙겼고, 상자 안에는 시든 채소와 물병만 남아 있다. 잎 끝은 조금 마랐지만 끓이면 아직 먹을 수 있을 것이다.",
    ],
    choiceIds: ["collect_vegetables_from_kitchen_crate", "collect_water_from_kitchen_crate", "leave_kitchen_ingredient_crate"],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "active_stock_node", nodeId: "kitchen_ingredient_crate" },
      { type: "stock_item_lt", locationId: "kitchen", nodeId: "kitchen_ingredient_crate", itemId: "rawRice", amount: 1 },
      { type: "stock_item_gte", locationId: "kitchen", nodeId: "kitchen_ingredient_crate", itemId: "vegetables", amount: 1 },
    ],
  },
  {
    id: "kitchen_ingredient_crate_water",
    locationId: "kitchen",
    title: "식재료 상자",
    paragraphs: [
      "상자 바닥에는 이제 물병만 남아 있다. 요리를 하든 그냥 마시든, 물은 항상 쓸 곳이 있다.",
    ],
    choiceIds: ["collect_water_from_kitchen_crate", "leave_kitchen_ingredient_crate"],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "active_stock_node", nodeId: "kitchen_ingredient_crate" },
      { type: "stock_item_lt", locationId: "kitchen", nodeId: "kitchen_ingredient_crate", itemId: "rawRice", amount: 1 },
      { type: "stock_item_lt", locationId: "kitchen", nodeId: "kitchen_ingredient_crate", itemId: "vegetables", amount: 1 },
      { type: "stock_item_gte", locationId: "kitchen", nodeId: "kitchen_ingredient_crate", itemId: "waterBottle", amount: 1 },
    ],
  },
  {
    id: "kitchen_ingredient_crate_empty",
    locationId: "kitchen",
    title: "빈 식재료 상자",
    paragraphs: [
      "식재료 상자 안에는 구겨진 종이와 흙먼지만 남아 있다. 더 뒤져도 끓일 만한 것은 나오지 않는다.",
    ],
    choiceIds: ["leave_kitchen_ingredient_crate"],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "active_stock_node", nodeId: "kitchen_ingredient_crate" },
      { type: "stock_item_lt", locationId: "kitchen", nodeId: "kitchen_ingredient_crate", itemId: "rawRice", amount: 1 },
      { type: "stock_item_lt", locationId: "kitchen", nodeId: "kitchen_ingredient_crate", itemId: "vegetables", amount: 1 },
      { type: "stock_item_lt", locationId: "kitchen", nodeId: "kitchen_ingredient_crate", itemId: "waterBottle", amount: 1 },
    ],
  },
  {
    id: "kitchen_scrap_heap_full",
    locationId: "kitchen",
    title: "폐자재 더미",
    paragraphs: [
      "배식줄 옆 구석에는 찢긴 앞치마와 포대끈, 굽은 금속 부품, 깨진 조리 도구가 한데 엉켜 있다. 조금만 추려도 거처를 손보는 데 쓸 만한 재료가 제법 나올 듯하다.",
    ],
    choiceIds: [
      "collect_scrap_from_kitchen_heap",
      "collect_cloth_from_kitchen_heap",
      "collect_cordage_from_kitchen_heap",
      "leave_kitchen_scrap_heap",
    ],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "active_stock_node", nodeId: "kitchen_scrap_heap" },
      { type: "stock_item_gte", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "scrapMetal", amount: 1 },
    ],
  },
  {
    id: "kitchen_scrap_heap_cloth",
    locationId: "kitchen",
    title: "폐자재 더미",
    paragraphs: [
      "금속 부품은 거의 추려 냈고, 이제는 아직 질긴 천 조각만 더미 한쪽에 남아 있다.",
    ],
    choiceIds: ["collect_cloth_from_kitchen_heap", "collect_cordage_from_kitchen_heap", "leave_kitchen_scrap_heap"],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "active_stock_node", nodeId: "kitchen_scrap_heap" },
      { type: "stock_item_lt", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "scrapMetal", amount: 1 },
      { type: "stock_item_gte", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "clothScrap", amount: 1 },
    ],
  },
  {
    id: "kitchen_scrap_heap_cordage",
    locationId: "kitchen",
    title: "폐자재 더미",
    paragraphs: [
      "고철과 천 조각은 거의 추려 냈고, 더미 밑에는 포대끈과 앞치마 끈이 엉켜 남아 있다. 묶고 고정하는 데는 이런 끈이 생각보다 자주 필요하다.",
    ],
    choiceIds: ["collect_cordage_from_kitchen_heap", "leave_kitchen_scrap_heap"],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "active_stock_node", nodeId: "kitchen_scrap_heap" },
      { type: "stock_item_lt", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "scrapMetal", amount: 1 },
      { type: "stock_item_lt", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "clothScrap", amount: 1 },
      { type: "stock_item_gte", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "cordage", amount: 1 },
    ],
  },
  {
    id: "kitchen_scrap_heap_empty",
    locationId: "kitchen",
    title: "비워진 폐자재 더미",
    paragraphs: [
      "손에 잡힐 만한 건 이미 다 추려 냈다. 지금 더 뒤져 봐야 먼지와 부스러기밖에 남지 않았다.",
      "이제 이 앞에 더 머물 이유는 없다. 몸을 빼면 곧바로 급식소 메인 공간으로 돌아갈 수 있다.",
    ],
    choiceIds: ["leave_kitchen_scrap_heap"],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "active_stock_node", nodeId: "kitchen_scrap_heap" },
      { type: "stock_item_lt", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "scrapMetal", amount: 1 },
      { type: "stock_item_lt", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "clothScrap", amount: 1 },
      { type: "stock_item_lt", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "cordage", amount: 1 },
    ],
  },
  {
    id: "kitchen_first_intro",
    locationId: "kitchen",
    title: "급식소",
    paragraphs: [
      "급식소 앞에는 이미 사람들이 모여 있다. 빈 그릇을 든 채 줄을 선 사람들 사이로 묵은 국 냄새와 금세 식어 버린 김이 번져 나오고, 누구도 크게 말하지 않지만 모두가 오늘 한 끼를 버텨 낼 생각뿐인 얼굴이다.",
      "\"다음 사람, 빨리.\"",
      "지치고 메마른 목소리가 줄 사이를 훑고 지나간다. 배식대 뒤쪽에는 식재료 상자가, 배식줄 옆 구석에는 버려진 조리 도구와 천 조각, 포대끈이 쌓인 폐자재 더미가 눈에 들어온다.",
      "뒤편 천막 사이로는 아래로 꺾이는 계단이 보인다. 오래전에 닫힌 지하철역으로 내려가는 통로라고, 줄 선 사람들이 낮은 목소리로 말한다.",
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
      "사람들은 줄을 이룬 채 묵묵히 자기 차례를 기다리고 있다. 배식대 뒤쪽 식재료 상자와 구석의 폐자재 더미 사이로, 천천히 움직일 틈은 아직 남아 있다.",
      "급식소 뒤편 계단은 지하철역 쪽 어둠으로 이어진다. 신호 장비 이야기가 사실이라면, 언젠가는 저 아래로 내려가야 한다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "flag", flag: "intro_seen_kitchen" },
    ],
  },
  {
    id: "kitchen_ration_ticket_exchange",
    locationId: "kitchen",
    title: "배식권",
    paragraphs: [
      "당신이 구겨진 배식권을 내밀자 배식대 뒤의 손길이 잠시 멈춘다. 종이 끝은 젖어 있었지만, 검문소 도장이 아직 희미하게 남아 있다.",
      "\"아직 받는 곳이 있을 줄은 몰랐네.\"",
      "국자는 말없이 한 번 더 그릇을 훑고 지나간다. 돈 대신 종이 한 장을 내고 받은 따뜻한 식사는, 오늘 하루를 버틸 여지를 조금 넓혀 준다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "flag", flag: "ration_ticket_exchanged" },
    ],
  },
  {
    id: "kitchen_rumor_hospital",
    locationId: "kitchen",
    title: "작은 병원 소문",
    paragraphs: [
      "당신이 병원 이야기를 꺼내자 줄 뒤쪽의 남자가 고개를 들어 편의점 폐허 너머를 가리킨다.",
      "\"깨진 간판 지나서 왼쪽 골목. 거기 아직 작은 병원이 남아 있어.\"",
      "그는 빈 그릇을 손가락으로 두드리며 말을 낮춘다. 약품이 얼마나 남았는지는 모르지만, 적어도 사람들이 다친 몸을 끌고 그쪽으로 향한다는 것만은 분명해 보인다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "kitchen" }],
  },
  {
    id: "kitchen_rumor_prices",
    locationId: "kitchen",
    title: "배식줄 소문",
    paragraphs: [
      "줄은 느리게 줄어들고, 사람들은 기다리는 동안 같은 말을 조금씩 다른 목소리로 반복한다. 오늘 들어온 쌀 자루가 어제보다 적었다는 말, 배식값이 더 오를지도 모른다는 말.",
      "누구도 정확한 숫자를 알지는 못한다. 하지만 모두가 같은 방향으로 불안해하고 있다는 사실만으로도, 내일의 가격은 이미 조금 올라간 것처럼 느껴진다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "kitchen" }],
  },
  {
    id: "kitchen_rumor_subway",
    locationId: "kitchen",
    title: "배식줄 소문",
    paragraphs: [
      "급식소 뒤편 계단을 흘끗 보던 청년이 지하철역 이야기를 꺼낸다. 어제 밤, 아래쪽에서 금속을 긁는 소리가 한참 들렸다는 것이다.",
      "\"사람 발소리는 아니었어. 그렇다고 아무것도 아닌 소리도 아니었고.\"",
      "그 말이 줄 사이로 잠깐 내려앉는다. 신호 장비를 찾으러 내려가야 한다면, 어둠보다 먼저 저 소리의 정체를 견뎌야 할 것 같다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "kitchen" }],
  },
  {
    id: "kitchen_rumor_checkpoint",
    locationId: "kitchen",
    title: "배식줄 소문",
    paragraphs: [
      "줄 끝에서 시작된 말은 앞쪽까지 오는 동안 몇 번이나 모양이 바뀐다. 검문소 쪽에서 무전 잡음이 들렸다, 차단봉 옆 차량에서 불빛이 번쩍였다, 누군가 구조대 주파수를 적은 종이를 봤다.",
      "확실한 것은 없다. 그래도 사람들이 같은 방향을 가리킬 때마다, 검문소가 단순한 폐허가 아니라 아직 확인해야 할 장소처럼 선명해진다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "kitchen" }],
  },
  {
    id: "kitchen_rumor_weather",
    locationId: "kitchen",
    title: "배식줄 소문",
    paragraphs: [
      "노파는 솥 가장자리의 김이 흩어지는 방향을 보고 낮게 혀를 찬다.",
      "\"밤바람이 바뀌었어. 천막 끈 느슨하면 새벽에 고생한다.\"",
      "그녀의 말투에는 과장이 없다. 이곳에서 오래 버틴 사람들은 하늘보다 먼저 천막 천의 떨림을 믿는다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "kitchen" }],
  },
  {
    id: "kitchen_work_wage",
    locationId: "kitchen",
    title: "배식소 일손",
    paragraphs: [
      "당신은 빈 그릇을 거두고, 줄 끝에서 밀려드는 사람들을 천천히 갈라 세운다. 별일 아닌 움직임처럼 보여도, 굶주린 사람들 사이에서는 작은 순서 하나가 금방 다툼이 된다.",
      "한 시간이 지나 일이 끝나자 배식대 뒤의 사람이 품삯 5,000원을 밀어 준다. 다음 끼니를 계산할 때 손에 잡히는 무게가 된다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "kitchen" }],
  },
  {
    id: "kitchen_work_ticket",
    locationId: "kitchen",
    title: "배식소 일손",
    paragraphs: [
      "젖은 천막 끈을 다시 묶고, 엎어진 의자를 바로 세우는 동안 손끝이 서서히 무뎌진다. 그래도 줄은 조금 짧아지고, 사람들의 숨소리도 아주 잠깐 낮아진다.",
      "\"돈은 지금 바로 못 줘.\"",
      "노파는 대신 낡은 배식권 한 장을 건넨다. 종이는 얇지만, 배가 고파질 때 이보다 확실한 약속도 드물다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "kitchen" }],
  },
  {
    id: "kitchen_work_meal",
    locationId: "kitchen",
    title: "배식소 일손",
    paragraphs: [
      "당신은 솥 옆에서 눌어붙은 국자를 닦고, 빈 그릇을 물에 담근다. 따뜻한 김은 금세 사라지지만, 손등에 남는 온기만큼은 쉽게 놓치고 싶지 않다.",
      "마지막 그릇을 치우고 나자 남은 식사가 하나 당신 앞으로 밀려온다. 오늘은 운이 좋았다. 일한 값이 곧장 저녁이 되었다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "kitchen" }],
  },
  {
    id: "kitchen_work_water",
    locationId: "kitchen",
    title: "배식소 일손",
    paragraphs: [
      "물통을 나르는 일은 생각보다 오래 걸린다. 미끄러운 바닥을 피해 몇 번이나 같은 길을 오가고 나면, 어깨가 먼저 하루가 길었다는 사실을 알아차린다.",
      "일을 마친 뒤 아직 봉인이 뜯기지 않은 물병 하나가 손에 들어온다. 음식은 아니지만, 물은 언제나 다음 행동을 가능하게 만든다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "kitchen" }],
  },
  {
    id: "kitchen_old_cook_canned_food_reward",
    locationId: "kitchen",
    title: "노파의 보답",
    paragraphs: [
      "노파는 당신이 내민 통조림 세 개를 한동안 말없이 바라본다. 찌그러진 캔 표면을 엄지로 한 번 훑더니, 그중 두 개를 자기 앞의 낡은 상자 안으로 밀어 넣는다.",
      "\"이 둘은 오늘 줄 끝에 선 사람들한테 갈 거야.\"",
      "그녀는 남은 하나를 다시 당신 손에 쥐여 준다. 차가운 캔의 무게가 손바닥에 또렷하게 남는다.",
      "\"그리고 이건 네 몫이다. 부탁을 들어 줬으니, 그냥 빈손으로 보낼 순 없지.\"",
      "노파는 앞치마 안쪽에서 접어 둔 지폐를 꺼내 함께 건넨다. 오래 버틸 만큼은 아니어도, 다음 선택을 조금은 넓혀 줄 돈이다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "flag", flag: "first_canned_food_delivered" },
    ],
  },
];
