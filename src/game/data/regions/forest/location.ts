import type { ActionDefinition, LocationDefinition } from "../../../schemas";
import { interactionFor } from "../../location-interaction-helpers";
import { forestResultSceneTags } from "./result-scene-tags";

export const forestChoices: ActionDefinition[] = [
  interactionFor("forest", {
    id: "chop_wood_at_forest",
    label: "벌목하기",
    type: "search",
    outcomeHint: "30분을 들여 목재 판자 3개를 얻는다.",
    showOutcomeHint: true,
    effects: [
      { type: "advance_time", minutes: 30 },
      { type: "add_item", itemId: "woodPlank", amount: 3 },
      { type: "log", message: "당신은 숲에서 목재로 쓸 만한 판자들을 챙겼다." },
      { type: "set_random_scene", tag: forestResultSceneTags.chop },
    ],
    tags: ["wood", "resource", "repeatable"],
    riskHint: "low",
  }),
  interactionFor("forest", {
    id: "search_forest_resources",
    label: "수색하기",
    type: "search",
    outcomeHint: "30분을 들여 숲을 뒤진다. 허탕 30%, 캔 음식 10%, 목재/고철/천 조각 각 20%.",
    showOutcomeHint: true,
    effects: [
      { type: "advance_time", minutes: 30 },
      {
        type: "random_outcome",
        outcomes: [
          {
            weight: 30,
            effects: [
              { type: "log", message: "당신은 숲을 뒤졌지만 쓸 만한 물건을 찾지 못했다." },
              { type: "set_random_scene", tag: forestResultSceneTags.searchNothing },
            ],
          },
          {
            weight: 10,
            effects: [
              { type: "add_item", itemId: "cannedFood", amount: 1 },
              { type: "log", message: "당신은 숲에서 캔 음식 하나를 찾아냈다." },
              { type: "set_random_scene", tag: forestResultSceneTags.searchCannedFood },
            ],
          },
          {
            weight: 20,
            effects: [
              { type: "add_item", itemId: "woodPlank", amount: 1 },
              { type: "log", message: "당신은 숲에서 목재 판자 하나를 챙겼다." },
              { type: "set_random_scene", tag: forestResultSceneTags.searchWood },
            ],
          },
          {
            weight: 20,
            effects: [
              { type: "add_item", itemId: "scrapMetal", amount: 1 },
              { type: "log", message: "당신은 숲에서 고철 조각 하나를 주웠다." },
              { type: "set_random_scene", tag: forestResultSceneTags.searchMetal },
            ],
          },
          {
            weight: 20,
            effects: [
              { type: "add_item", itemId: "clothScrap", amount: 1 },
              { type: "log", message: "당신은 숲에서 천 조각 하나를 건졌다." },
              { type: "set_random_scene", tag: forestResultSceneTags.searchCloth },
            ],
          },
        ],
      },
    ],
    tags: ["forage", "resource", "repeatable", "chance"],
    riskHint: "low",
  }),
];

export const forestLocation: LocationDefinition = {
  id: "forest",
  name: "숲",
  risk: "low",
  mapPosition: { q: 0, r: 1 },
  imagePath: "assets/scenes/forest.svg",
  summary: "임시 거처 아래로 이어지는 작은 숲. 무너진 울타리와 젖은 낙엽 사이에 아직 쓸 만한 자재가 남아 있다.",
  tags: ["resource", "forest", "forage"],
  traits: ["woodcutting", "foraging", "repeatable resources"],
  obtainableItemIds: ["woodPlank", "cannedFood", "scrapMetal", "clothScrap"],
  residentIds: [],
  neighbors: ["shelter", "convenience", "kitchen"],
  interactionChoices: forestChoices,
  eventIds: [],
  links: {
    shelter: { note: "언덕길을 거슬러 임시 거처의 천막 불빛 쪽으로 돌아간다." },
    convenience: { note: "나무 사이로 난 비탈길을 지나 편의점 폐허 쪽으로 내려간다." },
    kitchen: { note: "젖은 흙길을 따라 배식줄 소리가 들리는 급식소 쪽으로 빠져나간다." },
  },
  stockNodes: [],
};
