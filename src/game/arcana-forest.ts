import { defineLocation } from "./data/location-helpers";
import type { ContentRegistry, SceneDefinition } from "./schemas";

export const FOREST_LOCATION = "arcana_forest";
export const WOODCUTTING_AXE = "woodcutting_axe";

const forest = defineLocation({
  id: FOREST_LOCATION,
  name: "연못가 숲",
  risk: "low",
  mapPosition: { q: 2, r: 5 },
  discoveryConditions: [{ type: "flag", flag: "in_magic_world" }],
  summary: "광장 연못 서쪽의 참나무 숲. 입구의 등불에서 흙길을 따라가면 벌목지가 나온다.",
  tags: ["magic-city", "forest", "realm:magic"],
  traits: ["woodland"],
  obtainableItemIds: ["wood"],
  neighbors: ["arcana_plaza"],
  links: { arcana_plaza: { note: "연못을 따라 광장으로 돌아간다." } },
});
const forestIntro: SceneDefinition = {
  id: "arcana_forest_intro",
  locationId: FOREST_LOCATION,
  title: forest.name,
  paragraphs: ["숲 입구의 등불을 지나자 흙길이 참나무 사이로 굽는다. 길 끝에 서 있는 나무 아래로 굵은 뿌리가 드러나 있다."],
  choiceIds: [],
  conditions: [{ type: "location", locationId: FOREST_LOCATION }],
};

export function withArcanaForest(registry: ContentRegistry) {
  const plaza = registry.locations.arcana_plaza;
  if (!plaza) return;
  registry.locations[forest.id] = structuredClone(forest);
  registry.scenes[forestIntro.id] = structuredClone(forestIntro);
  registry.locations[plaza.id] = {
    ...plaza,
    neighbors: [...new Set([...plaza.neighbors, forest.id])],
    links: { ...plaza.links, [forest.id]: { note: "광장 연못 왼쪽의 숲길로 들어간다." } },
  };
}
