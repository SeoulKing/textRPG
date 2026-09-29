/**
 * NPC data
 */

export const basePeople = {
  shumi: {
    id: "shumi",
    name: "슈미",
    role: "지하철역 대합실 거주자",
    personality: ["까칠함", "경계심이 강함", "마음이 여림"],
    relationToPlayer: "아직 서로 처음 보는 사이이며, 슈미는 쉽게 거리를 좁히지 않는다.",
    inventoryItemIds: [],
    locationId: "subway",
    summary: "대합실에서 홀로 지내는 열아홉 살 생존자다. 차갑게 선을 긋지만 곤란한 사람을 외면하지 못한다.",
  },
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
} as const;
