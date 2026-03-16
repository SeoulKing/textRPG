/**
 * Quest definitions
 */

import type { QuestDefinition } from "./schemas";

export const questDefinitions: QuestDefinition[] = [
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
