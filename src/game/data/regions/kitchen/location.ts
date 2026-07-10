import type { ActionDefinition } from "../../../schemas";
import { defineLocation, interactionFor, stockNode } from "../../location-helpers";

export const kitchenChoices: ActionDefinition[] = [
  interactionFor("kitchen", {
    id: "buy_meal_at_kitchen",
    label: "돈을 내고 따뜻한 식사를 산다",
    type: "use",
    outcomeHint: "4,500원을 내고 따뜻한 식사 1개를 얻는다.",
    showOutcomeHint: true,
    conditions: [
      { type: "day_lt", value: 2 },
      { type: "money_gte", amount: 4500 },
    ],
    effects: [
      { type: "change_money", amount: -4500 },
      { type: "add_item", itemId: "hotMeal", amount: 1 },
      { type: "set_flag", flag: "mealSecured" },
      { type: "log", message: "당신은 아껴 둔 돈을 꺼내 오늘 몫의 따뜻한 식사를 산다." },
      { type: "advance_time", minutes: 15 },
    ],
    tags: ["food", "trade"],
    riskHint: "low",
  }),
  interactionFor("kitchen", {
    id: "buy_crowded_meal_at_kitchen",
    label: "붐비는 배식줄에서 식사를 산다",
    type: "use",
    outcomeHint: "피난민이 늘어 오른 가격이다. 5,200원을 내고 따뜻한 식사 1개를 얻는다.",
    showOutcomeHint: true,
    conditions: [
      { type: "day_gte", value: 2 },
      { type: "money_gte", amount: 5200 },
    ],
    effects: [
      { type: "change_money", amount: -5200 },
      { type: "add_item", itemId: "hotMeal", amount: 1 },
      { type: "set_flag", flag: "mealSecured" },
      { type: "log", message: "배식줄은 더 길어졌고 값도 올랐다. 당신은 돈을 치르고 따뜻한 식사 하나를 받아 든다." },
      { type: "advance_time", minutes: 15 },
    ],
    tags: ["food", "trade"],
    riskHint: "low",
  }),
  interactionFor("kitchen", {
    id: "exchange_ration_ticket_at_kitchen",
    label: "배식권을 식사로 바꾼다",
    type: "use",
    outcomeHint: "배식권 1장을 내고 따뜻한 식사 1개를 받는다. +10분",
    showOutcomeHint: true,
    conditions: [{ type: "has_item", itemId: "rationTicket", amount: 1 }],
    effects: [
      { type: "remove_item", itemId: "rationTicket", amount: 1 },
      { type: "add_item", itemId: "hotMeal", amount: 1 },
      { type: "set_flag", flag: "mealSecured" },
      { type: "set_flag", flag: "ration_ticket_exchanged" },
      { type: "log", message: "당신은 구겨진 배식권을 내밀고 따뜻한 식사 한 그릇을 받아 든다." },
      { type: "advance_time", minutes: 10 },
    ],
    nextSceneId: "kitchen_ration_ticket_exchange",
    tags: ["food", "trade", "ticket"],
    riskHint: "low",
  }),
  interactionFor("kitchen", {
    id: "ask_kitchen_hospital_rumor",
    label: "작은 병원 소문을 묻는다",
    type: "talk",
    outcomeHint: "20분을 들여 병원으로 이어지는 골목 정보를 듣는다.",
    showOutcomeHint: true,
    conditions: [{ type: "flag_not", flag: "hospital_lead_checked" }],
    effects: [
      { type: "set_flag", flag: "hospital_lead_checked" },
      { type: "set_flag", flag: "known_hospital" },
      { type: "log", message: "배식줄에서 편의점 뒤편 골목을 지나면 작은 병원이 나온다는 말을 들었다." },
      { type: "advance_time", minutes: 20 },
    ],
    nextSceneId: "kitchen_rumor_hospital",
    tags: ["rumor", "location", "hospital"],
    riskHint: "low",
  }),
  interactionFor("kitchen", {
    id: "listen_kitchen_line_rumors",
    label: "배식줄 소문을 듣는다",
    type: "talk",
    outcomeHint: "15분을 들여 줄 사이의 소문과 오늘의 분위기를 듣는다.",
    showOutcomeHint: true,
    effects: [
      { type: "advance_time", minutes: 15 },
      {
        type: "random_outcome",
        outcomes: [
          {
            weight: 35,
            effects: [
              { type: "log", message: "배식줄에서는 오늘 식재료가 더 빨리 줄고 있다는 말이 돈다." },
              { type: "set_scene", sceneId: "kitchen_rumor_prices" },
            ],
          },
          {
            weight: 30,
            effects: [
              { type: "log", message: "누군가 지하철역 아래에서 금속 끌리는 소리를 들었다고 낮게 말했다." },
              { type: "set_scene", sceneId: "kitchen_rumor_subway" },
            ],
          },
          {
            weight: 20,
            effects: [
              { type: "log", message: "검문소 쪽에서 무전 잡음이 들렸다는 소문이 줄 끝에서 줄 앞까지 천천히 번졌다." },
              { type: "set_scene", sceneId: "kitchen_rumor_checkpoint" },
            ],
          },
          {
            weight: 15,
            effects: [
              { type: "log", message: "노파는 오늘 밤 바람이 세질 것 같다며 천막 끈을 다시 확인하라고 말했다." },
              { type: "set_scene", sceneId: "kitchen_rumor_weather" },
            ],
          },
        ],
      },
    ],
    tags: ["rumor", "world", "repeatable"],
    riskHint: "low",
  }),
  interactionFor("kitchen", {
    id: "help_kitchen_queue",
    label: "배식소 일을 돕는다",
    type: "use",
    outcomeHint: "기력 -1 / 보상: 1,200원·배식권·따뜻한 식사·물병 중 하나 / +40분",
    showOutcomeHint: true,
    conditions: [{ type: "stat_gte", stat: "energy", value: 1 }],
    effects: [
      { type: "change_stat", stat: "energy", value: -1 },
      { type: "advance_time", minutes: 40 },
      {
        type: "random_outcome",
        outcomes: [
          {
            weight: 40,
            effects: [
              { type: "change_money", amount: 1200 },
              { type: "log", message: "당신은 배식줄 정리를 돕고 품삯으로 1,200원을 받았다." },
              { type: "set_scene", sceneId: "kitchen_work_wage" },
            ],
          },
          {
            weight: 25,
            effects: [
              { type: "add_item", itemId: "rationTicket", amount: 1 },
              { type: "log", message: "당신은 배식소 일을 거들고 다음 식사에 쓸 배식권 한 장을 받았다." },
              { type: "set_scene", sceneId: "kitchen_work_ticket" },
            ],
          },
          {
            weight: 20,
            effects: [
              { type: "add_item", itemId: "hotMeal", amount: 1 },
              { type: "set_flag", flag: "mealSecured" },
              { type: "log", message: "당신은 배식소 일을 마친 뒤 남은 따뜻한 식사 한 그릇을 받아 들었다." },
              { type: "set_scene", sceneId: "kitchen_work_meal" },
            ],
          },
          {
            weight: 15,
            effects: [
              { type: "add_item", itemId: "waterBottle", amount: 1 },
              { type: "log", message: "당신은 물통을 나르는 일을 돕고 아직 뜯지 않은 물병 하나를 챙겼다." },
              { type: "set_scene", sceneId: "kitchen_work_water" },
            ],
          },
        ],
      },
    ],
    tags: ["work", "food", "money", "repeatable"],
    riskHint: "low",
  }),
  interactionFor("kitchen", {
    id: "go_to_kitchen_scrap_heap",
    label: "폐자재 더미로 간다",
    type: "search",
    outcomeHint: "배식줄 옆 구석에 쌓인 폐자재 더미 앞으로 가, 쓸 만한 고철과 천 조각을 직접 뒤진다.",
    effects: [
      { type: "focus_stock_node", nodeId: "kitchen_scrap_heap" },
      { type: "log", message: "당신은 사람들의 시선을 피해 배식줄 옆 폐자재 더미 앞으로 다가선다." },
    ],
    tags: ["craft", "salvage"],
    riskHint: "low",
  }),
  interactionFor("kitchen", {
    id: "go_to_kitchen_ingredient_crate",
    label: "식재료 상자로 간다",
    type: "search",
    outcomeHint: "배식대 뒤쪽 식재료 상자에서 남은 쌀, 채소, 물병을 확인한다.",
    effects: [
      { type: "focus_stock_node", nodeId: "kitchen_ingredient_crate" },
      { type: "log", message: "당신은 배식대 뒤쪽의 낡은 식재료 상자 앞으로 몸을 숙인다." },
    ],
    tags: ["food", "ingredient", "salvage"],
    riskHint: "low",
  }),
  interactionFor("kitchen", {
    id: "deliver_canned_food_to_old_cook",
    label: "노파에게 통조림 세 개를 건넨다",
    type: "talk",
    outcomeHint: "편의점에서 챙긴 통조림 세 개를 노파에게 맡긴다. 노파는 두 개를 배식줄 쪽으로 돌리고, 하나는 당신 몫으로 되돌려 준다.",
    conditions: [
      { type: "quest_state", questId: "first_canned_food", status: "active" },
      { type: "flag_not", flag: "first_canned_food_delivered" },
      { type: "has_item", itemId: "cannedFood", amount: 3 },
    ],
    effects: [
      { type: "remove_item", itemId: "cannedFood", amount: 3 },
      { type: "set_flag", flag: "first_canned_food_delivered" },
      { type: "set_flag", flag: "returned_to_oldCook" },
      {
        type: "log",
        message: "당신은 통조림 세 개를 노파에게 건넸다. 노파는 두 개를 배식줄로 보내고, 하나는 당신 손에 다시 쥐여 주었다.",
      },
      { type: "advance_time", minutes: 10 },
    ],
    nextSceneId: "kitchen_old_cook_canned_food_reward",
    tags: ["quest", "oldCook", "food"],
    riskHint: "low",
  }),
];

export const kitchenLocation = defineLocation({
  id: "kitchen",
  name: "급식소",
  risk: "low",
  mapPosition: { q: 1, r: 0 },
  imagePath: "assets/scenes/kitchen.png",
  summary: "지친 사람들과 눅눅한 공기가 한데 엉켜, 하루를 버티게 해 주는 밥 한 끼와 작은 소문이 오가는 장소다.",
  tags: ["food", "water"],
  traits: ["meal purchase", "ingredients", "rumors", "salvage"],
  obtainableItemIds: ["hotMeal", "waterBottle", "rationTicket", "rawRice", "vegetables", "scrapMetal", "clothScrap", "cordage"],
  residentIds: ["oldCook"],
  neighbors: ["shelter", "subway", "forest"],
  interactionChoices: kitchenChoices,
  links: {
    shelter: { note: "허기를 잠시 달랜 뒤 거처 쪽으로 다시 발걸음을 돌린다." },
    subway: {
      note: "급식소 뒤편 계단을 따라 전기가 끊긴 지하철역 쪽으로 내려간다.",
    },
    forest: {
      note: "급식소 뒤편의 젖은 흙길을 따라 숲 쪽으로 빠져나간다.",
    },
  },
  stockNodes: [
    stockNode({
      id: "kitchen_scrap_heap",
      name: "폐자재 더미",
      summary: "배식줄 옆 구석에 찢긴 앞치마와 굽은 금속 부품, 낡은 조리 도구가 한데 얽혀 있다.",
      items: [
        { itemId: "scrapMetal", initialQuantity: 4 },
        { itemId: "clothScrap", initialQuantity: 4 },
        { itemId: "cordage", initialQuantity: 3 },
      ],
    }),
    stockNode({
      id: "kitchen_ingredient_crate",
      name: "식재료 상자",
      summary: "배식대 뒤쪽에 남겨진 작은 식재료 상자다. 쌀과 시든 채소, 아직 뜯지 않은 물병이 조금 남아 있다.",
      items: [
        { itemId: "rawRice", initialQuantity: 2 },
        { itemId: "vegetables", initialQuantity: 2 },
        { itemId: "waterBottle", initialQuantity: 1 },
      ],
    }),
  ],
});
