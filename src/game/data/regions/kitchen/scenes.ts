import type { SceneDefinition } from "../../../schemas";

export const kitchenSceneDefinitions: SceneDefinition[] = [
  {
    id: "kitchen_scrap_heap_full",
    locationId: "kitchen",
    title: "폐자재 더미",
    paragraphs: [
      "배식줄 옆 구석에는 찢긴 앞치마와 굽은 금속 부품, 깨진 조리 도구가 한데 엉켜 있다. 조금만 추려도 거처를 손보는 데 쓸 만한 재료가 제법 나올 듯하다.",
    ],
    choiceIds: ["collect_scrap_from_kitchen_heap", "collect_cloth_from_kitchen_heap", "leave_kitchen_scrap_heap"],
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
    choiceIds: ["collect_cloth_from_kitchen_heap", "leave_kitchen_scrap_heap"],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "active_stock_node", nodeId: "kitchen_scrap_heap" },
      { type: "stock_item_lt", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "scrapMetal", amount: 1 },
      { type: "stock_item_gte", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "clothScrap", amount: 1 },
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
    ],
  },
  {
    id: "kitchen_first_intro",
    locationId: "kitchen",
    title: "급식소",
    paragraphs: [
      "급식소 앞에는 이미 사람들이 모여 있다. 빈 그릇을 든 채 줄을 선 사람들 사이로 묵은 국 냄새와 금세 식어 버린 김이 번져 나오고, 누구도 크게 말하지 않지만 모두가 오늘 한 끼를 버텨 낼 생각뿐인 얼굴이다.",
      "\"다음 사람, 빨리.\"",
      "지치고 메마른 목소리가 줄 사이를 훑고 지나간다. 배식줄 옆 구석에는 버려진 조리 도구와 천 조각이 쌓인 폐자재 더미도 눈에 들어온다.",
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
      "사람들은 줄을 이룬 채 묵묵히 자기 차례를 기다리고 있다. 배식줄 끝과 구석의 폐자재 더미 사이로, 천천히 움직일 틈은 아직 남아 있다.",
      "급식소 뒤편 계단은 지하철역 쪽 어둠으로 이어진다. 신호 장비 이야기가 사실이라면, 언젠가는 저 아래로 내려가야 한다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "flag", flag: "intro_seen_kitchen" },
    ],
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
