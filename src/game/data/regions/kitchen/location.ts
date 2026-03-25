import type { ActionDefinition, LocationDefinition } from "../../../schemas";
import { interactionFor } from "../../location-interaction-helpers";

export const kitchenChoices: ActionDefinition[] = [
  interactionFor("kitchen", {
    id: "buy_meal_at_kitchen",
    label: "돈을 내고 따뜻한 식사를 산다",
    type: "use",
    outcomeHint: "주머니는 가벼워지지만, 적어도 오늘 저녁의 막막함은 조금 옅어진다.",
    conditions: [{ type: "money_gte", amount: 4500 }],
    effects: [
      { type: "change_money", amount: -4500 },
      { type: "add_item", itemId: "hotMeal", amount: 1 },
      { type: "set_flag", flag: "mealSecured" },
      { type: "log", message: "당신은 아끼던 돈을 꺼내 한 끼의 온기를 산다." },
    ],
    tags: ["food", "trade"],
    riskHint: "low",
  }),
  interactionFor("kitchen", {
    id: "search_kitchen_backroom",
    label: "주방 뒤편 폐자재를 뒤진다",
    type: "search",
    outcomeHint: "찢긴 앞치마와 구부러진 냄비 손잡이, 못 쓰는 금속 부품 사이에서 제작에 쓸 자재를 찾아낸다.",
    conditions: [{ type: "flag_not", flag: "kitchen_salvage_found" }],
    effects: [
      { type: "set_flag", flag: "kitchen_salvage_found" },
      { type: "discover_stock_node", nodeId: "kitchen_scrap_heap" },
      {
        type: "log",
        message:
          "당신은 배식대 뒤편 구석을 뒤져 찢긴 천과 고철이 쌓인 폐자재 더미를 찾아낸다. 거처를 손볼 재료로는 충분히 쓸 만해 보인다.",
      },
    ],
    tags: ["survey", "craft"],
    riskHint: "low",
  }),
];

export const kitchenLocation: LocationDefinition = {
  id: "kitchen",
  name: "급식소",
  risk: "low",
  imagePath: "assets/scenes/kitchen.png",
  summary: "끓는 냄비와 지친 대화가 뒤섞인 채, 하루를 버티게 해 주는 배식 거점이다.",
  tags: ["food", "water"],
  traits: ["meal purchase", "rumors", "salvage"],
  obtainableItemIds: ["hotMeal", "waterBottle", "rationTicket", "rawRice", "vegetables", "scrapMetal", "clothScrap"],
  residentIds: ["oldCook"],
  neighbors: ["shelter"],
  interactionChoices: kitchenChoices,
  eventIds: [],
  links: {
    shelter: { note: "연기 냄새가 배어 있는 길을 따라 거처로 돌아간다." },
  },
  stockNodes: [
    {
      id: "kitchen_scrap_heap",
      name: "폐자재 더미",
      summary: "배식대 뒤편에 찢긴 앞치마와 구부러진 금속 부품, 못 쓰는 조리 도구가 한데 쌓여 있다.",
      money: 0,
      items: [
        { itemId: "scrapMetal", initialQuantity: 2 },
        { itemId: "clothScrap", initialQuantity: 2 },
      ],
    },
  ],
};
