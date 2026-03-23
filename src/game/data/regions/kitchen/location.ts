import type { ActionDefinition, LocationDefinition } from "../../../schemas";
import { interactionFor } from "../../location-interaction-helpers";

export const kitchenChoices: ActionDefinition[] = [
  interactionFor("kitchen", {
    id: "survey_kitchen",
    label: "배식 줄의 분위기를 읽는다",
    type: "talk",
    outcomeHint: "허기와 체념, 소문이 어느 쪽으로 흐르는지 사람들의 말을 엿듣는다.",
    effects: [{ type: "log", message: "당신은 배식 줄 끝에서 사람들의 말을 가만히 주워 담는다." }],
    tags: ["survey"],
  }),
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
];

export const kitchenLocation: LocationDefinition = {
  id: "kitchen",
  name: "급식소",
  risk: "low",
  imagePath: "assets/scenes/kitchen.png",
  summary: "끓는 냄비와 지친 대화가 뒤섞인 채, 하루를 버티게 해 주는 배식 거점이다.",
  tags: ["food", "water"],
  traits: ["meal purchase", "rumors", "trading"],
  obtainableItemIds: ["hotMeal", "waterBottle", "rationTicket", "rawRice", "vegetables"],
  residentIds: ["oldCook"],
  neighbors: ["shelter"],
  interactionChoices: kitchenChoices,
  eventIds: [],
  links: {
    shelter: { note: "연기 냄새가 배어 있는 길을 따라 거처로 돌아간다." },
  },
  stockNodes: [],
};
