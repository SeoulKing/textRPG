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

export const convenienceChoiceDefinitions: ChoiceDefinition[] = [
  choice({
    id: "go_to_convenience_shelf",
    label: "진열대로 간다",
    outcomeHint: "기울어진 선반 안쪽으로 다가가, 아직 남아 있는 통조림이 있는지 직접 확인한다.",
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
    outcomeHint: "먼지가 잔뜩 쌓인 계산대 앞으로 다가가, 서랍 안에 남은 돈이 있는지 확인한다.",
    conditions: [
      { type: "flag", flag: "convenience_register_found" },
      { type: "active_stock_node_not", nodeId: "convenience_register" },
    ],
    effects: [
      { type: "focus_stock_node", nodeId: "convenience_register" },
      { type: "log", message: "당신은 깨진 플라스틱 조각을 밀어내며 계산대 앞으로 몸을 낮춘다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "collect_canned_food_from_shelf",
    label: "통조림 하나를 챙긴다",
    outcomeHint: "손에 닿는 통조림 하나를 조심스럽게 챙겨, 오늘을 버틸 가능성을 손안에 넣는다.",
    conditions: [
      { type: "active_stock_node", nodeId: "convenience_shelf" },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_shelf", itemId: "cannedFood", amount: 1 },
    ],
    effects: [
      { type: "collect_stock_item", locationId: "convenience", nodeId: "convenience_shelf", itemId: "cannedFood", amount: 1 },
      { type: "set_flag", flag: "first_canned_food_started" },
      { type: "set_flag", flag: "first_canned_food_secured" },
      { type: "log", message: "당신은 먼지를 털어 낸 통조림 하나를 조용히 챙겨 품속에 넣는다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "collect_cash_from_register",
    label: "남은 돈을 챙긴다",
    outcomeHint: "서랍 안 구석에 남은 지폐와 동전을 긁어모아 당장 쓸 수 있는 현금으로 바꾼다.",
    conditions: [
      { type: "active_stock_node", nodeId: "convenience_register" },
      { type: "stock_money_gte", locationId: "convenience", nodeId: "convenience_register", amount: 1 },
    ],
    effects: [
      { type: "collect_stock_money", locationId: "convenience", nodeId: "convenience_register", amount: 600 },
      { type: "log", message: "당신은 계산대 서랍 구석에 남은 지폐와 동전을 모아 조심스럽게 주머니에 넣는다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "leave_stock_node",
    label: "가게 안쪽으로 물러난다",
    outcomeHint: "진열대 앞에서 한 걸음 물러나, 다시 가게 안 전체를 살필 수 있는 자리로 돌아간다.",
    conditions: [{ type: "active_stock_node", nodeId: "convenience_shelf" }],
    effects: [
      { type: "clear_stock_node_focus" },
      { type: "log", message: "당신은 손에 쥔 것을 확인한 뒤, 조심스럽게 한 걸음 물러난다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "leave_convenience_register",
    label: "계산대에서 물러난다",
    outcomeHint: "서랍 앞에서 몸을 일으켜, 다시 가게 안 전체를 살필 수 있는 자리로 돌아간다.",
    conditions: [{ type: "active_stock_node", nodeId: "convenience_register" }],
    effects: [
      { type: "clear_stock_node_focus" },
      { type: "log", message: "당신은 계산대 서랍을 덮어 둔 채, 다시 가게 안쪽을 살필 자리로 물러난다." },
    ],
    riskHint: "low",
  }),
];
