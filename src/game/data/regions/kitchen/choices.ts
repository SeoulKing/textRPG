import type { ChoiceDefinition } from "../../../schemas";

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
    id: "go_to_kitchen_scrap_heap",
    label: "폐자재 더미로 간다",
    outcomeHint: "배식대 뒤편 더미 쪽으로 다가가, 쓸 만한 고철과 천 조각이 남아 있는지 직접 살핀다.",
    conditions: [
      { type: "flag", flag: "kitchen_salvage_found" },
      { type: "active_stock_node_not", nodeId: "kitchen_scrap_heap" },
    ],
    effects: [
      { type: "focus_stock_node", nodeId: "kitchen_scrap_heap" },
      { type: "log", message: "당신은 사람들의 눈을 피해 배식대 뒤편 폐자재 더미 앞으로 몸을 낮춘다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "collect_scrap_from_kitchen_heap",
    label: "쓸 만한 고철을 챙긴다",
    outcomeHint: "휘어진 금속 손잡이와 철판 조각을 골라 간이 제작에 쓸 자재로 챙긴다.",
    conditions: [
      { type: "active_stock_node", nodeId: "kitchen_scrap_heap" },
      { type: "stock_item_gte", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "scrapMetal", amount: 1 },
    ],
    effects: [
      { type: "collect_stock_item", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "scrapMetal", amount: 1 },
      { type: "log", message: "당신은 덜 녹슨 금속 부품 몇 개를 추려내 챙긴다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "collect_cloth_from_kitchen_heap",
    label: "찢긴 천 조각을 챙긴다",
    outcomeHint: "앞치마와 행주 조각 중 질긴 부분만 골라 수리용 재료로 챙긴다.",
    conditions: [
      { type: "active_stock_node", nodeId: "kitchen_scrap_heap" },
      { type: "stock_item_gte", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "clothScrap", amount: 1 },
    ],
    effects: [
      { type: "collect_stock_item", locationId: "kitchen", nodeId: "kitchen_scrap_heap", itemId: "clothScrap", amount: 1 },
      { type: "log", message: "당신은 아직 질긴 천 조각만 골라 접어 챙긴다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "leave_kitchen_scrap_heap",
    label: "폐자재 더미에서 물러난다",
    outcomeHint: "배식대 뒤편 더미에서 몸을 빼고, 다시 급식소의 메인 공간으로 돌아간다.",
    conditions: [{ type: "active_stock_node", nodeId: "kitchen_scrap_heap" }],
    effects: [
      { type: "clear_stock_node_focus" },
      { type: "log", message: "당신은 챙길 것을 추린 뒤, 다시 배식 줄이 보이는 쪽으로 물러난다." },
    ],
    riskHint: "low",
  }),
];
