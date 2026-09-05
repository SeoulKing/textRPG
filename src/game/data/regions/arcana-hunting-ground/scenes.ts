import type { SceneDefinition } from "../../../schemas";
import { slimeMonster } from "./monsters";

const slimeStats = `체력 ${slimeMonster.maxHp} · 공격력 ${slimeMonster.attack}`;

export const arcanaHuntingGroundSceneDefinitions: SceneDefinition[] = [
  {
    id: "arcana_hunting_ground_first_intro",
    locationId: "arcana_hunting_ground",
    title: "아르카나 사냥터",
    paragraphs: [
      "아르카나 광장 아래로 내려오자 은빛 돌길이 끝나고, 푸른 별빛풀이 무릎 높이까지 펼쳐진 초원이 나타난다. 풀잎 사이에는 둥근 무언가가 지나간 듯 투명한 점액 자국이 길게 이어져 있다.",
      "광장의 모험가들이 초보자를 위해 표시해 둔 사냥터 경계석 너머에서는 야생 몬스터가 출몰한다. 가장 흔한 것은 마력이 뭉쳐 태어난 슬라임이다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "arcana_hunting_ground" },
      { type: "flag_not", flag: "intro_seen_arcana_hunting_ground" },
      { type: "flag_not", flag: "arcana_slime_encounter_active" },
    ],
    introFlag: "intro_seen_arcana_hunting_ground",
  },
  {
    id: "arcana_hunting_ground_repeat_intro",
    locationId: "arcana_hunting_ground",
    title: "아르카나 사냥터",
    paragraphs: [
      "별빛풀 사이로 반투명한 점액 자국이 이어진다. 흔적을 따라가면 이 초원에 사는 슬라임을 다시 찾아낼 수 있을 것 같다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "arcana_hunting_ground" },
      { type: "flag", flag: "intro_seen_arcana_hunting_ground" },
      { type: "flag_not", flag: "arcana_slime_encounter_active" },
    ],
  },
  {
    id: "arcana_hunting_ground_slime_encounter",
    locationId: "arcana_hunting_ground",
    title: "슬라임 조우",
    paragraphs: [
      "별빛이 고인 낮은 웅덩이 앞에서 초록빛 덩어리가 천천히 몸을 일으킨다. 반투명한 몸 안쪽에서 작은 마력핵이 박동하고, 몸을 수축할 때마다 젖은 풀잎이 바깥으로 밀려난다.",
      `${slimeMonster.name} · ${slimeStats}`,
      "슬라임은 아직 공격하지 않았지만 당신의 움직임을 따라 몸을 기울이고 있다. 전투 규칙이 갖춰지기 전까지는 거리를 유지하는 편이 안전하다.",
    ],
    choiceIds: ["retreat_from_arcana_slime"],
    conditions: [
      { type: "location", locationId: "arcana_hunting_ground" },
      { type: "flag", flag: "arcana_slime_encounter_active" },
    ],
    suppressLocationInteractions: true,
  },
];
