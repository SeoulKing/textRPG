import { defineItem } from "./item-helpers";

const equipmentItem = (id: string, name: string, description: string) =>
  defineItem({ id, name, description, kind: "tool", rarity: "common", price: 0, tags: ["장비"] });

export const arcanaEquipmentItems = {
  travelShirt: equipmentItem("travelShirt", "기본 셔츠", "크림색 셔츠에 가죽 조끼를 받쳐 입은 여행복 상의."),
  travelTrousers: equipmentItem("travelTrousers", "갈색 여행복 하의", "길을 걸을 때 입는 갈색 바지."),
  travelBoots: equipmentItem("travelBoots", "갈색 여행 부츠", "털 안감과 가죽 끈으로 발목을 감싸는 부츠."),
  apprenticeShirt: equipmentItem("apprenticeShirt", "견습생 상의", "하늘빛 천으로 만든 견습생의 상의."),
  silverPendant: equipmentItem("silverPendant", "은빛 펜던트", "타원형 은 장식이 달린 목걸이."),
  moonlightNecklace: equipmentItem("moonlightNecklace", "달빛 목걸이", "푸른 물방울 보석이 달린 목걸이."),
  bronzeRing: equipmentItem("bronzeRing", "청동 반지", "광택을 낸 소박한 청동 반지."),
  silverRing: equipmentItem("silverRing", "은빛 반지", "가느다란 은으로 만든 반지."),
  silverEarrings: equipmentItem("silverEarrings", "은빛 귀걸이", "한 쌍의 은빛 물방울 귀걸이."),
};
