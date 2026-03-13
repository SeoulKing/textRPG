"use strict";
/**
 * Quest definitions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.questDefinitions = void 0;
exports.questDefinitions = [
    {
        id: "meal",
        title: "오늘의 끼니 마련",
        description: "오늘 하루를 버티기 위해 먹을거리를 확보하거나 따뜻한 식사를 구한다.",
        type: "side",
        objectives: [{ type: "daily_flag", flag: "mealSecured" }],
        rewards: [],
        prerequisites: [],
        relatedNpcIds: ["oldCook"],
        relatedLocationIds: ["shelter", "kitchen", "convenience"],
    },
    {
        id: "water",
        title: "마실 물 확보",
        description: "오늘 마실 물을 마련해 허기와 함께 갈증도 견딜 수 있게 만든다.",
        type: "side",
        objectives: [{ type: "daily_flag", flag: "waterSecured" }],
        rewards: [],
        prerequisites: [],
        relatedNpcIds: ["oldCook"],
        relatedLocationIds: ["shelter", "kitchen", "convenience"],
    },
];
