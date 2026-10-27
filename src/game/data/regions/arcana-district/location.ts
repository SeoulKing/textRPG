import { defineLocation, interactionFor } from "../../location-helpers";

export const arcanaReturnPortalAction = interactionFor("arcana_return_portal", {
    id: "return_through_arcana_portal",
    label: "현실 세계로 돌아간다",
    type: "explore",
    outcomeHint: "귀환 포탈을 타고 현실의 들판으로 돌아간다.",
    effects: [
      { type: "clear_flag", flag: "in_magic_world" },
      { type: "clear_flag", flag: "arcana_workbench_open" },
      { type: "travel", locationId: "magic_city_entrance" },
      { type: "log", message: "당신은 은빛 귀환문을 통과해 다시 풀잎이 흔들리는 들판으로 돌아왔다." },
      { type: "advance_time", minutes: 5 },
    ],
    nextSceneId: "magic_city_entrance_repeat_intro",
    tags: ["portal", "realm-transition"],
    riskHint: "low",
  });

export const arcanaDistrictLocations = [
  defineLocation({
    id: "arcana_shop", name: "아르카나 상점", risk: "low",
    mapPosition: { q: -1, r: 0 }, imagePath: "assets/scenes/arcana-shop.png",
    summary: "물약과 작은 마도구가 진열된 광장 서쪽의 상점.",
    tags: ["magic-city", "shop", "realm:magic"], traits: ["potions", "magic tools"],
    obtainableItemIds: [], neighbors: ["arcana_plaza", "arcana_inn"],
    links: {
      arcana_plaza: { note: "상점 앞길을 따라 중앙 분수가 있는 광장으로 돌아간다." },
      arcana_inn: { note: "상점 옆길을 따라 바로 이웃한 여관으로 향한다." },
    },
  }),
  defineLocation({
    id: "arcana_inn", name: "아르카나 여관", risk: "low",
    mapPosition: { q: -1, r: 1 }, imagePath: "assets/scenes/arcana-inn.png",
    summary: "푸른 지붕과 따뜻한 창문 불빛이 눈에 띄는 광장 남서쪽 여관.",
    tags: ["magic-city", "inn", "realm:magic"], traits: ["lodging", "quiet rooms"],
    obtainableItemIds: [], neighbors: ["arcana_plaza", "arcana_shop"],
    links: {
      arcana_plaza: { note: "여관 문을 나와 광장의 분수로 향한다." },
      arcana_shop: { note: "여관 옆길을 따라 바로 이웃한 상점으로 향한다." },
    },
  }),
  defineLocation({
    id: "arcana_restaurant", name: "아르카나 식당", risk: "low",
    mapPosition: { q: 1, r: 0 }, imagePath: "assets/scenes/arcana-restaurant.png",
    summary: "줄무늬 차양과 야외 식탁이 놓인 광장 동쪽의 식당. 북쪽 돌길은 아카데미로 이어진다.",
    tags: ["magic-city", "restaurant", "realm:magic"], traits: ["terrace", "warm food"],
    obtainableItemIds: [], neighbors: ["arcana_plaza", "arcana_academy"],
    links: {
      arcana_plaza: { note: "식당 테라스를 지나 광장으로 돌아간다." },
      arcana_academy: { note: "식당 북쪽의 돌길을 따라 아카데미로 올라간다." },
    },
  }),
  defineLocation({
    id: "arcana_return_portal", name: "귀환 포탈", risk: "low",
    mapPosition: { q: 0, r: -1 }, imagePath: "assets/scenes/arcana-return-portal.png",
    summary: "현실의 들판으로 연결되는 푸른 포탈. 광장 북쪽에 자리한다.",
    tags: ["magic-city", "portal", "realm:magic"], traits: ["realm gateway", "return portal"],
    obtainableItemIds: [], neighbors: ["arcana_plaza"], interactionChoices: [arcanaReturnPortalAction],
    links: { arcana_plaza: { note: "포탈을 뒤로하고 중앙 광장으로 돌아간다." } },
  }),
  defineLocation({
    id: "arcana_city_gate", name: "도시 남문", risk: "low",
    mapPosition: { q: 0, r: 1 }, imagePath: "assets/scenes/arcana-city-gate.png",
    summary: "도심의 돌길과 바깥 별빛 초원을 잇는 남문. 평원로 이어지는 길이 열린다.",
    tags: ["magic-city", "city-gate", "realm:magic"], traits: ["city exit", "hunting route"],
    obtainableItemIds: [], neighbors: ["arcana_plaza", "arcana_hunting_ground"],
    links: {
      arcana_plaza: { note: "도시 안쪽의 분수 광장으로 돌아간다." },
      arcana_hunting_ground: { note: "남문을 나서 별빛 초원의 평원로 향한다." },
    },
  }),
];
