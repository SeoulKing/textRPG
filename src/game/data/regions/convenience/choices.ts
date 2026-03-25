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

export const convenienceChoiceDefinitions: ChoiceDefinition[] = [
  choice({
    id: "go_to_convenience_shelf",
    label: "진열대로 간다",
    outcomeHint: "기울어진 선반 안쪽으로 다가가, 남아 있는 통조림이 얼마나 되는지 직접 확인한다.",
    conditions: [
      { type: "flag", flag: "convenience_shelf_found" },
      { type: "active_stock_node_not", nodeId: "convenience_shelf" },
    ],
    effects: [
      { type: "focus_stock_node", nodeId: "convenience_shelf" },
      { type: "log", message: "당신은 유리 조각을 피해, 숨을 죽인 채 진열대 앞으로 천천히 다가선다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "go_to_convenience_register",
    label: "계산대로 간다",
    outcomeHint: "먼지가 얇게 내려앉은 계산대 앞으로 다가가, 서랍 안에 남은 돈이 있는지 확인한다.",
    conditions: [
      { type: "flag", flag: "convenience_register_found" },
      { type: "active_stock_node_not", nodeId: "convenience_register" },
    ],
    effects: [
      { type: "focus_stock_node", nodeId: "convenience_register" },
      { type: "log", message: "당신은 깨진 플라스틱 조각을 밀어내며 계산대 앞으로 몸을 숙인다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "go_to_convenience_supply_pile",
    label: "창고 자재 더미로 간다",
    outcomeHint: "무너진 선반 아래로 몸을 들이밀어, 쓸 만한 판자와 천 조각, 금속 부품을 직접 살핀다.",
    conditions: [
      { type: "flag", flag: "convenience_materials_found" },
      { type: "active_stock_node_not", nodeId: "convenience_supply_pile" },
    ],
    effects: [
      { type: "focus_stock_node", nodeId: "convenience_supply_pile" },
      { type: "log", message: "당신은 반쯤 주저앉은 창고 선반 아래로 몸을 들이밀어 자재 더미 앞에 선다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "collect_canned_food_from_shelf",
    label: "남은 통조림을 전부 챙긴다",
    outcomeHint: "눈앞에 남아 있는 통조림을 모조리 쓸어 담아, 오늘을 버틸 식량을 한 번에 확보한다.",
    conditions: [
      { type: "active_stock_node", nodeId: "convenience_shelf" },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_shelf", itemId: "cannedFood", amount: 1 },
    ],
    effects: [
      collectStockItemEffect({ locationId: "convenience", nodeId: "convenience_shelf", itemId: "cannedFood" }),
      { type: "set_flag", flag: "first_canned_food_started" },
      { type: "set_flag", flag: "first_canned_food_secured" },
      { type: "log", message: "당신은 진열대에 남아 있던 통조림을 전부 쓸어 담아 조심스럽게 품에 안는다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "collect_cash_from_register",
    label: "남은 현금을 챙긴다",
    outcomeHint: "서랍 구석에 남은 지폐와 동전을 빠짐없이 긁어모아 한 번에 챙긴다.",
    conditions: [
      { type: "active_stock_node", nodeId: "convenience_register" },
      { type: "stock_money_gte", locationId: "convenience", nodeId: "convenience_register", amount: 1 },
    ],
    effects: [
      { type: "collect_stock_money_all", locationId: "convenience", nodeId: "convenience_register" },
      { type: "log", message: "당신은 계산대 서랍 구석에 남은 지폐와 동전을 빠짐없이 긁어모아 주머니에 넣는다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "collect_wood_from_supply_pile",
    label: "쓸 만한 판자를 챙긴다",
    outcomeHint: "아직 버틸 만한 판자들을 한데 모아, 거처 보강과 불씨 재료로 쓸 목재를 확보한다.",
    conditions: [
      { type: "active_stock_node", nodeId: "convenience_supply_pile" },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "woodPlank", amount: 1 },
    ],
    effects: [
      collectStockItemEffect({ locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "woodPlank" }),
      { type: "log", message: "당신은 아직 단단한 판자들을 한데 모아 어깨에 걸친다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "collect_cloth_from_supply_pile",
    label: "질긴 천 조각을 챙긴다",
    outcomeHint: "해지지 않은 천 조각들을 추려, 거처 틈을 막거나 묶는 데 쓸 재료로 챙긴다.",
    conditions: [
      { type: "active_stock_node", nodeId: "convenience_supply_pile" },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "clothScrap", amount: 1 },
    ],
    effects: [
      collectStockItemEffect({ locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "clothScrap" }),
      { type: "log", message: "당신은 먼지를 털어 낸 천 조각들을 한데 접어 품속에 넣는다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "collect_metal_from_supply_pile",
    label: "금속 부품을 챙긴다",
    outcomeHint: "휘어진 금속 부품과 철판 조각을 그러모아, 간이 제작에 쓸 고철로 챙긴다.",
    conditions: [
      { type: "active_stock_node", nodeId: "convenience_supply_pile" },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "scrapMetal", amount: 1 },
    ],
    effects: [
      collectStockItemEffect({ locationId: "convenience", nodeId: "convenience_supply_pile", itemId: "scrapMetal" }),
      { type: "log", message: "당신은 선반 모서리에 걸린 금속 부품을 비틀어 떼어 낸다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "leave_stock_node",
    label: "가게 안쪽으로 물러선다",
    outcomeHint: "진열대 앞에서 한 걸음 물러나 다시 가게 전체를 둘러볼 수 있는 자리로 돌아간다.",
    conditions: [{ type: "active_stock_node", nodeId: "convenience_shelf" }],
    effects: [
      { type: "clear_stock_node_focus" },
      { type: "log", message: "당신은 손에 쥔 것을 확인한 뒤 조심스럽게 몇 걸음 물러선다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "leave_convenience_supply_pile",
    label: "자재 더미에서 물러선다",
    outcomeHint: "창고 선반 아래에서 몸을 빼고, 다시 가게 전체를 둘러볼 수 있는 자리로 돌아간다.",
    conditions: [{ type: "active_stock_node", nodeId: "convenience_supply_pile" }],
    effects: [
      { type: "clear_stock_node_focus" },
      { type: "log", message: "당신은 자재 더미에서 챙길 것을 추린 뒤 다시 가게 안쪽으로 몸을 뺀다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "leave_convenience_register",
    label: "계산대에서 물러선다",
    outcomeHint: "서랍 앞에서 몸을 일으켜 다시 가게 전체를 둘러볼 수 있는 자리로 돌아간다.",
    conditions: [{ type: "active_stock_node", nodeId: "convenience_register" }],
    effects: [
      { type: "clear_stock_node_focus" },
      { type: "log", message: "당신은 계산대 서랍을 덮어 둔 채 다시 가게 안쪽을 살필 자리로 물러선다." },
    ],
    riskHint: "low",
  }),
];
