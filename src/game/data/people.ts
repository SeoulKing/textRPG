/**
 * 인물(NPC) 기본 데이터
 */

export const basePeople = {
  oldCook: {
    id: "oldCook",
    name: "노파 배식 담당",
    role: "배식소 운영 보조",
    personality: ["무뚝뚝함", "눈치가 빠름", "정이 깊음"],
    relationToPlayer: "아직 경계하지만 굶주린 사람은 외면하지 않는다.",
    inventoryItemIds: ["rationTicket", "waterBottle"],
    locationId: "kitchen",
    summary: "말수는 적지만 배식을 핑계로 사람 상태를 꼼꼼히 살핀다.",
  },
  alleyBroker: {
    id: "alleyBroker",
    name: "골목 흥정꾼",
    role: "잡화 교환상",
    personality: ["약삭빠름", "실리적", "정보에 민감함"],
    relationToPlayer: "값을 잘 맞추면 소문과 물건을 흘려줄 수 있다.",
    inventoryItemIds: ["scrapBundle", "cannedFood"],
    locationId: "alley",
    summary: "골목 소문과 물건을 한 손에 쥐고 흔드는 사람이다.",
  },
  subwayWatcher: {
    id: "subwayWatcher",
    name: "역사 감시자",
    role: "지하 통로 파수꾼",
    personality: ["예민함", "과묵함", "집요함"],
    relationToPlayer: "이상한 기척을 함께 본 뒤에야 조금 말을 섞는다.",
    inventoryItemIds: ["painRelief"],
    locationId: "subway",
    summary: "정전된 역사 구석에서 소리와 그림자를 오래 듣고 있는 생존자다.",
  },
  riversideTrader: {
    id: "riversideTrader",
    name: "하천변 거래상",
    role: "물자 중개인",
    personality: ["느긋함", "의심 많음", "협상적"],
    relationToPlayer: "당장 신뢰하진 않지만 쓸 만한 물건이 있으면 거래한다.",
    inventoryItemIds: ["waterBottle", "scrapBundle"],
    locationId: "riverside",
    summary: "떠내려온 물건과 사람 사이에서 늘 교환 가치를 계산한다.",
  },
} as const;
