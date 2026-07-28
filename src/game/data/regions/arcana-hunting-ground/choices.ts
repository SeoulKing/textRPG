import type { ChoiceDefinition } from "../../../schemas";
import { sceneChoice } from "../../scene-choice-helpers";

export const arcanaHuntingGroundChoiceDefinitions: ChoiceDefinition[] = [
  sceneChoice({
    id: "retreat_from_arcana_slime",
    label: "슬라임과 거리를 두고 사냥터 입구로 물러난다",
    outcomeHint: "슬라임의 움직임을 기억해 두고 안전한 길로 돌아간다.",
    loading: { durationMs: 500 },
    conditions: [{ type: "flag", flag: "arcana_slime_encounter_active" }],
    effects: [
      { type: "clear_flag", flag: "arcana_slime_encounter_active" },
      { type: "log", message: "당신은 슬라임의 느린 도약을 피해 별빛 초원의 입구까지 물러났다." },
    ],
    nextSceneId: "arcana_hunting_ground_repeat_intro",
    riskHint: "low",
  }),
];
