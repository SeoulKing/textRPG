/**
 * Quest definitions
 */

import type { QuestDefinition } from "./schemas";

export const questDefinitions: QuestDefinition[] = [
  {
    id: "prepare_rescue_signal",
    title: "구조 신호 준비",
    description: "10일차 아침 구조대가 마지막 수색 비행으로 서울 상공을 지나가기 전까지, 무전기 부품과 고정 재료를 모아 임시 거처에서 구조 신호를 완성한다.",
    type: "main",
    guidance: {
      gathering: "병원·지하철역·검문소에서 무전기 장비의 흔적을 찾아본다. 이미 살핀 곳의 남은 부품은 아래에서 확인할 수 있다.",
      ready: "조립 재료가 모였다. 임시 거처의 제작 메뉴에서 구조 신호 장비를 조립한다. 조립 뒤에도 10일차 06시까지 살아 있어야 한다.",
      completion: { kind: "choice", id: "assemble_rescue_radio", locationId: "shelter" },
    },
    objectives: [{ type: "flag", flag: "rescue_signal_ready" }],
    requiredItems: [
      { itemId: "radioBattery", amount: 1 },
      { itemId: "radioAntenna", amount: 1 },
      { itemId: "radioTransmitter", amount: 1 },
      { itemId: "scrapMetal", amount: 2 },
      { itemId: "clothScrap", amount: 1 },
      { itemId: "cordage", amount: 1 },
    ],
    rewards: [],
    prerequisites: [{ type: "flag", flag: "rescue_goal_accepted" }],
    relatedNpcIds: [],
    relatedLocationIds: ["shelter", "hospital", "subway", "checkpoint"],
  },
  {
    id: "first_canned_food",
    title: "노파의 부탁",
    description: "편의점 잔해의 진열대에서 통조림 세 개를 찾아 급식소의 노파에게 가져다준다.",
    type: "main",
    guidance: {
      gathering: "편의점 폐허의 진열대를 살핀다. 통조림은 노파에게 가져갈 몫이니 필요한 수량을 챙겨 둔다.",
      ready: "가져갈 통조림이 모였다. 이동 메뉴로 급식소에 가서 노파에게 건넨다. 물건을 모으기만 해서는 전달이 끝나지 않는다.",
      completion: { kind: "action", id: "deliver_canned_food_to_old_cook", locationId: "kitchen" },
    },
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
