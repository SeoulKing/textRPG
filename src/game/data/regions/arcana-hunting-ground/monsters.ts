import { MonsterDefinitionSchema } from "../../../schemas";

export const slimeMonster = MonsterDefinitionSchema.parse({
  id: "arcana_slime",
  name: "슬라임",
  maxHp: 10,
  attack: 1,
  description: "별빛 이슬과 흙의 마력이 엉겨 태어난 반투명한 초록색 몬스터다.",
  traits: ["slime", "magic-creature", "beginner-monster"],
});
