/**
 * Quest definitions
 */

import type { QuestDefinition } from "./schemas";

export const questDefinitions: QuestDefinition[] = [
  {
    id: "prepare_rescue_signal",
    title: "구조 신호 준비",
    description: "10일차 구조대가 지나가기 전까지 무전기 배터리, 안테나, 송신기를 모아 임시 거처에서 구조 신호를 완성한다.",
    type: "main",
    objectives: [{ type: "flag", flag: "rescue_signal_ready" }],
    rewards: [],
    prerequisites: [],
    relatedNpcIds: [],
    relatedLocationIds: ["shelter", "hospital", "subway", "checkpoint"],
  },
  {
    id: "first_canned_food",
    title: "첫 식량 확보",
    description: "편의점 잔해의 진열대에서 통조림을 찾아 오늘을 버틸 첫 식량을 확보한다.",
    type: "main",
    objectives: [{ type: "flag", flag: "first_canned_food_secured" }],
    rewards: [],
    prerequisites: [{ type: "flag", flag: "first_canned_food_started" }],
    relatedNpcIds: ["oldCook"],
    relatedLocationIds: ["convenience", "kitchen"],
  },
];
