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
    label: "그래도 살아남아야 한다",
    outcomeHint: "숨을 고르고, 오늘 버틸 일을 하나씩 정하기로 한다.",
    effects: [
      { type: "set_flag", flag: "opening_seen" },
      { type: "log", message: "당신은 오늘 하루를 운이 아니라 선택으로 버텨 보기로 한다." },
    ],
    nextSceneId: "prologue_old_woman_visit",
    riskHint: "low",
  }),
  choice({
    id: "enter_shelter_after_old_woman",
    label: "노파가 가리킨 천막 안을 둘러본다",
    outcomeHint: "노파가 남기고 간 말의 무게를 안은 채, 임시 거처의 공기와 사람들을 제대로 바라본다.",
    effects: [
      { type: "log", message: "당신은 노파가 지나간 자리의 정적을 안고 천막 안쪽을 천천히 둘러본다." },
    ],
    nextSceneId: "shelter_first_intro",
    riskHint: "low",
  }),
  choice({
    id: "accept_first_canned_food_quest",
    label: "퀘스트: 편의점에서 통조림 구하기",
    outcomeHint: "이동 탭에서 편의점 잔해로 향해, 오늘 버틸 첫 식량을 찾는다.",
    conditions: [{ type: "flag_not", flag: "first_canned_food_started" }],
    effects: [
      { type: "set_flag", flag: "first_canned_food_started" },
      { type: "log", message: "당신은 오늘의 첫 목표를 편의점 잔해의 통조림으로 정한다." },
    ],
    nextSceneId: "shelter_repeat_postquest",
    riskHint: "low",
  }),
  choice({
    id: "go_to_convenience_shelf",
    label: "진열대로 간다",
    outcomeHint: "무너진 선반 안쪽으로 더 가까이 다가가 남은 통조림을 확인한다.",
    conditions: [
      { type: "flag", flag: "convenience_shelf_found" },
      { type: "active_stock_node_not", nodeId: "convenience_shelf" },
    ],
    effects: [
      { type: "focus_stock_node", nodeId: "convenience_shelf" },
      { type: "log", message: "당신은 유리 조각을 피해 진열대 앞으로 천천히 다가선다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "collect_canned_food_from_shelf",
    label: "통조림 하나를 챙긴다",
    outcomeHint: "손에 닿는 한 개를 조심스럽게 챙겨 주머니에 넣는다.",
    conditions: [
      { type: "active_stock_node", nodeId: "convenience_shelf" },
      { type: "stock_item_gte", locationId: "convenience", nodeId: "convenience_shelf", itemId: "cannedFood", amount: 1 },
    ],
    effects: [
      { type: "collect_stock_item", locationId: "convenience", nodeId: "convenience_shelf", itemId: "cannedFood", amount: 1 },
      { type: "set_flag", flag: "first_canned_food_started" },
      { type: "set_flag", flag: "first_canned_food_secured" },
      { type: "log", message: "당신은 먼지를 털어 낸 통조림 하나를 조용히 챙긴다." },
    ],
    riskHint: "low",
  }),
  choice({
    id: "leave_stock_node",
    label: "가게 안쪽으로 물러난다",
    outcomeHint: "진열대 앞을 벗어나 다시 가게 전체를 살필 수 있는 자리로 돌아간다.",
    conditions: [{ type: "active_stock_node", nodeId: "convenience_shelf" }],
    effects: [
      { type: "clear_stock_node_focus" },
      { type: "log", message: "당신은 손에 챙긴 것을 확인한 뒤 한 걸음 물러난다." },
    ],
    riskHint: "low",
  }),
];
