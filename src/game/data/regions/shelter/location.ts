import type { ActionDefinition, LocationDefinition } from "../../../schemas";
import { interactionFor } from "../../location-interaction-helpers";

export const shelterChoices: ActionDefinition[] = [
  interactionFor("shelter", {
    id: "rest_light_at_shelter",
    label: "휴식한다",
    type: "rest",
    outcomeHint: "긴장을 조금 풀고 체력과 정신을 추스른다. 밤까지 잠들지는 않는다.",
    effects: [
      { type: "change_stat", stat: "hp", value: 1 },
      { type: "change_stat", stat: "mind", value: 1 },
      { type: "log", message: "당신은 천막 구석에 잠시 누워 숨을 고른다. 완전히 잠들지는 않지만 몸이 조금 가벼워진다." },
    ],
    tags: ["recovery"],
    riskHint: "low",
  }),
  interactionFor("shelter", {
    id: "sleep_at_shelter",
    label: "잠자기",
    type: "use",
    presentationMode: "always",
    outcomeHint: "오후 6시(게임 시계) 이전에는 눌러도 잠들 수 없고 안내만 본다. 이후에는 다음날 아침 6시에 깨어나며 체력과 정신을 조금 추스른다.",
    conditions: [{ type: "shelter_sleep_window" }],
    failureNote: "오후 6시 이후부터 잠자기를 이용할 수 있다.",
    failureEffects: [
      {
        type: "log",
        message:
          "아직 해가 지지 않았다. 잠자리는 상단 시계 기준 오후 6시가 지나야 이용할 수 있고, 잠들면 다음날 아침 6시에 깨어난다.",
      },
    ],
    effects: [
      { type: "log", message: "당신은 덧댄 천 너머로 새어 들어오는 한기를 느끼며 눈을 감는다." },
      { type: "change_stat", stat: "hp", value: 1 },
      { type: "change_stat", stat: "mind", value: 1 },
      { type: "advance_to_daybreak" },
    ],
    tags: ["recovery", "sleep"],
    riskHint: "low",
  }),
  interactionFor("shelter", {
    id: "craft_shelter_wall_patch",
    label: "천막 틈을 막아 거처를 보강한다",
    type: "use",
    outcomeHint: "목재 판자와 천 조각으로 찢긴 틈을 덧대어, 밤에 잠들 때 바람을 조금 덜 맞게 된다.",
    conditions: [
      { type: "flag_not", flag: "shelter_wall_patch" },
      { type: "has_item", itemId: "woodPlank", amount: 1 },
      { type: "has_item", itemId: "clothScrap", amount: 2 },
    ],
    effects: [
      { type: "remove_item", itemId: "woodPlank", amount: 1 },
      { type: "remove_item", itemId: "clothScrap", amount: 2 },
      { type: "set_flag", flag: "shelter_wall_patch" },
      {
        type: "log",
        message: "당신은 판자와 천 조각으로 찢긴 천막 틈을 눌러 막는다. 이제 밤마다 스며들던 바람이 조금은 덜 매섭게 느껴질 것이다.",
      },
    ],
    tags: ["craft", "upgrade", "shelter"],
    riskHint: "low",
  }),
  interactionFor("shelter", {
    id: "craft_shelter_brazier",
    label: "간이 화로를 만든다",
    type: "use",
    outcomeHint: "고철과 목재를 엮어 작은 화로를 만들면, 거처 안에서도 간단한 음식을 끓일 수 있게 된다.",
    conditions: [
      { type: "flag_not", flag: "shelter_brazier" },
      { type: "has_item", itemId: "scrapMetal", amount: 2 },
      { type: "has_item", itemId: "woodPlank", amount: 1 },
    ],
    effects: [
      { type: "remove_item", itemId: "scrapMetal", amount: 2 },
      { type: "remove_item", itemId: "woodPlank", amount: 1 },
      { type: "set_flag", flag: "shelter_brazier" },
      {
        type: "log",
        message:
          "당신은 휘어진 고철 조각을 엮고 판자를 받쳐 간신히 버틸 만한 화로를 만든다. 이제 거처에서도 제대로 불을 붙일 수 있다.",
      },
    ],
    tags: ["craft", "upgrade", "cooking"],
    riskHint: "low",
  }),
  interactionFor("shelter", {
    id: "craft_shelter_rain_bucket",
    label: "빗물통을 손본다",
    type: "use",
    outcomeHint: "고철과 천 조각으로 허술한 물받이를 만들면, 하루에 한 번쯤 마실 물을 받아 둘 수 있다.",
    conditions: [
      { type: "flag_not", flag: "shelter_rain_bucket" },
      { type: "has_item", itemId: "scrapMetal", amount: 1 },
      { type: "has_item", itemId: "clothScrap", amount: 1 },
    ],
    effects: [
      { type: "remove_item", itemId: "scrapMetal", amount: 1 },
      { type: "remove_item", itemId: "clothScrap", amount: 1 },
      { type: "set_flag", flag: "shelter_rain_bucket" },
      {
        type: "log",
        message:
          "당신은 찌그러진 금속통과 천 조각을 엮어 천막 가장자리에 물받이를 건다. 비와 이슬이 조금씩이라도 모이면 버틸 여지가 늘어난다.",
      },
    ],
    tags: ["craft", "upgrade", "water"],
    riskHint: "low",
  }),
  interactionFor("shelter", {
    id: "collect_rainwater_at_shelter",
    label: "빗물통에서 물을 받아 둔다",
    type: "use",
    outcomeHint: "오늘 모인 빗물과 이슬을 한 병 분량으로 받아 둔다.",
    conditions: [
      { type: "flag", flag: "shelter_rain_bucket" },
      { type: "flag_not", flag: "rain_bucket_drawn_today" },
    ],
    effects: [
      { type: "add_item", itemId: "waterBottle", amount: 1 },
      { type: "set_flag", flag: "rain_bucket_drawn_today" },
      {
        type: "log",
        message:
          "당신은 천막 가장자리에 맺힌 빗물과 물받이에 고인 물을 조심스럽게 따라 담는다. 한 병뿐이지만, 목을 축일 여유가 생긴다.",
      },
    ],
    tags: ["water", "resource"],
    riskHint: "low",
  }),
  interactionFor("shelter", {
    id: "inspect_cooking_corner_at_shelter",
    label: "요리하기",
    type: "use",
    outcomeHint: "아직은 제대로 된 불씨와 화로가 없어, 재료가 있어도 끓일 수 없다.",
    conditions: [{ type: "flag_not", flag: "shelter_brazier" }],
    effects: [
      {
        type: "log",
        message:
          "작은 화로 자리는 비어 있고, 재료를 얹을 그릇도 마땅치 않다. 고철과 목재를 모아 간이 화로부터 만들어야 요리를 시작할 수 있을 것 같다.",
      },
    ],
    tags: ["food", "craft", "cooking_placeholder"],
    riskHint: "low",
  }),
  interactionFor("shelter", {
    id: "cook_at_shelter",
    label: "요리하기",
    type: "use",
    outcomeHint: "쌀과 채소, 그리고 연료로 쓸 목재 판자가 있다면 한 끼 분량의 따뜻한 식사를 만들 수 있다.",
    conditions: [{ type: "flag", flag: "shelter_brazier" }],
    failureNote: "쌀, 채소, 그리고 목재 판자 한 장이 있어야 화로에 제대로 불을 붙일 수 있다.",
    failureEffects: [
      {
        type: "log",
        message:
          "화로는 준비됐지만, 지금은 쌀과 채소, 그리고 불쏘시개로 쓸 목재가 모자란다. 요리를 하려면 재료를 더 챙겨 와야 한다.",
      },
    ],
    effects: [
      { type: "remove_item", itemId: "rawRice", amount: 1 },
      { type: "remove_item", itemId: "vegetables", amount: 1 },
      { type: "remove_item", itemId: "woodPlank", amount: 1 },
      { type: "add_item", itemId: "hotMeal", amount: 1 },
      {
        type: "log",
        message:
          "당신은 간이 화로에 불을 붙여 쌀과 채소를 끓인다. 거칠고 소박한 냄새뿐이지만, 완성된 한 그릇은 분명 오늘을 버티게 해 줄 식사다.",
      },
    ],
    tags: ["food", "craft", "cooking"],
    riskHint: "low",
  }),
];

export const shelterLocation: LocationDefinition = {
  id: "shelter",
  name: "임시 거처",
  risk: "safe",
  imagePath: "assets/scenes/shelter.png",
  summary: "지친 생존자들이 잠시 등을 기대고 초라하지만 바깥보다는 먼지와 악취가 덜한 쉼을 공유하는 곳이다.",
  tags: ["hub", "safe", "rest"],
  traits: ["rest", "cooking", "shelter crafting"],
  obtainableItemIds: ["emergencySnack", "waterBottle", "hotMeal", "rawRice", "vegetables", "woodPlank", "scrapMetal", "clothScrap"],
  residentIds: [],
  neighbors: ["convenience", "kitchen"],
  interactionChoices: shelterChoices,
  eventIds: [],
  links: {
    convenience: {
      note: "무너진 보도와 깨진 유리 조각을 밟으며 편의점 쪽으로 간다.",
      requiredFlag: "opening_seen",
      blockedReason: "먼저 마음을 다잡고 오늘을 버틸 이유를 정해야 한다.",
    },
    kitchen: {
      note: "연기 냄새와 줄의 웅성임이 섞여 있는 급식소 방향으로 발걸음을 옮긴다.",
      requiredFlag: "opening_seen",
      blockedReason: "먼저 숨을 고르고 오늘을 버틸 이유부터 정해야 한다.",
    },
  },
  stockNodes: [],
};
