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
    requiredItems: [
      { itemId: "radioBattery", amount: 1 },
      { itemId: "radioAntenna", amount: 1 },
      { itemId: "radioTransmitter", amount: 1 },
      { itemId: "scrapMetal", amount: 2 },
      { itemId: "clothScrap", amount: 1 },
    ],
    rewards: [],
    prerequisites: [],
    relatedNpcIds: [],
    relatedLocationIds: ["shelter", "hospital", "subway", "checkpoint"],
  },
  {
    id: "first_canned_food",
    title: "노파의 부탁",
    description: "편의점 잔해의 진열대에서 통조림 세 개를 찾아 급식소의 노파에게 가져다준다.",
    type: "main",
    objectives: [{ type: "flag", flag: "first_canned_food_delivered" }],
    requiredItems: [{ itemId: "cannedFood", amount: 3 }],
    rewards: [
      { type: "add_item", itemId: "cannedFood", amount: 1 },
      { type: "money", amount: 3000 },
    ],
    prerequisites: [{ type: "flag", flag: "first_canned_food_started" }],
    relatedNpcIds: ["oldCook"],
    relatedLocationIds: ["convenience", "kitchen"],
  },
];
