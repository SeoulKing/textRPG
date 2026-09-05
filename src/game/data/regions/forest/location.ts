import type { ActionDefinition } from "../../../schemas";
import { defineLocation, interactionFor } from "../../location-helpers";
import { forestResultSceneTags } from "./result-scene-tags";

export const forestChoices: ActionDefinition[] = [
  interactionFor("forest", {
    id: "chop_wood_at_forest",
    skillUse: { skillId: "collection" },
    label: "벌목하기",
    type: "search",
    outcomeHint: "30분을 들여 {{item:woodPlank}} 3개를 얻는다.",
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
    id: "chop_wood_with_crude_axe",
    skillUse: { skillId: "collection" },
    label: "{{item:crudeAxe|으로로}} 벌목한다",
    type: "search",
    outcomeHint: "{{item:woodPlank}} +5 / {{item:crudeAxe}} 내구도 -1 / +30분",
    showOutcomeHint: true,
    conditions: [{ type: "has_item", itemId: "crudeAxe", amount: 1 }],
    effects: [
      { type: "advance_time", minutes: 30 },
      { type: "add_item", itemId: "woodPlank", amount: 5 },
      { type: "damage_tool", itemId: "crudeAxe", amount: 1 },
      { type: "log", message: "당신은 {{item:crudeAxe|으로로}} 마른 가지와 무너진 울타리 목재를 빠르게 쳐 냈다." },
      { type: "set_random_scene", tag: forestResultSceneTags.axeChop },
    ],
    tags: ["wood", "tool", "resource", "repeatable"],
    riskHint: "low",
  }),
  interactionFor("forest", {
    id: "search_forest_resources",
    skillUse: { skillId: "exploration" },
    label: "수색하기",
    type: "search",
    outcomeHint: "30분을 들여 숲을 뒤진다.",
    showOutcomeHint: true,
    effects: [
      { type: "advance_time", minutes: 30 },
      {
        type: "random_outcome",
        outcomes: [
          {
            weight: 50,
            result: "failure",
            effects: [
              { type: "log", message: "당신은 숲을 뒤졌지만 쓸 만한 물건을 찾지 못했다." },
              { type: "set_random_scene", tag: forestResultSceneTags.searchNothing },
            ],
          },
          {
            weight: 10,
            result: "success",
            effects: [
              { type: "add_item", itemId: "cannedFood", amount: 1 },
              { type: "log", message: "당신은 숲에서 {{item:cannedFood}} 하나를 찾아냈다." },
              { type: "set_random_scene", tag: forestResultSceneTags.searchCannedFood },
            ],
          },
          {
            weight: 20,
            result: "success",
            effects: [
              { type: "add_item", itemId: "woodPlank", amount: 1 },
              { type: "log", message: "당신은 숲에서 {{item:woodPlank}} 하나를 챙겼다." },
              { type: "set_random_scene", tag: forestResultSceneTags.searchWood },
            ],
          },
          {
            weight: 10,
            result: "success",
            effects: [
              { type: "add_item", itemId: "scrapMetal", amount: 1 },
              { type: "log", message: "당신은 숲에서 {{item:scrapMetal}} 하나를 주웠다." },
              { type: "set_random_scene", tag: forestResultSceneTags.searchMetal },
            ],
          },
          {
            weight: 10,
            result: "success",
            effects: [
              { type: "add_item", itemId: "clothScrap", amount: 1 },
              { type: "log", message: "당신은 숲에서 {{item:clothScrap}} 하나를 건졌다." },
              { type: "set_random_scene", tag: forestResultSceneTags.searchCloth },
            ],
          },
        ],
      },
    ],
    tags: ["forage", "resource", "repeatable", "chance"],
    riskHint: "low",
  }),
  interactionFor("forest", {
    id: "gather_cordage_at_forest",
    skillUse: { skillId: "collection" },
    label: "덩굴을 꼬아 끈을 만든다",
    type: "search",
    outcomeHint: "{{item:cordage}} +2 / +30분",
    showOutcomeHint: true,
    effects: [
      { type: "advance_time", minutes: 30 },
      { type: "add_item", itemId: "cordage", amount: 2 },
      { type: "log", message: "당신은 질긴 덩굴과 천막에서 떨어진 끈을 꼬아 쓸 만한 {{item:cordage|을를}} 만들었다." },
      { type: "set_random_scene", tag: forestResultSceneTags.cordageGather },
    ],
    tags: ["cordage", "resource", "repeatable"],
    riskHint: "low",
  }),
  interactionFor("forest", {
    id: "cut_vines_with_utility_knife",
    skillUse: { skillId: "collection" },
    label: "{{item:utilityKnife|으로로}} 덩굴을 잘라낸다",
    type: "search",
    outcomeHint: "{{item:cordage}} +4 / {{item:utilityKnife}} 내구도 -1 / +30분",
    showOutcomeHint: true,
    conditions: [{ type: "has_item", itemId: "utilityKnife", amount: 1 }],
    effects: [
      { type: "advance_time", minutes: 30 },
      { type: "add_item", itemId: "cordage", amount: 4 },
      { type: "damage_tool", itemId: "utilityKnife", amount: 1 },
      { type: "log", message: "당신은 {{item:utilityKnife|으로로}} 질긴 덩굴을 잘라 내고, 길이가 맞는 것끼리 묶어 끈으로 정리했다." },
      { type: "set_random_scene", tag: forestResultSceneTags.cordageKnife },
    ],
    tags: ["cordage", "tool", "resource", "repeatable"],
    riskHint: "low",
  }),
  interactionFor("forest", {
    id: "forage_forest_food",
    skillUse: { skillId: "exploration" },
    label: "먹을 것을 뒤진다",
    type: "search",
    outcomeHint: "{{item:wildGreens}} +1 / {{item:staleBread}} +1 / {{item:clothScrap}} +1 / +30분",
    showOutcomeHint: true,
    effects: [
      { type: "advance_time", minutes: 30 },
      {
        type: "random_outcome",
        outcomes: [
          {
            weight: 55,
            result: "failure",
            effects: [
              { type: "log", message: "당신은 먹을 만한 것을 오래 찾았지만 빈손으로 돌아왔다." },
              { type: "set_random_scene", tag: forestResultSceneTags.forageNothing },
            ],
          },
          {
            weight: 25,
            result: "success",
            effects: [
              { type: "add_item", itemId: "wildGreens", amount: 1 },
              { type: "log", message: "당신은 숲 가장자리에서 먹을 수 있는 {{item:wildGreens}} 한 줌을 뜯었다." },
              { type: "set_random_scene", tag: forestResultSceneTags.forageGreens },
            ],
          },
          {
            weight: 10,
            result: "success",
            effects: [
              { type: "add_item", itemId: "staleBread", amount: 1 },
              { type: "log", message: "당신은 젖은 봉지 안에서 {{item:staleBread}} 하나를 찾아냈다." },
              { type: "set_random_scene", tag: forestResultSceneTags.forageBread },
            ],
          },
          {
            weight: 10,
            result: "success",
            effects: [
              { type: "add_item", itemId: "clothScrap", amount: 1 },
              { type: "log", message: "당신은 먹을 것은 찾지 못했지만 질긴 {{item:clothScrap}} 하나를 챙겼다." },
              { type: "set_random_scene", tag: forestResultSceneTags.searchCloth },
            ],
          },
        ],
      },
    ],
    tags: ["forage", "food", "repeatable", "chance"],
    riskHint: "low",
  }),
  interactionFor("forest", {
    id: "search_bushes_with_utility_knife",
    skillUse: { skillId: "exploration" },
    label: "{{item:utilityKnife|으로로}} 덤불을 뒤진다",
    type: "search",
    outcomeHint: "{{item:wildGreens}} +1 / {{item:staleBread}} +1 / {{item:cannedFood}} +1 / {{item:clothScrap}} +1 / {{item:utilityKnife}} 내구도 -1 / +30분",
    showOutcomeHint: true,
    conditions: [{ type: "has_item", itemId: "utilityKnife", amount: 1 }],
    effects: [
      { type: "advance_time", minutes: 30 },
      {
        type: "random_outcome",
        outcomes: [
          {
            weight: 35,
            result: "failure",
            effects: [
              { type: "log", message: "당신은 칼로 덤불을 헤쳤지만 먹을 만한 것은 찾지 못했다." },
              { type: "set_random_scene", tag: forestResultSceneTags.forageNothing },
            ],
          },
          {
            weight: 35,
            result: "success",
            effects: [
              { type: "add_item", itemId: "wildGreens", amount: 1 },
              { type: "log", message: "당신은 칼로 질긴 줄기를 잘라 {{item:wildGreens}} 한 줌을 챙겼다." },
              { type: "set_random_scene", tag: forestResultSceneTags.forageGreens },
            ],
          },
          {
            weight: 15,
            result: "success",
            effects: [
              { type: "add_item", itemId: "staleBread", amount: 1 },
              { type: "log", message: "덤불 안쪽의 낡은 봉지에서 {{item:staleBread}} 하나를 찾아냈다." },
              { type: "set_random_scene", tag: forestResultSceneTags.forageBread },
            ],
          },
          {
            weight: 10,
            result: "success",
            effects: [
              { type: "add_item", itemId: "cannedFood", amount: 1 },
              { type: "log", message: "당신은 덤불 속에 숨은 {{item:cannedFood}} 하나를 찾아냈다." },
              { type: "set_random_scene", tag: forestResultSceneTags.searchCannedFood },
            ],
          },
          {
            weight: 5,
            result: "success",
            effects: [
              { type: "add_item", itemId: "clothScrap", amount: 1 },
              { type: "log", message: "당신은 덤불에 걸린 질긴 {{item:clothScrap|을를}} 칼로 잘라 냈다." },
              { type: "set_random_scene", tag: forestResultSceneTags.searchCloth },
            ],
          },
        ],
      },
      { type: "damage_tool", itemId: "utilityKnife", amount: 1 },
    ],
    tags: ["forage", "food", "tool", "repeatable", "chance"],
    riskHint: "low",
  }),
];

export const forestLocation = defineLocation({
  id: "forest",
  name: "숲",
  risk: "low",
  mapPosition: { q: 0, r: 1 },
  imagePath: "assets/scenes/forest-pencil-charcoal.png",
  summary: "임시 거처 아래로 이어지는 작은 숲. 무너진 울타리와 젖은 낙엽 사이에 아직 쓸 만한 자재가 남아 있다.",
  tags: ["resource", "forest", "forage"],
  traits: ["woodcutting", "foraging", "repeatable resources"],
  obtainableItemIds: ["woodPlank", "cannedFood", "scrapMetal", "clothScrap", "cordage", "wildGreens", "staleBread"],
  neighbors: ["shelter", "convenience", "kitchen", "river"],
  interactionChoices: forestChoices,
  links: {
    shelter: { note: "언덕길을 거슬러 임시 거처의 천막 불빛 쪽으로 돌아간다." },
    convenience: { note: "나무 사이로 난 비탈길을 지나 편의점 폐허 쪽으로 내려간다." },
    kitchen: { note: "젖은 흙길을 따라 배식줄 소리가 들리는 급식소 쪽으로 빠져나간다." },
    river: { note: "나무 사이의 내리막을 따라 축축한 강둑으로 내려간다." },
  },
});
