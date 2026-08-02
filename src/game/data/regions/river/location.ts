import type { ActionDefinition } from "../../../schemas";
import { defineLocation, interactionFor } from "../../location-helpers";
import { riverResultSceneTags } from "./result-scene-tags";

export const riverChoices: ActionDefinition[] = [
  interactionFor("river", {
    id: "fish_at_river",
    skillUse: { skillId: "fishing" },
    label: "낚시하기",
    type: "search",
    outcomeHint: "강물의 흐름을 읽고 물고기가 지나는 자리에 줄을 드리운다.",
    effects: [
      { type: "advance_time", minutes: 30 },
      {
        type: "random_outcome",
        outcomes: [
          {
            weight: 100,
            result: "failure",
            effects: [
              { type: "log", message: "한동안 입질을 기다렸지만 미끼만 젖은 채 빈손으로 줄을 거두었다." },
              { type: "set_random_scene", tag: riverResultSceneTags.fishingNothing },
            ],
          },
          {
            weight: 75,
            result: "success",
            effects: [
              { type: "add_item", itemId: "riverFish", amount: 1 },
              { type: "log", message: "당신은 거센 입질 끝에 {{item:riverFish}} 한 마리를 낚아 올렸다." },
              { type: "set_random_scene", tag: riverResultSceneTags.fishingCatch },
            ],
          },
          {
            weight: 25,
            result: "success",
            effects: [
              { type: "add_item", itemId: "riverFish", amount: 2 },
              { type: "log", message: "물고기가 모인 여울을 찾아 {{item:riverFish}} 두 마리를 연달아 낚았다." },
              { type: "set_random_scene", tag: riverResultSceneTags.fishingBigCatch },
            ],
          },
        ],
      },
    ],
    tags: ["fishing", "food", "repeatable", "chance"],
    riskHint: "low",
  }),
];

export const riverLocation = defineLocation({
  id: "river",
  name: "강",
  risk: "low",
  mapPosition: { q: -1, r: 2 },
  imagePath: "assets/scenes/riverside.svg",
  summary: "편의점 폐허 아래를 가로지르는 탁한 강이다. 무너진 제방 사이로 물고기 떼가 드물게 모습을 드러낸다.",
  tags: ["river", "fishing", "food"],
  traits: ["fishing", "repeatable food", "waterside"],
  obtainableItemIds: ["riverFish"],
  neighbors: ["convenience", "hospital", "forest"],
  interactionChoices: riverChoices,
  links: {
    convenience: { note: "콘크리트 둑길을 올라 편의점 폐허로 돌아간다." },
    hospital: { note: "무너진 제방 계단을 올라 작은 병원 쪽으로 향한다." },
    forest: { note: "갈대밭 옆 오솔길을 따라 숲 가장자리로 들어간다." },
  },
});
