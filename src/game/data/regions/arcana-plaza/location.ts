import type { ActionDefinition } from "../../../schemas";
import { defineLocation, interactionFor } from "../../location-helpers";

export const arcanaPlazaChoices: ActionDefinition[] = [
  interactionFor("arcana_plaza", {
    id: "open_arcana_workbench",
    label: "비전 작업대를 사용한다",
    type: "use",
    outcomeHint: "마법도시에서 얻은 재료로 포션과 마도구를 제작한다.",
    effects: [
      { type: "set_flag", flag: "arcana_workbench_open" },
      { type: "log", message: "당신은 푸른 촛불이 켜진 비전 작업대 위에 마법 재료를 펼쳐 놓는다." },
    ],
    nextSceneId: "arcana_workbench_menu",
    tags: ["magic-crafting", "recipe", "menu"],
    riskHint: "low",
  }),
  interactionFor("arcana_plaza", {
    id: "return_through_arcana_portal",
    label: "현실 세계로 돌아간다",
    type: "explore",
    outcomeHint: "광장 중앙의 귀환 포탈을 타고 편의점 옥상으로 돌아간다.",
    effects: [
      { type: "clear_flag", flag: "in_magic_world" },
      { type: "clear_flag", flag: "arcana_workbench_open" },
      { type: "travel", locationId: "magic_city_entrance" },
      { type: "log", message: "당신은 은빛 귀환문을 통과해 다시 편의점 옥상의 차가운 공기 속으로 돌아왔다." },
      { type: "advance_time", minutes: 5 },
    ],
    nextSceneId: "magic_city_entrance_repeat_intro",
    tags: ["portal", "realm-transition"],
    riskHint: "low",
  }),
];

export const arcanaPlazaLocation = defineLocation({
  id: "arcana_plaza",
  name: "아르카나 광장",
  risk: "low",
  mapPosition: { q: 0, r: 0 },
  imagePath: "assets/scenes/arcana-plaza.svg",
  summary: "별빛 아래 떠 있는 마법도시의 첫 광장. 부유 룬과 연금 재료, 비전 작업대가 새로운 모험의 시작을 기다린다.",
  tags: ["magic-city", "fantasy", "expansion", "realm:magic"],
  traits: ["alchemy", "rune craft", "mana economy", "portal hub"],
  obtainableItemIds: ["manaShard", "moonHerb", "arcaneDust", "manaPotion", "runeCompass"],
  neighbors: ["arcana_hunting_ground"],
  interactionChoices: arcanaPlazaChoices,
  links: {
    arcana_hunting_ground: {
      note: "광장 아래로 이어지는 은빛 계단을 내려가 별빛 초원의 사냥터로 향한다.",
    },
  },
});
