import { defineLocation, stockNode } from "../../location-helpers";

export const convenienceLocation = defineLocation({
  id: "convenience",
  name: "편의점 폐허",
  risk: "low",
  mapPosition: { q: -1, r: 1 },
  imagePath: "assets/scenes/convenience.png",
  summary: "반쯤 무너진 가게 안에, 허기와 급박한 생활의 흔적이 아직 어지럽게 남아 있다.",
  tags: ["supplies", "early scavenging"],
  traits: ["food", "water", "cash", "salvage"],
  obtainableItemIds: ["emergencySnack", "cannedFood", "rawRice", "vegetables", "waterBottle", "woodPlank", "scrapMetal", "clothScrap", "cordage", "staleBread"],
  neighbors: ["shelter", "hospital", "forest", "river", "magic_city_entrance"],
  links: {
    shelter: { note: "무심한 발걸음처럼 가장한 채 거처 쪽으로 되돌아간다." },
    hospital: {
      note: "편의점 뒤편 골목을 지나 약품 냄새가 희미하게 남은 병원 쪽으로 간다.",
    },
    forest: {
      note: "편의점 뒤편의 낮은 비탈을 타고 숲 가장자리로 올라간다.",
    },
    river: {
      note: "편의점 아래로 난 콘크리트 둑길을 따라 물소리가 들리는 강으로 내려간다.",
    },
    magic_city_entrance: {
      note: "가게 뒤편의 녹슨 비상계단을 올라 푸른 빛이 새어 나오는 옥상으로 향한다.",
    },
  },
  stockNodes: [
    stockNode({
      id: "convenience_shelf",
      name: "진열대",
      summary: "무너진 선반 안쪽에 아직 손이 닿지 않은 통조림 몇 개가 남아 있다.",
      items: [{ itemId: "cannedFood", initialQuantity: 3 }],
    }),
    stockNode({
      id: "convenience_register",
      name: "계산대",
      summary: "유리 파편과 먼지 속에 파묻힌 계산대 서랍 안쪽에 아직 회수되지 않은 잔돈이 남아 있다.",
      money: 1800,
    }),
    stockNode({
      id: "convenience_food_crate",
      name: "보관함",
      summary: "계산대 뒤쪽 아래에 밀려 들어간 플라스틱 보관함이다. 습기를 먹은 식량과 물자가 조금 남아 있다.",
      items: [
        { itemId: "staleBread", initialQuantity: 2 },
        { itemId: "waterBottle", initialQuantity: 1 },
        { itemId: "rawRice", initialQuantity: 1 },
      ],
    }),
    stockNode({
      id: "convenience_supply_pile",
      name: "창고 자재 더미",
      summary: "반쯤 무너진 창고 쪽 선반 아래에 판자와 천, 금속 부품이 뒤엉켜 쌓여 있다.",
      items: [
        { itemId: "woodPlank", initialQuantity: 3 },
        { itemId: "clothScrap", initialQuantity: 4 },
        { itemId: "scrapMetal", initialQuantity: 3 },
        { itemId: "cordage", initialQuantity: 3 },
      ],
    }),
  ],
});
