import type { ActionDefinition } from "../../../schemas";
import { defineLocation, interactionFor } from "../../location-helpers";
import { slimeMonster } from "./monsters";

export const arcanaHuntingGroundChoices: ActionDefinition[] = [
  interactionFor("arcana_hunting_ground", {
    id: "track_slime_at_arcana_hunting_ground",
    label: "슬라임의 흔적을 추적한다",
    type: "search",
    outcomeHint: "젤 형태의 흔적과 눌린 별빛풀을 따라 슬라임을 찾아간다. +10분",
    loading: { durationMs: 900 },
    conditions: [{ type: "flag_not", flag: "arcana_slime_encounter_active" }],
    effects: [
      { type: "set_flag", flag: "arcana_slime_encounter_active" },
      { type: "advance_time", minutes: 10 },
      { type: "log", message: "당신은 풀잎에 남은 투명한 점액 자국을 따라가다 별빛 웅덩이 앞에서 슬라임과 마주쳤다." },
    ],
    nextSceneId: "arcana_hunting_ground_slime_encounter",
    tags: ["monster-encounter", "monster:arcana_slime", "hunting"],
    riskHint: "medium",
  }),
];

export const arcanaHuntingGroundLocation = defineLocation({
  id: "arcana_hunting_ground",
  name: "도시 앞 평원",
  risk: "medium",
  mapPosition: { q: 0, r: 2 },
  imagePath: "assets/scenes/arcana-front-plains.png",
  summary: "아르카나 도시 남문 밖으로 펼쳐진 별빛 평원. 마력이 뭉친 야생 몬스터가 서식한다.",
  tags: ["magic-city", "fantasy", "hunting-ground", "realm:magic"],
  traits: ["monster encounters", "starlight grassland", "beginner hunting"],
  obtainableItemIds: [],
  neighbors: ["arcana_city_gate"],
  interactionChoices: arcanaHuntingGroundChoices,
  links: {
    arcana_city_gate: { note: "별빛 초원의 길을 따라 도시 남문으로 돌아간다." },
  },
  monsters: [slimeMonster],
});
