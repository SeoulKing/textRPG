import type {
  SkillId,
  SkillProgressState,
  SkillUse,
} from "./schemas/skill-progression";

export const SKILL_LEVEL_THRESHOLDS = [0, 50, 120, 210, 320] as const;
export const MAX_SKILL_LEVEL = SKILL_LEVEL_THRESHOLDS.length;
export const MAX_SKILL_XP = SKILL_LEVEL_THRESHOLDS[MAX_SKILL_LEVEL - 1];
export const SKILL_EFFECT_PER_LEVEL_PERCENT = 10;
export const FISHING_BASE_SUCCESS_PERCENT = 50;
export const FISHING_EFFECT_PER_LEVEL_PERCENT = 10;

export const PROGRESSION_SKILLS: Record<
  SkillId,
  { id: SkillId; name: string; description: string }
> = {
  collection: {
    id: "collection",
    name: "수집",
    description: "숙련도가 오를수록 물자를 수집하는 시간이 줄어듭니다.",
  },
  exploration: {
    id: "exploration",
    name: "탐색",
    description: "숙련도가 오를수록 탐색 성공률이 높아집니다.",
  },
  fishing: {
    id: "fishing",
    name: "낚시",
    description: "숙련도가 오를수록 민물고기를 낚을 확률이 높아집니다.",
  },
};

export function normalizeSkillTotalXp(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_SKILL_XP, Math.floor(value)));
}

export function createEmptySkillProgress(): SkillProgressState {
  return {
    collection: { totalXp: 0 },
    exploration: { totalXp: 0 },
    fishing: { totalXp: 0 },
  };
}

export function normalizeSkillProgress(raw: unknown): SkillProgressState {
  const candidate = raw && typeof raw === "object"
    ? raw as Record<string, unknown>
    : {};
  const collection = candidate.collection && typeof candidate.collection === "object"
    ? candidate.collection as Record<string, unknown>
    : {};
  const exploration = candidate.exploration && typeof candidate.exploration === "object"
    ? candidate.exploration as Record<string, unknown>
    : {};
  const fishing = candidate.fishing && typeof candidate.fishing === "object"
    ? candidate.fishing as Record<string, unknown>
    : {};
  return {
    collection: { totalXp: normalizeSkillTotalXp(collection.totalXp) },
    exploration: { totalXp: normalizeSkillTotalXp(exploration.totalXp) },
    fishing: { totalXp: normalizeSkillTotalXp(fishing.totalXp) },
  };
}

export function getSkillLevel(totalXp: number) {
  const normalizedXp = normalizeSkillTotalXp(totalXp);
  let level = 1;
  for (let index = 1; index < SKILL_LEVEL_THRESHOLDS.length; index += 1) {
    if (normalizedXp < SKILL_LEVEL_THRESHOLDS[index]) {
      break;
    }
    level = index + 1;
  }
  return level;
}

export function getProgressionSkillLevel(
  progress: SkillProgressState,
  skillId: SkillId,
) {
  return getSkillLevel(progress[skillId].totalXp);
}

export function getSkillXpForMinutes(baseMinutes: number) {
  const normalizedMinutes = Number.isFinite(baseMinutes)
    ? Math.max(1, Math.floor(baseMinutes))
    : 1;
  return Math.max(1, Math.ceil(normalizedMinutes / 5));
}

export function getSkillEffectPercent(level: number, skillId?: SkillId) {
  if (skillId === "fishing") {
    const normalizedLevel = Math.max(1, Math.min(MAX_SKILL_LEVEL, Math.floor(level)));
    return FISHING_BASE_SUCCESS_PERCENT + (normalizedLevel - 1) * FISHING_EFFECT_PER_LEVEL_PERCENT;
  }
  const normalizedLevel = Math.max(1, Math.min(MAX_SKILL_LEVEL, Math.floor(level)));
  return (normalizedLevel - 1) * SKILL_EFFECT_PER_LEVEL_PERCENT;
}

export function resolveSkillAdjustedMinutes(
  baseMinutes: number,
  skillUse: SkillUse | undefined,
  progress: SkillProgressState,
) {
  const normalizedMinutes = Math.max(1, Math.floor(baseMinutes));
  if (skillUse?.skillId !== "collection") {
    return normalizedMinutes;
  }
  const level = getProgressionSkillLevel(progress, "collection");
  const multiplier = 1 - getSkillEffectPercent(level) / 100;
  return Math.max(1, Math.floor(normalizedMinutes * multiplier));
}

export function addSkillXp(
  progress: SkillProgressState,
  skillId: SkillId,
  amount: number,
) {
  const previousXp = normalizeSkillTotalXp(progress[skillId].totalXp);
  const gainedXp = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const nextXp = normalizeSkillTotalXp(previousXp + gainedXp);
  progress[skillId].totalXp = nextXp;
  return {
    previousXp,
    nextXp,
    previousLevel: getSkillLevel(previousXp),
    nextLevel: getSkillLevel(nextXp),
    gainedXp: nextXp - previousXp,
  };
}

type WeightedOutcome = {
  weight: number;
  result?: "success" | "failure";
};

function baseOutcomeProbabilities<T extends WeightedOutcome>(outcomes: T[]) {
  const totalWeight = outcomes.reduce((total, outcome) => total + outcome.weight, 0);
  if (totalWeight <= 0) {
    return outcomes.map(() => 0);
  }
  return outcomes.map((outcome) => outcome.weight / totalWeight);
}

function getSuccessOutcomeProbabilities<T extends WeightedOutcome>(
  outcomes: T[],
  level: number,
  effectPerLevelPercent: number,
  minimumLevel = 1,
) {
  if (
    outcomes.length === 0 ||
    outcomes.some((outcome) => outcome.result !== "success" && outcome.result !== "failure")
  ) {
    return baseOutcomeProbabilities(outcomes);
  }

  const failureWeight = outcomes
    .filter((outcome) => outcome.result === "failure")
    .reduce((total, outcome) => total + outcome.weight, 0);
  const successWeight = outcomes
    .filter((outcome) => outcome.result === "success")
    .reduce((total, outcome) => total + outcome.weight, 0);
  if (failureWeight <= 0 || successWeight <= 0) {
    return baseOutcomeProbabilities(outcomes);
  }

  const baseSuccessProbability = successWeight / (failureWeight + successWeight);
  const normalizedLevel = Math.max(minimumLevel, Math.min(MAX_SKILL_LEVEL, Math.floor(level)));
  const successBonus = ((normalizedLevel - minimumLevel) * effectPerLevelPercent) / 100;
  const adjustedSuccessProbability = Math.min(1, baseSuccessProbability + successBonus);
  const adjustedFailureProbability = 1 - adjustedSuccessProbability;
  return outcomes.map((outcome) =>
    outcome.result === "failure"
      ? adjustedFailureProbability * (outcome.weight / failureWeight)
      : adjustedSuccessProbability * (outcome.weight / successWeight),
  );
}

export function getExplorationOutcomeProbabilities<T extends WeightedOutcome>(
  outcomes: T[],
  level: number,
) {
  return getSuccessOutcomeProbabilities(outcomes, level, SKILL_EFFECT_PER_LEVEL_PERCENT);
}

export function getFishingOutcomeProbabilities<T extends WeightedOutcome>(
  outcomes: T[],
  level: number,
) {
  return getSuccessOutcomeProbabilities(outcomes, level, FISHING_EFFECT_PER_LEVEL_PERCENT);
}

function normalizedRandomRoll(rng: () => number) {
  const value = rng();
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1 - Number.EPSILON, value));
}

export function selectRandomOutcome<T extends WeightedOutcome>(
  outcomes: T[],
  options: {
    skillUse?: SkillUse;
    progress: SkillProgressState;
    rng?: () => number;
  },
) {
  if (outcomes.length === 0) {
    return undefined;
  }
  const probabilitySkillId = options.skillUse?.skillId;
  const probabilities = probabilitySkillId === "exploration"
    ? getExplorationOutcomeProbabilities(
        outcomes,
        getProgressionSkillLevel(options.progress, probabilitySkillId),
      )
    : probabilitySkillId === "fishing"
      ? getFishingOutcomeProbabilities(
          outcomes,
          getProgressionSkillLevel(options.progress, probabilitySkillId),
        )
    : baseOutcomeProbabilities(outcomes);
  const roll = normalizedRandomRoll(options.rng ?? Math.random);
  let cursor = 0;
  for (let index = 0; index < outcomes.length; index += 1) {
    cursor += probabilities[index] ?? 0;
    if (roll < cursor) {
      return outcomes[index];
    }
  }
  return outcomes[outcomes.length - 1];
}

export function buildSkillProgressCards(progress: SkillProgressState, fishingOutcomes?: WeightedOutcome[]) {
  return (Object.keys(PROGRESSION_SKILLS) as SkillId[]).map((skillId) => {
    const totalXp = normalizeSkillTotalXp(progress[skillId].totalXp);
    const level = getSkillLevel(totalXp);
    const isMaxLevel = level === MAX_SKILL_LEVEL;
    const currentThreshold = SKILL_LEVEL_THRESHOLDS[level - 1];
    const nextThreshold = isMaxLevel
      ? null
      : SKILL_LEVEL_THRESHOLDS[level];
    const xpIntoLevel = isMaxLevel ? 0 : totalXp - currentThreshold;
    const xpForNextLevel = nextThreshold === null
      ? null
      : nextThreshold - currentThreshold;
    const progressPercent = xpForNextLevel === null
      ? 100
      : Math.max(0, Math.min(100, (xpIntoLevel / xpForNextLevel) * 100));
    let effectPercent = getSkillEffectPercent(level, skillId);
    if (skillId === "fishing") {
      effectPercent -= FISHING_BASE_SUCCESS_PERCENT;
      if (fishingOutcomes?.length) {
        const baseProbabilities = getFishingOutcomeProbabilities(fishingOutcomes, 1);
        const currentProbabilities = getFishingOutcomeProbabilities(fishingOutcomes, level);
        const bonusPercent = fishingOutcomes.reduce((total, outcome, index) =>
          total + (outcome.result === "success"
            ? (currentProbabilities[index] - baseProbabilities[index]) * 100
            : 0), 0);
        effectPercent = Math.max(0, Math.round(bonusPercent * 100) / 100);
      }
    }
    return {
      ...PROGRESSION_SKILLS[skillId],
      level,
      maxLevel: MAX_SKILL_LEVEL as 5,
      totalXp,
      xpIntoLevel,
      xpForNextLevel,
      progressPercent,
      effectPercent,
      isMaxLevel,
    };
  });
}
