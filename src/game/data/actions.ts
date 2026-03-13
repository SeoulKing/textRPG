import type { ActionDefinition } from "../schemas";

type SceneActionInput = Omit<ActionDefinition, "visibility" | "conditions"> & Partial<Pick<ActionDefinition, "conditions">>;

function sceneAction(action: SceneActionInput): ActionDefinition {
  return {
    visibility: "scene",
    conditions: [],
    ...action,
  };
}

export const actionDefinitions: ActionDefinition[] = [
  sceneAction({
    id: "survey_shelter",
    label: "거처의 숨결을 살핀다",
    type: "explore",
    outcomeHint: "사람들의 표정과 남은 물자, 오늘 움직일 만한 기운을 가늠해 본다.",
    locationIds: ["shelter"],
    effects: [{ type: "log", message: "당신은 거처 안을 천천히 둘러보며 오늘의 공기를 읽는다." }],
    tags: ["survey"],
  }),
  sceneAction({
    id: "rest_at_shelter",
    label: "거처에서 몸을 눕힌다",
    type: "rest",
    outcomeHint: "짧게나마 긴장을 내려놓고 몸과 마음을 추슬러 본다.",
    locationIds: ["shelter"],
    effects: [
      { type: "change_stat", stat: "hp", value: 1 },
      { type: "change_stat", stat: "mind", value: 1 },
      { type: "log", message: "당신은 소란한 숨소리 사이에서 잠깐 눈을 붙인다." },
    ],
    tags: ["recovery"],
    riskHint: "low",
  }),
  sceneAction({
    id: "cook_simple_meal",
    label: "쌀과 채소로 한 끼를 끓인다",
    type: "use",
    outcomeHint: "볼품은 없어도, 뜨거운 김이 오르는 식사는 하루를 조금 덜 잔인하게 만든다.",
    locationIds: ["shelter"],
    conditions: [
      { type: "has_item", itemId: "rawRice", amount: 1 },
      { type: "has_item", itemId: "vegetables", amount: 1 },
    ],
    effects: [
      { type: "remove_item", itemId: "rawRice", amount: 1 },
      { type: "remove_item", itemId: "vegetables", amount: 1 },
      { type: "add_item", itemId: "hotMeal", amount: 1 },
      { type: "set_flag", flag: "mealSecured" },
      { type: "log", message: "당신은 거처 한쪽에서 조용히 냄비를 올린다." },
    ],
    tags: ["food", "craft"],
    riskHint: "low",
  }),
  sceneAction({
    id: "survey_convenience",
    label: "살펴보기",
    type: "search",
    outcomeHint: "먼지와 깨진 유리 너머에서 아직 손대지 않은 진열대를 찾아낸다.",
    locationIds: ["convenience"],
    conditions: [{ type: "flag_not", flag: "convenience_shelf_found" }],
    effects: [
      { type: "set_flag", flag: "convenience_shelf_found" },
      { type: "discover_stock_node", nodeId: "convenience_shelf" },
      { type: "log", message: "당신은 무너진 가게 안쪽에서 아직 통조림이 남은 진열대를 찾아낸다." },
    ],
    tags: ["survey"],
  }),
  sceneAction({
    id: "survey_kitchen",
    label: "배식 줄의 분위기를 읽는다",
    type: "talk",
    outcomeHint: "허기와 체념, 소문이 어느 쪽으로 흐르는지 사람들의 말을 엿듣는다.",
    locationIds: ["kitchen"],
    effects: [{ type: "log", message: "당신은 배식 줄 끝에서 사람들의 말을 가만히 주워 담는다." }],
    tags: ["survey"],
  }),
  sceneAction({
    id: "buy_meal_at_kitchen",
    label: "돈을 내고 따뜻한 식사를 산다",
    type: "use",
    outcomeHint: "주머니는 가벼워지지만, 적어도 오늘 저녁의 막막함은 조금 옅어진다.",
    locationIds: ["kitchen"],
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
