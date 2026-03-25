import type { SceneDefinition } from "../../../schemas";

export const kitchenSceneDefinitions: SceneDefinition[] = [
  {
    id: "kitchen_scrap_heap_full",
    locationId: "kitchen",
    title: "폐자재 더미",
    paragraphs: [
      "배식대 뒤편 구석에는 찢긴 앞치마와 휘어진 국자 손잡이, 눌어붙은 철판 조각이 어지럽게 쌓여 있다. 제대로 고르면 거처를 손볼 자재로 쓸 만한 것들이 아직 남아 있다.",
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
      "금속 부품은 거의 추려 냈고, 이제는 젖지 않은 천 조각만 더미 안쪽에 조금 남아 있다.",
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
      "남은 것은 눅눅한 부스러기뿐이다. 지금 더 뒤져 봐야 손에 잡힐 만한 자재는 없을 것 같다.",
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
    id: "kitchen_salvage_discovered",
    locationId: "kitchen",
    title: "급식소",
    paragraphs: [
      "배식대 뒤편 구석에 쓸 만한 폐자재 더미가 눈에 들어온다. 줄 선 사람들 틈만 잘 피하면, 거처를 손볼 만한 자재를 몇 개쯤 챙길 수 있을 것 같다.",
    ],
    choiceIds: ["go_to_kitchen_scrap_heap"],
    conditions: [
      { type: "location", locationId: "kitchen" },
      { type: "flag", flag: "kitchen_salvage_found" },
      { type: "active_stock_node_not", nodeId: "kitchen_scrap_heap" },
    ],
  },
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
