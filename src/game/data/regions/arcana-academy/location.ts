import { defineLocation } from "../../location-helpers";

export const arcanaAcademyLocation = defineLocation({
  id: "arcana_academy", name: "아르카나 아카데미", risk: "low",
  mapPosition: { q: 1, r: -1 }, imagePath: "assets/scenes/arcana-academy.png",
  summary: "교장 에드윈과 학생 스텔라를 만날 수 있는 마법학교. 회랑 안쪽으로 기초 강의실·실습실·도서관과 관측탑이 이어진다.",
  tags: ["magic-city", "academy", "realm:magic"], traits: ["magic studies", "observatory", "courtyard"],
  residentIds: ["academy_headmaster", "stella", "academy_instructor", "academy_librarian"],
  obtainableItemIds: ["manaPotion", "moonHerb", "manaShard", "arcaneDust"],
  neighbors: ["arcana_plaza", "arcana_restaurant"],
  links: {
    arcana_plaza: { note: "아카데미 앞뜰에서 중앙 분수가 있는 광장으로 향한다." },
    arcana_restaurant: { note: "회랑 옆 돌길을 따라 남쪽의 식당으로 내려간다." },
  },
});
