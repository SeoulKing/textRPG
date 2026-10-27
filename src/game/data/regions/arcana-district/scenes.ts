import type { SceneDefinition } from "../../../schemas";

export const arcanaDistrictScenes: SceneDefinition[] = [
  {
    id: "arcana_shop_intro", locationId: "arcana_shop", title: "광장의 상점",
    paragraphs: ["푸른 차양 아래로 들어서면 유리병과 작은 마도구가 선반을 가득 채우고 있다. 손바닥만 한 저울 옆에는 물건을 감쌀 천이 가지런히 접혀 있고, 안쪽 작업대에서는 은은한 수정빛이 새어 나온다."],
    choiceIds: ["leave_arcana_place"], conditions: [{ type: "location", locationId: "arcana_shop" }],
  },
  {
    id: "arcana_restaurant_intro", locationId: "arcana_restaurant", title: "광장의 식당",
    paragraphs: ["차양 아래 테라스에는 둥근 식탁이 놓여 있고, 열린 창 너머로 빵과 따뜻한 수프 냄새가 흘러나온다. 나무 식탁 위의 작은 등불이 잔과 접시를 비추고, 낮은 난간 밖으로는 광장의 분수가 보인다."],
    choiceIds: ["leave_arcana_place"], conditions: [{ type: "location", locationId: "arcana_restaurant" }],
  },
  {
    id: "arcana_inn_intro", locationId: "arcana_inn", title: "광장의 여관",
    paragraphs: ["두꺼운 문 안쪽에는 닳은 나무 바닥과 작은 접수대가 자리하고 있다. 벽에 걸린 열쇠들이 금빛 조명 아래 나란히 빛나고, 푸른 융단을 깐 계단이 위층 객실로 이어진다. 문밖의 분수 소리는 이곳에 닿으면 한결 작아진다."],
    choiceIds: ["leave_arcana_place"], conditions: [{ type: "location", locationId: "arcana_inn" }],
  },
  {
    id: "arcana_return_portal_intro", locationId: "arcana_return_portal", title: "귀환 포탈",
    paragraphs: ["돌로 세운 고리 안에서 푸른 빛이 잔잔하게 흔들린다. 빛 너머에는 익숙한 들판과 바람에 눕는 풀잎이 비치고, 뒤편 광장의 물소리와 종소리가 문턱 가까이에서 희미하게 겹쳐진다."],
    choiceIds: ["leave_arcana_place"], conditions: [{ type: "location", locationId: "arcana_return_portal" }],
  },
  {
    id: "arcana_city_gate_intro", locationId: "arcana_city_gate", title: "도시 남문",
    paragraphs: ["푸른 깃발을 단 돌기둥 사이로 광장의 포장길이 이어진다. 문 안쪽에는 화단과 등불이 가지런히 놓여 있고, 문턱 너머에서는 별빛풀이 바람에 흔들린다. 돌바닥이 끝나는 곳에서 평원으로 가는 흙길이 시작된다."],
    choiceIds: ["leave_arcana_place"], conditions: [{ type: "location", locationId: "arcana_city_gate" }],
  },
];
