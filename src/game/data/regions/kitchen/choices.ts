import type { ChoiceDefinition } from "../../../schemas";
import { collectStockItemEffect } from "../../stock-node-choice-helpers";

type ChoiceInput = Omit<ChoiceDefinition, "conditions" | "hidden"> &
  Partial<Pick<ChoiceDefinition, "conditions" | "hidden">>;

function choice(definition: ChoiceInput): ChoiceDefinition {
  return {
    conditions: [],
    hidden: false,
    ...definition,
  };
}

export const kitchenChoiceDefinitions: ChoiceDefinition[] = [
  choice({
    id: "collect_scrap_from_kitchen_heap",
    label: "쓸 만한 고철을 챙긴다",
    outcomeHint: "덜 녹슨 금속 부품과 철판 조각을 한데 모아, 제작에 쓸 재료로 챙긴다.",
    conditions: [
      { type: "active_stock_node", nodeId: "kitchen_scrap_heap" },
      { type: "stock_item_gte", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "scrapMetal", amount: 1 },
    ],
    effects: [
      collectStockItemEffect({ locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "scrapMetal" }),
      { type: "log", message: "당신은 덜 녹슨 금속 부품을 한데 그러모아 조심스럽게 챙긴다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "collect_cloth_from_kitchen_heap",
    label: "질긴 천 조각을 챙긴다",
    outcomeHint: "찢긴 앞치마와 천 조각 중 아직 쓸 만한 부분만 골라 재료로 챙긴다.",
    conditions: [
      { type: "active_stock_node", nodeId: "kitchen_scrap_heap" },
      { type: "stock_item_gte", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "clothScrap", amount: 1 },
    ],
    effects: [
      collectStockItemEffect({ locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "clothScrap" }),
      { type: "log", message: "당신은 아직 질긴 천 조각만 골라 접어 품속에 넣는다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "leave_kitchen_scrap_heap",
    label: "폐자재 더미에서 물러선다",
    outcomeHint: "더미 앞에서 몸을 빼고 다시 급식소의 메인 공간으로 돌아간다.",
    conditions: [{ type: "active_stock_node", nodeId: "kitchen_scrap_heap" }],
    effects: [
      { type: "clear_stock_node_focus" },
      { type: "log", message: "당신은 챙길 것을 추린 뒤 다시 배식줄이 보이는 쪽으로 물러선다." },
    ],
    riskHint: "low",
  }),
];
