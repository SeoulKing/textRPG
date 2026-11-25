import { defineLocation } from "./data/location-helpers";
import type { ContentRegistry, LinkDefinition, SceneDefinition } from "./schemas";

export const MEADOW_LOCATION = "arcana_meadow_field";
export const MEADOW_BOUNDS = { x: 0, y: 0, w: 384, h: 320 };
export const MEADOW_ARRIVAL = { x: 192, y: 272 };
export const MEADOW_ENEMY_HOME = { x: 192, y: 160 };

const plazaToMeadow: LinkDefinition = { note: "도시 남쪽 길을 따라 뿔소 초원으로 향한다." };
const meadow = defineLocation({
  id: MEADOW_LOCATION,
  name: "뿔소 초원",
  risk: "medium",
  mapPosition: { q: 5, r: 5 },
  discoveryConditions: [{ type: "flag", flag: "in_magic_world" }],
  summary: "아르카나 남쪽에 펼쳐진 풀이 낮은 초원. 짧은 적갈색 뿔과 진흙이 묻은 넓적한 코를 가진 진흙코 뿔소가 서식한다.",
  tags: ["magic-city", "hunting-ground", "realm:magic"],
  traits: ["grassland", "wild ox"],
  obtainableItemIds: ["rawMeat"],
  neighbors: ["arcana_plaza"],
  links: { arcana_plaza: { note: "초원 가장자리의 좁은 길을 따라 광장으로 돌아간다." } },
});
const meadowIntro: SceneDefinition = {
  id: "arcana_meadow_field_intro",
  locationId: MEADOW_LOCATION,
  title: meadow.name,
  paragraphs: ["좁은 흙길이 끝나자 바람에 눕는 풀이 시야 가득 펼쳐진다. 풀 사이로 깊게 팬 발굽 자국이 초원 안쪽까지 이어진다."],
  choiceIds: [],
  conditions: [{ type: "location", locationId: MEADOW_LOCATION }],
};

/** Install the world's fixed meadow and its travel link in both new and versioned saves. */
export function withArcanaMeadow(registry: ContentRegistry) {
  const plaza = registry.locations.arcana_plaza;
  if (!plaza) return;
  registry.locations[meadow.id] = structuredClone(meadow);
  registry.scenes[meadowIntro.id] = structuredClone(meadowIntro);
  registry.locations[plaza.id] = {
    ...plaza,
    neighbors: [...new Set([...plaza.neighbors, meadow.id])],
    links: { ...plaza.links, [meadow.id]: structuredClone(plazaToMeadow) },
  };
}
