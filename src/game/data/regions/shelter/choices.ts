import type { ChoiceDefinition } from "../../../schemas";

type ChoiceInput = Omit<ChoiceDefinition, "conditions" | "hidden" | "presentationMode" | "failureEffects"> &
  Partial<Pick<ChoiceDefinition, "conditions" | "hidden" | "presentationMode" | "failureEffects">>;

function choice(definition: ChoiceInput): ChoiceDefinition {
  return {
    conditions: [],
    hidden: false,
    presentationMode: "when_conditions_met",
    failureEffects: [],
    ...definition,
  };
}

export const shelterChoiceDefinitions: ChoiceDefinition[] = [
  choice({
    id: "opening_commit",
    label: "그래도 살아남아야 한다",
    outcomeHint: "멍하니 주저앉아 있기보다 오늘 하루를 버틸 방법부터 찾기로 마음먹는다.",
    effects: [
      { type: "set_flag", flag: "opening_seen" },
      { type: "log", message: "당신은 오늘 하루를 버티는 쪽을 택한다. 지금 필요한 건 후회가 아니라 선택이다." },
    ],
    nextSceneId: "prologue_old_woman_visit",
    riskHint: "low",
  }),
  choice({
    id: "accept_first_canned_food_quest",
    label: "편의점에 남은 통조림을 찾으러 간다",
    outcomeHint: "노파의 말을 따라 편의점 폐허로 가, 오늘 버틸 첫 식량부터 확보한다.",
    conditions: [{ type: "flag_not", flag: "first_canned_food_started" }],
    effects: [
      { type: "set_flag", flag: "first_canned_food_started" },
      { type: "log", message: "당신은 노파의 말을 되새기며, 오늘의 첫 목표를 통조림 확보로 정한다." },
    ],
    nextSceneId: "shelter_first_intro",
    riskHint: "low",
  }),
  choice({
    id: "craft_shelter_wall_patch",
    label: "천막 틈을 막아 거처를 보강한다",
    outcomeHint: "필요 재료: 목재 판자 1 / 천 조각 2. 완성하면 잠자기 후 체력과 정신력이 조금 더 회복된다.",
    presentationMode: "always",
    conditions: [
      { type: "flag_not", flag: "shelter_wall_patch" },
      { type: "has_item", itemId: "woodPlank", amount: 1 },
      { type: "has_item", itemId: "clothScrap", amount: 2 },
    ],
    failureNote: "이미 보강을 끝냈거나 재료가 부족하다. 필요 재료: 목재 판자 1 / 천 조각 2. 완성하면 잠자리 회복이 좋아진다.",
    failureEffects: [
      { type: "log", message: "벽 틈을 막으려면 목재 판자 한 장과 천 조각 두 장이 필요하다. 이미 손본 자리라면 더 건드릴 곳도 없다." },
    ],
    effects: [
      { type: "remove_item", itemId: "woodPlank", amount: 1 },
      { type: "remove_item", itemId: "clothScrap", amount: 2 },
      { type: "set_flag", flag: "shelter_wall_patch" },
      {
        type: "log",
        message: "당신은 판자와 천 조각으로 천막 틈을 덧막는다. 이제 밤바람이 스며드는 정도가 한결 덜할 것이다.",
      },
    ],
    nextSceneId: "shelter_crafting_menu",
    riskHint: "low",
  }),
  choice({
    id: "craft_shelter_brazier",
    label: "간이 화로를 만든다",
    outcomeHint: "필요 재료: 고철 2 / 목재 판자 1. 완성하면 거처에서 요리하기 레시피를 사용할 수 있다.",
    presentationMode: "always",
    conditions: [
      { type: "flag_not", flag: "shelter_brazier" },
      { type: "has_item", itemId: "scrapMetal", amount: 2 },
      { type: "has_item", itemId: "woodPlank", amount: 1 },
    ],
    failureNote: "이미 화로가 있거나 재료가 부족하다. 필요 재료: 고철 2 / 목재 판자 1. 완성하면 조리가 가능해진다.",
    failureEffects: [
      { type: "log", message: "간이 화로를 만들려면 고철 두 조각과 판자 한 장이 필요하다. 이미 화로를 만들었다면 더 손댈 이유는 없다." },
    ],
    effects: [
      { type: "remove_item", itemId: "scrapMetal", amount: 2 },
      { type: "remove_item", itemId: "woodPlank", amount: 1 },
      { type: "set_flag", flag: "shelter_brazier" },
      {
        type: "log",
        message: "당신은 모은 고철과 판자를 엮어 작은 화로를 만든다. 이제 거처 안에서도 제대로 불을 피울 수 있다.",
      },
    ],
    nextSceneId: "shelter_crafting_menu",
    riskHint: "low",
  }),
  choice({
    id: "craft_shelter_rain_bucket",
    label: "빗물통을 손본다",
    outcomeHint: "필요 재료: 고철 1 / 천 조각 1. 완성하면 하루에 한 번 물 한 병을 받을 수 있다.",
    presentationMode: "always",
    conditions: [
      { type: "flag_not", flag: "shelter_rain_bucket" },
      { type: "has_item", itemId: "scrapMetal", amount: 1 },
      { type: "has_item", itemId: "clothScrap", amount: 1 },
    ],
    failureNote: "이미 물받이를 만들어 두었거나 재료가 부족하다. 필요 재료: 고철 1 / 천 조각 1. 완성하면 하루 한 번 물을 확보한다.",
    failureEffects: [
      { type: "log", message: "빗물통을 손보려면 고철 한 조각과 천 조각 한 장이 필요하다. 이미 완성해 둔 설비라면 더 만들 필요도 없다." },
    ],
    effects: [
      { type: "remove_item", itemId: "scrapMetal", amount: 1 },
      { type: "remove_item", itemId: "clothScrap", amount: 1 },
      { type: "set_flag", flag: "shelter_rain_bucket" },
      {
        type: "log",
        message: "당신은 천막 가장자리에 물이 모이도록 빗물통을 손본다. 비만 내리면 하루를 넘길 물을 조금은 모을 수 있을 것이다.",
      },
    ],
    nextSceneId: "shelter_crafting_menu",
    riskHint: "low",
  }),
  choice({
    id: "cook_at_shelter",
    label: "따뜻한 식사를 만든다",
    outcomeHint: "전제: 간이 화로 완성. 필요 재료: 쌀 1 / 채소 1 / 목재 판자 1. 완성하면 따뜻한 식사 1개를 만든다.",
    presentationMode: "always",
    conditions: [
      { type: "flag", flag: "shelter_brazier" },
      { type: "has_item", itemId: "rawRice", amount: 1 },
      { type: "has_item", itemId: "vegetables", amount: 1 },
      { type: "has_item", itemId: "woodPlank", amount: 1 },
    ],
    failureNote: "간이 화로가 있어야 하고, 쌀 1 / 채소 1 / 목재 판자 1이 필요하다. 완성하면 따뜻한 식사 1개를 만든다.",
    failureEffects: [
      { type: "log", message: "조리를 하려면 먼저 간이 화로가 있어야 하고, 쌀과 채소, 그리고 불씨로 쓸 목재 판자 한 장이 필요하다." },
    ],
    effects: [
      { type: "remove_item", itemId: "rawRice", amount: 1 },
      { type: "remove_item", itemId: "vegetables", amount: 1 },
      { type: "remove_item", itemId: "woodPlank", amount: 1 },
      { type: "add_item", itemId: "hotMeal", amount: 1 },
      {
        type: "log",
        message: "당신은 화로에 불을 지펴 쌀과 채소를 끓인다. 초라한 재료지만, 한 끼를 버틸 만한 따뜻한 식사가 완성된다.",
      },
    ],
    nextSceneId: "shelter_crafting_menu",
    riskHint: "low",
  }),
  choice({
    id: "leave_shelter_crafting",
    label: "제작 자리에서 물러난다",
    outcomeHint: "재료를 다시 정리해 두고, 임시 거처의 메인 공간으로 돌아간다.",
    effects: [
      { type: "clear_flag", flag: "shelter_crafting_open" },
      { type: "log", message: "당신은 펼쳐 둔 자재를 다시 한쪽으로 밀어 두고, 천막 안 메인 공간으로 몸을 돌린다." },
    ],
    riskHint: "low",
  }),
];
