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
];

export const arcanaPlazaLocation = defineLocation({
  id: "arcana_plaza",
  name: "아르카나 광장",
  risk: "low",
  mapPosition: { q: 0, r: 0 },
  imagePath: "assets/scenes/arcana-plaza.png",
  summary: "중앙 분수에서 상점·식당·여관·아카데미·포탈과 남문으로 길이 이어지는 하나의 도심 구역.",
  tags: ["magic-city", "fantasy", "expansion", "realm:magic"],
  traits: ["alchemy", "rune craft", "mana economy", "portal hub"],
  obtainableItemIds: ["manaShard", "moonHerb", "arcaneDust", "manaPotion", "runeCompass"],
  neighbors: ["arcana_city_gate", "arcana_shop", "arcana_inn", "arcana_restaurant", "arcana_return_portal", "arcana_academy"],
  interactionChoices: arcanaPlazaChoices,
  links: {
    arcana_shop: { note: "광장 서쪽의 상점으로 향한다." },
    arcana_inn: { note: "광장 남서쪽의 여관으로 향한다." },
    arcana_restaurant: { note: "광장 동쪽의 식당으로 향한다." },
    arcana_academy: { note: "광장 북동쪽, 식당 위편의 아카데미로 향한다." },
    arcana_return_portal: { note: "광장 북쪽의 귀환 포탈로 향한다." },
    arcana_city_gate: {
      note: "도심의 돌길을 따라 평원로 이어지는 도시 남문으로 향한다.",
    },
  },
});
