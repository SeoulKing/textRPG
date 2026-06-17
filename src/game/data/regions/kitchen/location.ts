import type { ActionDefinition, LocationDefinition } from "../../../schemas";
import { interactionFor } from "../../location-interaction-helpers";

export const kitchenChoices: ActionDefinition[] = [
  interactionFor("kitchen", {
    id: "buy_meal_at_kitchen",
    label: "돈을 내고 따뜻한 식사를 산다",
    type: "use",
    outcomeHint: "4,500원을 내고 따뜻한 식사 1개를 얻는다.",
    showOutcomeHint: true,
    conditions: [
      { type: "day_lt", value: 2 },
      { type: "money_gte", amount: 4500 },
    ],
    effects: [
      { type: "change_money", amount: -4500 },
      { type: "add_item", itemId: "hotMeal", amount: 1 },
      { type: "set_flag", flag: "mealSecured" },
      { type: "log", message: "당신은 아껴 둔 돈을 꺼내 오늘 몫의 따뜻한 식사를 산다." },
      { type: "advance_time", phases: 1 },
    ],
    tags: ["food", "trade"],
    riskHint: "low",
  }),
  interactionFor("kitchen", {
    id: "buy_crowded_meal_at_kitchen",
    label: "붐비는 배식줄에서 식사를 산다",
    type: "use",
    outcomeHint: "피난민이 늘어 오른 가격이다. 5,200원을 내고 따뜻한 식사 1개를 얻는다.",
    showOutcomeHint: true,
    conditions: [
      { type: "day_gte", value: 2 },
      { type: "money_gte", amount: 5200 },
    ],
    effects: [
      { type: "change_money", amount: -5200 },
      { type: "add_item", itemId: "hotMeal", amount: 1 },
      { type: "set_flag", flag: "mealSecured" },
      { type: "log", message: "배식줄은 더 길어졌고 값도 올랐다. 당신은 돈을 치르고 따뜻한 식사 하나를 받아 든다." },
      { type: "advance_time", phases: 1 },
    ],
    tags: ["food", "trade"],
    riskHint: "low",
  }),
  interactionFor("kitchen", {
    id: "go_to_kitchen_scrap_heap",
    label: "폐자재 더미로 간다",
    type: "search",
    outcomeHint: "배식줄 옆 구석에 쌓인 폐자재 더미 앞으로 가, 쓸 만한 고철과 천 조각을 직접 뒤진다.",
    effects: [
      { type: "focus_stock_node", nodeId: "kitchen_scrap_heap" },
      { type: "log", message: "당신은 사람들의 시선을 피해 배식줄 옆 폐자재 더미 앞으로 다가선다." },
    ],
    tags: ["craft", "salvage"],
    riskHint: "low",
  }),
];

export const kitchenLocation: LocationDefinition = {
  id: "kitchen",
  name: "급식소",
  risk: "low",
  mapPosition: { q: 1, r: 0 },
  imagePath: "assets/scenes/kitchen.png",
  summary: "지친 사람들과 눅눅한 공기가 한데 엉켜, 하루를 버티게 해 주는 밥 한 끼와 작은 소문이 오가는 장소다.",
  tags: ["food", "water"],
  traits: ["meal purchase", "rumors", "salvage"],
  obtainableItemIds: ["hotMeal", "waterBottle", "rationTicket", "rawRice", "vegetables", "scrapMetal", "clothScrap"],
  residentIds: ["oldCook"],
  neighbors: ["shelter", "subway"],
  interactionChoices: kitchenChoices,
  eventIds: [],
  links: {
    shelter: { note: "허기를 잠시 달랜 뒤 거처 쪽으로 다시 발걸음을 돌린다." },
    subway: {
      note: "급식소 뒤편 계단을 따라 전기가 끊긴 지하철역 쪽으로 내려간다.",
    },
  },
  stockNodes: [
    {
      id: "kitchen_scrap_heap",
      name: "폐자재 더미",
      summary: "배식줄 옆 구석에 찢긴 앞치마와 굽은 금속 부품, 낡은 조리 도구가 한데 얽혀 있다.",
      money: 0,
      items: [
        { itemId: "scrapMetal", initialQuantity: 4 },
        { itemId: "clothScrap", initialQuantity: 4 },
      ],
    },
  ],
};
