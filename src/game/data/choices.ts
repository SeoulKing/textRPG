import type { ChoiceDefinition } from "../schemas";

type ChoiceInput = Omit<ChoiceDefinition, "conditions" | "hidden"> & Partial<Pick<ChoiceDefinition, "conditions" | "hidden">>;

function choice(definition: ChoiceInput): ChoiceDefinition {
  return {
    conditions: [],
    hidden: false,
    ...definition,
  };
}

export const choiceDefinitions: ChoiceDefinition[] = [
  choice({
    id: "opening_commit",
    label: "오늘 하루를 버티기로 마음먹는다",
    outcomeHint: "한 끼와 물, 그리고 돌아올 길을 염두에 두고 하루를 정리한다.",
    effects: [
      { type: "set_flag", flag: "opening_seen" },
      { type: "set_scene", sceneId: "shelter_day_intro" },
      { type: "log", message: "당신은 오늘을 운이 아니라 선택으로 버텨 보기로 한다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "accept_first_canned_food_quest",
    label: "퀘스트: 편의점에서 통조림 구하기",
    outcomeHint: "이동 탭에서 편의점 잔해로 향해, 오늘 버틸 첫 식량을 찾아야 한다.",
    conditions: [{ type: "flag_not", flag: "first_canned_food_started" }],
    effects: [
      { type: "set_flag", flag: "first_canned_food_started" },
      { type: "log", message: "당신은 오늘의 첫 목표를 편의점 잔해의 통조림으로 정한다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "go_to_convenience_shelf",
    label: "진열대로 가기",
    outcomeHint: "무너진 선반 가까이 다가가 남은 통조림을 눈으로 헤아려 본다.",
    conditions: [
      { type: "flag", flag: "convenience_shelf_found" },
      { type: "active_stock_node_not", nodeId: "convenience_shelf" },
    ],
    effects: [
      { type: "focus_stock_node", nodeId: "convenience_shelf" },
      { type: "log", message: "당신은 발밑의 유리를 조심하며 진열대 앞으로 다가선다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "collect_canned_food_from_shelf",
    label: "통조림 하나를 챙긴다",
    outcomeHint: "지금 손에 닿는 한 개를 먼저 챙겨 주머니에 숨긴다.",
    conditions: [
      { type: "active_stock_node", nodeId: "convenience_shelf" },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_shelf", itemId: "cannedFood", amount: 1 },
    ],
    effects: [
      { type: "collect_stock_item", locationId: "convenience", nodeId: "convenience_shelf", itemId: "cannedFood", amount: 1 },
      { type: "set_flag", flag: "first_canned_food_started" },
      { type: "set_flag", flag: "first_canned_food_secured" },
      { type: "log", message: "당신은 먼지를 털어 낸 통조림 하나를 조용히 품 안에 넣는다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "leave_stock_node",
    label: "가게 안쪽으로 물러난다",
    outcomeHint: "진열대 앞을 벗어나 다시 가게 전체를 살필 수 있는 자리로 물러선다.",
    conditions: [{ type: "active_stock_node", nodeId: "convenience_shelf" }],
    effects: [
      { type: "clear_stock_node_focus" },
      { type: "log", message: "당신은 손에 쥔 것을 단단히 챙기고 한 걸음 물러난다." },
    ],
    riskHint: "low",
  }),
];
