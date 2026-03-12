/**
 * Quest 정의 - 파밍·생존 중심 지속 가능한 루프
 */

import type { QuestDefinition } from "./schemas";

export const questDefinitions: QuestDefinition[] = [
  {
    id: "meal",
    title: "오늘 끼니 마련",
    description: "오늘 하루를 버틸 먹을거리를 파밍하거나 요리해서 챙긴다.",
    type: "side",
    objectives: [{ type: "daily_flag", flag: "mealSecured" }],
    rewards: [],
    prerequisites: [],
    relatedNpcIds: ["oldCook"],
    relatedLocationIds: ["shelter", "kitchen", "convenience", "mart"],
  },
  {
    id: "water",
    title: "물 확보",
    description: "마실 물이나 물통을 파밍해서 이동 여유를 만든다.",
    type: "side",
    objectives: [{ type: "daily_flag", flag: "waterSecured" }],
    rewards: [],
    prerequisites: [],
    relatedNpcIds: [],
    relatedLocationIds: ["kitchen", "convenience", "riverside", "mart"],
  },
  {
    id: "stockpile",
    title: "물자 비축",
    description: "편의점, 마트, 하천변에서 식량과 재료를 수집해 캠프에 쌓아둔다.",
    type: "side",
    objectives: [{ type: "flag", flag: "stockpileStarted" }],
    rewards: [],
    prerequisites: [],
    relatedNpcIds: [],
    relatedLocationIds: ["convenience", "mart", "riverside", "shelter"],
  },
];
