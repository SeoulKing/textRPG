"use strict";
/**
 * NPC data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.basePeople = void 0;
exports.basePeople = {
    oldCook: {
        id: "oldCook",
        name: "노파 배식 담당",
        role: "급식소 배식 보조",
        personality: ["무뚝뚝함", "눈치가 빠름", "정이 깊음"],
        relationToPlayer: "아직 거리를 두고 있지만, 굶주린 사람을 외면하지는 않는다.",
        inventoryItemIds: ["rationTicket", "waterBottle"],
        locationId: "kitchen",
        summary: "말수는 적지만 줄의 흐름과 사람들의 상태를 누구보다 빨리 읽어 내는 노인이다.",
    },
};
