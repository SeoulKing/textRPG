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

export const shelterChoiceDefinitions: ChoiceDefinition[] = [
  choice({
    id: "opening_commit",
    label: "그래도 살아남아야 한다",
    outcomeHint: "흐트러진 숨을 가다듬고, 오늘 하루를 버틸 방법부터 차례대로 붙잡기로 한다.",
    effects: [
      { type: "set_flag", flag: "opening_seen" },
      { type: "log", message: "당신은 오늘 하루를 운이 아니라, 자신의 선택으로 버텨 보기로 한다." },
    ],
    nextSceneId: "prologue_old_woman_visit",
    riskHint: "low",
  }),
  choice({
    id: "accept_first_canned_food_quest",
    label: "퀘스트: 편의점에서 통조림 구하기",
    outcomeHint: "노파의 말을 따라 편의점 잔해로 향해, 오늘 하루를 버틸 첫 식량부터 찾아 나선다.",
    conditions: [{ type: "flag_not", flag: "first_canned_food_started" }],
    effects: [
      { type: "set_flag", flag: "first_canned_food_started" },
      { type: "log", message: "당신은 노파의 말을 되새기며, 오늘의 첫 목표를 편의점 잔해의 통조림으로 정한다." },
    ],
    nextSceneId: "shelter_first_intro",
    riskHint: "low",
  }),
];
