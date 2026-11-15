import type {
  GameState,
  SubwayRoguelikeSkillId,
  SubwayRunBuild,
} from "./schemas";
import { appendLogEntry, changeSurvivalStat } from "./state-utils";
import { setSystemNote } from "./system-note";

export type SubwayRoguelikeSkillDefinition = {
  id: SubwayRoguelikeSkillId;
  name: string;
  description: string;
  maxRank: number;
};

export const SUBWAY_ROGUELIKE_SKILLS: SubwayRoguelikeSkillDefinition[] = [
  {
    id: "power_strike",
    name: "강타",
    description: "근접 공격 피해가 등급마다 1 증가합니다.",
    maxRank: 5,
  },
  {
    id: "improvised_mastery",
    name: "임기응변",
    description: "투척 명중률이 등급마다 10%p 증가하고, 2·4등급에서 피해가 1 증가합니다.",
    maxRank: 5,
  },
  {
    id: "iron_guard",
    name: "철벽",
    description: "방어 성공률이 등급마다 4%p 증가하고, 실패해도 받는 피해가 등급만큼 감소합니다.",
    maxRank: 5,
  },
  {
    id: "second_wind",
    name: "재정비",
    description: "적을 쓰러뜨릴 때 체력을 회복합니다. 3등급부터 회복량이 2가 됩니다.",
    maxRank: 5,
  },
  {
    id: "silver_tongue",
    name: "협상가",
    description: "협상 성공률이 등급마다 10%p 증가합니다.",
    maxRank: 5,
  },
  {
    id: "escape_route",
    name: "퇴로 확보",
    description: "후퇴 성공률이 등급마다 8%p 증가합니다.",
    maxRank: 5,
  },
];

const skillById = new Map(
  SUBWAY_ROGUELIKE_SKILLS.map((skill) => [skill.id, skill]),
);

export function createEmptySubwayRunBuild(): SubwayRunBuild {
  return {
    victories: 0,
    skillRanks: {
      power_strike: 0,
      improvised_mastery: 0,
      iron_guard: 0,
      second_wind: 0,
      silver_tongue: 0,
      escape_route: 0,
    },
    pendingUpgradeChoices: [],
  };
}

export function subwaySkillRank(
  state: GameState,
  skillId: SubwayRoguelikeSkillId,
) {
  return state.subwayExpedition.runBuild.skillRanks[skillId] ?? 0;
}

export function subwaySkillDefinition(skillId: SubwayRoguelikeSkillId) {
  const skill = skillById.get(skillId);
  if (!skill) {
    throw new Error("알 수 없는 지하철 전투 스킬입니다.");
  }
  return skill;
}

export function prepareSubwayUpgradeChoices(state: GameState) {
  const build = state.subwayExpedition.runBuild;
  build.victories += 1;
  const offset =
    (state.subwayExpedition.runNumber + state.subwayExpedition.depth + build.victories) %
    SUBWAY_ROGUELIKE_SKILLS.length;
  const rotated = [
    ...SUBWAY_ROGUELIKE_SKILLS.slice(offset),
    ...SUBWAY_ROGUELIKE_SKILLS.slice(0, offset),
  ];
  build.pendingUpgradeChoices = rotated
    .filter((skill) => build.skillRanks[skill.id] < skill.maxRank)
    .slice(0, 3)
    .map((skill) => skill.id);
  return build.pendingUpgradeChoices;
}

export function applySubwayUpgrade(
  state: GameState,
  requestedSkillId: string,
) {
  const progress = state.subwayExpedition.currentFloorProgress;
  const build = state.subwayExpedition.runBuild;
  if (progress.phase !== "upgrade") {
    throw new Error("현재는 전투 스킬을 선택할 수 없습니다.");
  }
  const skill = SUBWAY_ROGUELIKE_SKILLS.find(
    (entry) => entry.id === requestedSkillId,
  );
  if (!skill || !build.pendingUpgradeChoices.includes(skill.id)) {
    throw new Error("현재 제시된 전투 스킬이 아닙니다.");
  }
  const skillId = skill.id;
  const currentRank = build.skillRanks[skillId];
  if (currentRank >= skill.maxRank) {
    throw new Error("이미 최고 등급인 전투 스킬입니다.");
  }
  build.skillRanks[skillId] = currentRank + 1;
  build.pendingUpgradeChoices = [];
  progress.phase = "complete";
  setSystemNote(state, [{
    type: "text",
    text: `${skill.name} ${build.skillRanks[skillId]}등급 획득`,
    tone: "positive",
  }]);
  appendLogEntry(
    state,
    `지하철 원정 스킬 ${skill.name} ${build.skillRanks[skillId]}등급을 획득했다.`,
  );
}

export function applySubwayVictoryRecovery(state: GameState) {
  const rank = subwaySkillRank(state, "second_wind");
  if (rank <= 0) return 0;
  const amount = rank >= 3 ? 2 : 1;
  const before = state.stats.hp;
  changeSurvivalStat(state, "hp", amount);
  return state.stats.hp - before;
}

export function subwayRunBuildSummary(state: GameState) {
  const build = state.subwayExpedition.runBuild;
  const skills = SUBWAY_ROGUELIKE_SKILLS
    .filter((skill) => build.skillRanks[skill.id] > 0)
    .map((skill) => `${skill.name} ${build.skillRanks[skill.id]}`);
  return skills.length > 0
    ? `승리 ${build.victories}회 · ${skills.join(" · ")}`
    : `승리 ${build.victories}회 · 획득한 원정 스킬 없음`;
}
