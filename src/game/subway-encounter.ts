import { applyTreatment, canApplyTreatment } from "./health-conditions";
import { baseItems } from "./data/items";
import { advanceGameMinutes, syncClock } from "./rules";
import {
  SubwayEncounterSceneSchema,
  SubwayEncounterStateSchema,
  SubwayEncounterTurnResultSchema,
  type GameState,
  type SubwayEncounterActionId,
  type SubwayChoiceIntent,
  type SubwayEncounterChoice,
  type SubwayEncounterScene,
  type SubwayEncounterState,
  type SubwayEncounterTurnResult,
  type SubwaySituationKind,
  type SystemNoteEntry,
} from "./schemas";
import type { SubwayEncounterGenerationResult } from "./subway-encounter-generator";
import {
  applySubwayVictoryRecovery,
  prepareSubwayUpgradeChoices,
  subwaySkillRank,
} from "./subway-roguelike";
import { appendLogEntry, changeSurvivalStat } from "./state-utils";
import { setSystemNote } from "./system-note";
import {
  addSkillXp,
  combatCounterChance,
  COMBAT_HIT_CHANCE_CAP,
  COMBAT_TURN_XP,
  COMBAT_VICTORY_XP,
  getCombatSkillBonuses,
} from "./skill-progression";

export const SUBWAY_BANDIT_ENCOUNTER_ID = "subway_floor_1_bandit";
export const SUBWAY_BANDIT_ACTION_MINUTES = 5;

const BANDIT_MAX_HP = 4;
const BANDIT_ATTACK = 1;
const MAX_SITUATION_TURNS = 5;

type ItemDefinition = (typeof baseItems)[keyof typeof baseItems];

export type SubwayEncounterActionCatalogEntry = {
  actionToken: SubwayEncounterActionId;
  intent: string;
  mechanicalHint: string;
};

const itemDefinition = (itemId: string) =>
  (baseItems as Record<string, ItemDefinition | undefined>)[itemId];

const itemName = (itemId: string) => itemDefinition(itemId)?.name ?? itemId;

function availableItemAmount(state: GameState, itemId: string) {
  return (
    (state.inventory[itemId] ?? 0) +
    (state.subwayExpedition.carriedLoot[itemId] ?? 0)
  );
}

function accessibleItemTotals(state: GameState) {
  const itemIds = new Set([
    ...Object.keys(state.inventory),
    ...Object.keys(state.subwayExpedition.carriedLoot),
  ]);
  return Object.fromEntries(
    Array.from(itemIds, (itemId) => [itemId, availableItemAmount(state, itemId)]),
  );
}

function consumeAccessibleItem(state: GameState, itemId: string) {
  const carried = state.subwayExpedition.carriedLoot[itemId] ?? 0;
  if (carried > 0) {
    const next = carried - 1;
    if (next > 0) state.subwayExpedition.carriedLoot[itemId] = next;
    else delete state.subwayExpedition.carriedLoot[itemId];
    return;
  }
  const inventory = state.inventory[itemId] ?? 0;
  if (inventory <= 0) {
    throw new Error("현재 사용할 수 없는 아이템입니다.");
  }
  if (inventory > 1) state.inventory[itemId] = inventory - 1;
  else delete state.inventory[itemId];
}

const OPENING_COMBAT_ACTIONS: SubwayEncounterActionCatalogEntry[] = [
  {
    actionToken: "fight",
    intent: "상대가 대비하기 전에 빈틈을 노려 가까이 파고들어 기습한다.",
    mechanicalHint: "명중 80%: 적 2피해 / 반격 60%: 나 1피해 / +5분",
  },
  {
    actionToken: "talk",
    intent: "무기를 들이대는 상대에게 침착하게 말을 걸어 물러나게 한다.",
    mechanicalHint: "성공 50% / 실패 시 전투 전환 또는 나 1피해 / +5분",
  },
  {
    actionToken: "flee",
    intent: "왔던 계단 쪽으로 몸을 돌려 상황에서 벗어나려 한다.",
    mechanicalHint: "성공 80% / 실패 시 전투 전환 또는 나 1피해 / +5분",
  },
];

const ACTIVE_COMBAT_ACTIONS: SubwayEncounterActionCatalogEntry[] = [
  {
    actionToken: "close_attack",
    intent: "맨손과 몸의 무게를 이용해 가까이 붙어 상대를 가격한다.",
    mechanicalHint: "명중 80%: 적 2피해 / 반격 60%: 나 1피해 / +5분",
  },
  {
    actionToken: "throw_improvised",
    intent: "바닥의 작은 돌이나 깨진 타일 조각을 집어 상대에게 던진다.",
    mechanicalHint: "명중 65%: 적 1피해 / 반격 35%: 나 1피해 / +5분",
  },
  {
    actionToken: "guard",
    intent: "퇴로를 확인하며 몸을 낮추고 상대의 공격을 막아 낸다.",
    mechanicalHint: "방어 성공 80% / 실패 시 나 1피해 / +5분",
  },
  {
    actionToken: "talk",
    intent: "싸움이 시작된 뒤에도 상대에게 멈추라고 설득한다.",
    mechanicalHint: "성공 30% / 실패 시 반격 65%: 나 1피해 / +5분",
  },
  {
    actionToken: "flee",
    intent: "상대와 거리를 벌린 뒤 계단 쪽으로 달아난다.",
    mechanicalHint: "성공 60% / 실패 시 반격 70%: 나 1피해 / +5분",
  },
];

const SOCIAL_ACTIONS: SubwayEncounterActionCatalogEntry[] = [
  {
    actionToken: "talk",
    intent: "상대의 말을 듣고 현실적인 합의점을 제시한다.",
    mechanicalHint: "성공 75% / 실패 시 -1 정신력 / +10분",
  },
  {
    actionToken: "observe",
    intent: "말투와 행동을 관찰해 상대가 정말 원하는 것을 알아낸다.",
    mechanicalHint: "성공 70% / 실패 시 -1 정신력 / +10분",
  },
  {
    actionToken: "careful",
    intent: "거리를 유지하며 오해를 만들지 않도록 조심스럽게 대응한다.",
    mechanicalHint: "성공 80% / 실패 시 -1 정신력 / +10분",
  },
  {
    actionToken: "force",
    intent: "강하게 압박해 상대가 물러나도록 만든다.",
    mechanicalHint: "성공 45% / 실패 시 나 1피해 / +10분",
  },
  {
    actionToken: "flee",
    intent: "대화를 포기하고 안전한 길로 물러난다.",
    mechanicalHint: "성공 75% / 실패 시 -1 정신력 / +10분",
  },
];

const HAZARD_ACTIONS: SubwayEncounterActionCatalogEntry[] = [
  {
    actionToken: "observe",
    intent: "주변의 흔적과 구조를 살펴 위험이 반복되는 규칙을 찾는다.",
    mechanicalHint: "성공 75% / 실패 시 -1 정신력 / +10분",
  },
  {
    actionToken: "careful",
    intent: "안전한 발판과 손잡이를 하나씩 확인하며 통과한다.",
    mechanicalHint: "성공 80% / 실패 시 나 1피해 / +10분",
  },
  {
    actionToken: "force",
    intent: "위험 구간을 빠르게 밀어붙여 돌파한다.",
    mechanicalHint: "성공 55% / 실패 시 나 1피해 / +10분",
  },
  {
    actionToken: "flee",
    intent: "현재 경로를 포기하고 진입 지점으로 물러난다.",
    mechanicalHint: "성공 80% / 실패 시 나 1피해 / +10분",
  },
];

type CombatActionProfile =
  | {
      kind: "attack";
      hitChance: number;
      damage: number;
      counterChance: number;
    }
  | {
      kind: "guard";
      successChance: number;
      damageReduction: number;
    }
  | {
      kind: "talk";
      successChance: number;
      counterChance: number;
    }
  | {
      kind: "flee";
      successChance: number;
      counterChance: number;
    };

function hasEnemyTrait(encounter: SubwayEncounterState, trait: string) {
  return encounter.enemy?.traits.includes(trait) ?? false;
}

function baseCombatActionProfile(
  state: GameState,
  encounter: SubwayEncounterState,
  actionToken: SubwayEncounterActionId,
): CombatActionProfile | null {
  if (actionToken === "talk") {
    const rank = subwaySkillRank(state, "silver_tongue");
    return {
      kind: "talk",
      successChance: Math.min(90, (encounter.stage === "opening" ? 50 : 30) + rank * 10),
      counterChance: encounter.stage === "opening" ? 50 : 65,
    };
  }
  if (actionToken === "flee") {
    const rank = subwaySkillRank(state, "escape_route");
    return {
      kind: "flee",
      successChance: Math.min(95, (encounter.stage === "opening" ? 80 : 60) + rank * 8),
      counterChance: encounter.stage === "opening" ? 50 : 70,
    };
  }
  if (actionToken === "guard" || actionToken === "use_item:makeshiftShield") {
    const rank = subwaySkillRank(state, "iron_guard");
    return {
      kind: "guard",
      successChance:
        actionToken === "use_item:makeshiftShield"
          ? 100
          : Math.min(100, 80 + rank * 4),
      damageReduction: rank,
    };
  }
  if (actionToken === "fight" || actionToken === "close_attack") {
    const rank = subwaySkillRank(state, "power_strike");
    return {
      kind: "attack",
      hitChance: Math.max(50, 80 - (hasEnemyTrait(encounter, "agile") ? 10 : 0)),
      damage: Math.max(
        1,
        2 + rank - (hasEnemyTrait(encounter, "armored") ? 1 : 0),
      ),
      counterChance: 60 + (hasEnemyTrait(encounter, "agile") ? 10 : 0),
    };
  }
  if (actionToken === "throw_improvised") {
    const rank = subwaySkillRank(state, "improvised_mastery");
    return {
      kind: "attack",
      hitChance: Math.min(95, 65 + rank * 10),
      damage: Math.max(
        1,
        1 + Math.floor(rank / 2) - (hasEnemyTrait(encounter, "armored") ? 1 : 0),
      ),
      counterChance: 35,
    };
  }
  const toolProfiles: Record<string, Omit<Extract<CombatActionProfile, { kind: "attack" }>, "kind">> = {
    utilityKnife: { hitChance: 90, damage: 3, counterChance: 50 },
    crudeAxe: { hitChance: 85, damage: 4, counterChance: 60 },
    subwayBaton: { hitChance: 88, damage: 3, counterChance: 45 },
    breakerMachete: { hitChance: 85, damage: 5, counterChance: 45 },
  };
  if (actionToken.startsWith("use_item:")) {
    const itemId = actionToken.slice("use_item:".length);
    const profile = toolProfiles[itemId];
    if (profile) {
      return { kind: "attack", ...profile };
    }
  }
  return null;
}

function combatActionProfile(
  state: GameState,
  encounter: SubwayEncounterState,
  actionToken: SubwayEncounterActionId,
): CombatActionProfile | null {
  const profile = baseCombatActionProfile(state, encounter, actionToken);
  if (profile?.kind !== "attack") return profile;
  const bonuses = getCombatSkillBonuses(state.skillProgress);
  return {
    ...profile,
    damage: profile.damage + bonuses.attackBonus,
    hitChance: Math.min(COMBAT_HIT_CHANCE_CAP, profile.hitChance + bonuses.hitChanceBonus),
  };
}

function combatMechanicalHint(
  state: GameState,
  encounter: SubwayEncounterState,
  actionToken: SubwayEncounterActionId,
) {
  const profile = combatActionProfile(state, encounter, actionToken);
  if (!profile) return null;
  if (profile.kind === "attack") {
    const toolPrefix = actionToken.startsWith("use_item:")
      ? `${itemName(actionToken.slice("use_item:".length))} 내구도 -1 / `
      : "";
    return `${toolPrefix}명중 ${profile.hitChance}%: 적 ${profile.damage}피해 / 반격 ${combatCounterChance(state.skillProgress, profile.counterChance)}%: 나 ${encounter.enemy?.attack ?? 1}피해 / +5분`;
  }
  if (profile.kind === "guard") {
    const toolPrefix = actionToken === "use_item:makeshiftShield"
      ? "철판 방패 내구도 -1 / "
      : "";
    const reduction = profile.damageReduction > 0
      ? ` / 실패 피해 -${profile.damageReduction}`
      : "";
    return `${toolPrefix}방어 성공 ${profile.successChance}%${reduction} / +5분`;
  }
  if (profile.kind === "talk") {
    return `성공 ${profile.successChance}% / 실패 시 반격 ${combatCounterChance(state.skillProgress, profile.counterChance)}%: 나 ${encounter.enemy?.attack ?? 1}피해 / +5분`;
  }
  return `성공 ${profile.successChance}% / 실패 시 반격 ${combatCounterChance(state.skillProgress, profile.counterChance)}%: 나 ${encounter.enemy?.attack ?? 1}피해 / +5분`;
}

function rollPercent(rng: () => number) {
  const raw = rng();
  const normalized = Number.isFinite(raw)
    ? Math.max(0, Math.min(1 - Number.EPSILON, raw))
    : 0;
  return Math.floor(normalized * 100) + 1;
}

function eventLikelihoodsForFloor() {
  return { combat: 100, social: 0, hazard: 0 };
}

export function subwaySituationActionCatalog(
  state: GameState,
  encounter = state.subwayExpedition.currentFloorProgress.encounter,
) {
  if (!encounter || encounter.stage === "resolved") {
    return [];
  }
  if (encounter.kind === "combat") {
    const actions = encounter.stage === "opening"
      ? structuredClone(OPENING_COMBAT_ACTIONS)
      : structuredClone(ACTIVE_COMBAT_ACTIONS);
    return actions.map((action) => ({
      ...action,
      mechanicalHint:
        combatMechanicalHint(state, encounter, action.actionToken) ??
        action.mechanicalHint,
    }));
  }
  const common = encounter.kind === "social" ? SOCIAL_ACTIONS : HAZARD_ACTIONS;
  return structuredClone(common);
}

export function banditEncounterActionCatalog(
  stage: SubwayEncounterState["stage"],
) {
  return structuredClone(
    stage === "opening"
      ? OPENING_COMBAT_ACTIONS
      : stage === "active"
        ? ACTIVE_COMBAT_ACTIONS
        : [],
  );
}

function selectedChoice(
  encounter: SubwayEncounterState,
  choiceId: string,
) {
  return encounter.currentScene?.choices.find(
    (choice) =>
      choice.intent.primary !== "use_item" &&
      (choice.id === choiceId || choice.legacyActionToken === choiceId),
  );
}

function legacyTokenForIntent(intent: SubwayChoiceIntent): SubwayEncounterActionId {
  if (intent.primary === "use_item" && intent.itemId) {
    return `use_item:${intent.itemId}`;
  }
  if (intent.primary === "attack") {
    return intent.style === "quick" || intent.style === "cunning"
      ? "throw_improvised"
      : "close_attack";
  }
  if (intent.primary === "defend") return "guard";
  if (intent.primary === "evade" || intent.primary === "retreat") return "flee";
  if (intent.primary === "persuade") return "talk";
  if (intent.primary === "observe") return "observe";
  return intent.style === "forceful" ? "force" : "careful";
}

function addEncounterReward(state: GameState, encounter: SubwayEncounterState) {
  if (encounter.rewardGranted) return;
  encounter.rewardItems.forEach((reward) => {
    state.subwayExpedition.carriedLoot[reward.itemId] =
      (state.subwayExpedition.carriedLoot[reward.itemId] ?? 0) + reward.amount;
    state.subwayExpedition.currentFloorProgress.floorLoot[reward.itemId] =
      (state.subwayExpedition.currentFloorProgress.floorLoot[reward.itemId] ?? 0) +
      reward.amount;
  });
  encounter.rewardGranted = true;
}

function combatRewardsForFloor(state: GameState) {
  const floor = state.subwayExpedition.currentFloor;
  if (!floor) return [];
  if (floor.depth === 1) {
    return [
      { itemId: "cannedFood", amount: 1 },
      { itemId: "painRelief", amount: 1 },
    ];
  }
  const totals = new Map<string, number>();
  floor.lootSpots.forEach((spot) => {
    spot.contents.forEach(({ itemId, amount }) => {
      totals.set(itemId, (totals.get(itemId) ?? 0) + amount);
    });
  });
  const guaranteedEquipment =
    floor.depth === 3
      ? "subwayBaton"
      : floor.depth === 6
        ? "makeshiftShield"
        : floor.depth % 10 === 0
          ? "breakerMachete"
          : null;
  if (guaranteedEquipment) {
    totals.set(guaranteedEquipment, Math.max(1, totals.get(guaranteedEquipment) ?? 0));
  }
  return Array.from(totals, ([itemId, amount]) => ({ itemId, amount }));
}

function damageTool(state: GameState, itemId: string) {
  const item = itemDefinition(itemId);
  const maxDurability = item?.maxDurability ?? 0;
  if (maxDurability <= 0 || availableItemAmount(state, itemId) <= 0) {
    throw new Error("현재 사용할 수 없는 도구입니다.");
  }
  const current = state.toolDurability[itemId] ?? maxDurability;
  const next = current - 1;
  if (next > 0) {
    state.toolDurability[itemId] = next;
    return;
  }
  consumeAccessibleItem(state, itemId);
  if (availableItemAmount(state, itemId) > 0) {
    state.toolDurability[itemId] = maxDurability;
    return;
  }
  delete state.toolDurability[itemId];
}

function useRecoveryItem(state: GameState, itemId: string) {
  const item = itemDefinition(itemId);
  if (!item || availableItemAmount(state, itemId) <= 0) {
    throw new Error("현재 사용할 수 없는 아이템입니다.");
  }
  if (!canApplyTreatment(state, item.effects)) throw new Error("치료할 부상 또는 감염이 없습니다.");
  if (!item.effects.hp && !item.effects.mind && !item.effects.energy && !item.effects.injuryRelief && !item.effects.infectionRelief) {
    throw new Error("이 상황에서 사용할 효과가 없는 아이템입니다.");
  }
  consumeAccessibleItem(state, itemId);
  applyTreatment(state, item.effects);
  changeSurvivalStat(state, "hp", item.effects.hp);
  changeSurvivalStat(state, "mind", item.effects.mind);
  changeSurvivalStat(state, "energy", item.effects.energy);
  return item.useMinutes ?? 0;
}

function counterDamage(
  state: GameState,
  encounter: SubwayEncounterState,
  chance: number,
  rng: () => number,
) {
  if (!encounter.enemy || encounter.enemy.hp <= 0) {
    return { roll: null, damage: 0 };
  }
  const roll = rollPercent(rng);
  return {
    roll,
    damage: roll <= combatCounterChance(state.skillProgress, chance) ? encounter.enemy.attack : 0,
  };
}

function encounterSystemNote(
  result: SubwayEncounterTurnResult,
  encounter: SubwayEncounterState,
) {
  const entries: SystemNoteEntry[] = [];
  result.itemChanges.forEach((change) => {
    entries.push({
      type: "delta",
      subject: "item",
      label: itemName(change.itemId),
      itemId: change.itemId,
      amount: change.amount,
    });
  });
  result.toolDurabilityChanges.forEach((change) => {
    entries.push({
      type: "delta",
      subject: "durability",
      label: itemName(change.itemId),
      itemId: change.itemId,
      amount: change.amount,
    });
  });
  if (result.damageDealt > 0) {
    entries.push({
      type: "damage",
      target: encounter.enemy?.name ?? "상대",
      amount: result.damageDealt,
    });
  }
  if (result.damageTaken > 0) {
    entries.push({ type: "damage", target: "나", amount: result.damageTaken });
  }
  result.statChanges.forEach((change) => {
    if (change.stat === "hp" && change.amount === -result.damageTaken) return;
    const label = change.stat === "hp"
      ? "체력"
      : change.stat === "mind"
        ? "정신력"
        : "기력";
    entries.push({
      type: "delta",
      subject: "stat",
      label,
      amount: change.amount,
    });
  });
  if (result.resolution === "victory" && encounter.rewardGranted) {
    encounter.rewardItems.forEach((reward) => {
      entries.push({
        type: "delta",
        subject: "item",
        label: itemName(reward.itemId),
        itemId: reward.itemId,
        amount: reward.amount,
      });
    });
  }
  entries.push({ type: "time", minutes: result.minutes });
  return entries;
}

export function createEnemy(depth: number) {
  const normalizedDepth = Math.max(1, depth);
  const cycle = Math.floor((normalizedDepth - 1) / 10);
  const localDepth = ((normalizedDepth - 1) % 10) + 1;
  const archetypes = [
    {
      id: "bandit",
      name: "강도",
      hp: 4,
      attack: 1,
      description: "해진 패딩과 천 마스크를 쓴 강도다. 짧은 쇠막대를 쥔 채 통로를 막고 있다.",
      traits: ["human", "hostile", "subway", "tutorial"],
    },
    {
      id: "track_ambusher",
      name: "선로 급습자",
      hp: 5,
      attack: 1,
      description: "가벼운 운동화와 짧은 칼로 무장한 약탈자다. 기둥 사이를 빠르게 옮겨 다닌다.",
      traits: ["human", "hostile", "subway", "agile"],
    },
    {
      id: "track_ambusher_veteran",
      name: "선로 사냥꾼",
      hp: 6,
      attack: 1,
      description: "빛이 닿지 않는 선로 가장자리에서 빈틈을 기다리는 노련한 습격자다.",
      traits: ["human", "hostile", "subway", "agile"],
    },
    {
      id: "plate_raider",
      name: "철판 약탈자",
      hp: 7,
      attack: 1,
      description: "표지판과 철판을 겹쳐 만든 갑옷을 두른 약탈자다. 급소가 쉽게 드러나지 않는다.",
      traits: ["human", "hostile", "subway", "armored"],
    },
    {
      id: "plate_raider_heavy",
      name: "개찰구 파괴자",
      hp: 8,
      attack: 2,
      description: "부서진 개찰구 봉을 양손에 든 거구다. 느리지만 한 번의 타격이 무겁다.",
      traits: ["human", "hostile", "subway", "armored", "heavy"],
    },
    {
      id: "maintenance_enforcer",
      name: "정비구역 집행자",
      hp: 9,
      attack: 2,
      description: "두꺼운 작업복과 용접면을 걸친 집행자다. 좁은 통로를 방패처럼 활용한다.",
      traits: ["human", "hostile", "subway", "armored", "heavy"],
    },
    {
      id: "tunnel_brute",
      name: "터널 난폭자",
      hp: 10,
      attack: 2,
      description: "쇠사슬을 감은 팔로 터널 벽을 긁으며 다가오는 난폭한 생존자다.",
      traits: ["human", "hostile", "subway", "heavy"],
    },
    {
      id: "night_stalker",
      name: "암전 추적자",
      hp: 11,
      attack: 2,
      description: "비상등이 꺼지는 순간마다 위치를 바꾸는 사냥꾼이다. 움직임을 읽기 어렵다.",
      traits: ["human", "hostile", "subway", "agile", "heavy"],
    },
    {
      id: "deep_guard",
      name: "심층 수문장",
      hp: 12,
      attack: 2,
      description: "심층 구역의 장비를 독점한 수문장이다. 낡았지만 빈틈없는 보호구를 갖췄다.",
      traits: ["human", "hostile", "subway", "armored", "heavy"],
    },
    {
      id: "sector_boss",
      name: "구역 지배자",
      hp: 15,
      attack: 3,
      description: "열 층의 물자와 통로를 장악한 지배자다. 두꺼운 방호복과 절연 마체테로 무장했다.",
      traits: ["human", "hostile", "subway", "boss", "armored", "heavy"],
    },
  ] as const;
  const archetype = archetypes[localDepth - 1]!;
  const maxHp = archetype.hp + cycle * 4;
  const attack = archetype.attack + Math.floor((cycle + 1) / 2);
  return {
    id: `subway_${archetype.id}_${normalizedDepth}`,
    name: cycle > 0 ? `${archetype.name} · ${cycle + 1}구역` : archetype.name,
    maxHp,
    hp: maxHp,
    attack,
    description: archetype.description,
    traits: [...archetype.traits, `depth:${normalizedDepth}`],
  };
}

export function createSubwaySituation(state: GameState) {
  const floor = state.subwayExpedition.currentFloor;
  if (!floor) throw new Error("상황을 만들 지하철 층이 없습니다.");
  const kind = "combat" as const;
  return SubwayEncounterStateSchema.parse({
    id: floor.depth === 1
      ? `${SUBWAY_BANDIT_ENCOUNTER_ID}:${state.subwayExpedition.runNumber}`
      : `subway_${kind}_${state.subwayExpedition.runNumber}_${floor.depth}`,
    kind,
    objective: floor.majorEvent.resolutionGoal,
    actor: null,
    enemy: kind === "combat" ? createEnemy(floor.depth) : null,
    eventLikelihoods: eventLikelihoodsForFloor(),
    dangerTier: Math.min(10, Math.max(1, Math.ceil(floor.depth / 3))),
    pendingThreat: null,
    lastGenerationDiagnostics: null,
    stage: "opening",
    resolution: null,
    turnNumber: 0,
    progress: 0,
    targetProgress: kind === "combat" ? 1 : 2,
    failureCount: 0,
    currentScene: null,
    history: [],
    rewardItems: combatRewardsForFloor(state),
    rewardGranted: false,
  });
}

export function createSubwayBanditEncounter(runNumber: number) {
  const state = {
    subwayExpedition: {
      runNumber,
      currentFloor: {
        depth: 1,
        situationKind: "combat",
        majorEvent: { resolutionGoal: "강도가 막고 있는 통로를 확보한다." },
      },
    },
  } as unknown as GameState;
  return createSubwaySituation(state);
}

export function beginSubwaySituation(state: GameState) {
  const progress = state.subwayExpedition.currentFloorProgress;
  if (!state.subwayExpedition.active || !state.subwayExpedition.currentFloor) {
    throw new Error("진행 중인 지하철 탐험 층이 없습니다.");
  }
  progress.phase = "encounter";
  progress.encounter = createSubwaySituation(state);
  progress.currentResult = null;
  progress.eventResolved = false;
  progress.generationFailure = "";
  return progress.encounter;
}

export function beginSubwayBanditEncounter(state: GameState) {
  if (state.subwayExpedition.depth !== 1) {
    throw new Error("지하 1층에서만 강도 조우를 시작할 수 있습니다.");
  }
  const runPlan = state.subwayExpedition.runPlan;
  state.subwayExpedition.storyMemory = {
    facts: [...(runPlan?.facts ?? [])],
    knownActors: [],
    unresolvedThreads: [...(runPlan?.unresolvedThreads ?? [])],
    resolvedThreads: [],
    recentSummaries: [],
    lastBridge: "",
  };
  return beginSubwaySituation(state);
}

export function setSubwayEncounterScene(
  state: GameState,
  scene: SubwayEncounterScene,
) {
  const encounter = state.subwayExpedition.currentFloorProgress.encounter;
  if (!encounter) throw new Error("진행 중인 지하철 상황이 없습니다.");
  const parsed = SubwayEncounterSceneSchema.parse(scene);
  if (
    parsed.scenarioId !== encounter.id ||
    parsed.turnNumber !== encounter.turnNumber ||
    parsed.kind !== encounter.kind ||
    parsed.phase !== encounter.stage
  ) {
    throw new Error("LLM 장면이 현재 지하철 상황의 ID·턴·종류·단계와 일치하지 않습니다.");
  }
  encounter.currentScene = parsed;
  if (
    parsed.phase === "resolved" &&
    encounter.resolution &&
    encounter.resolution !== "player_defeated"
  ) {
    acknowledgeSubwaySituationResult(state);
  }
}

export function setSubwayEncounterGeneration(
  state: GameState,
  generation: SubwayEncounterGenerationResult,
) {
  const encounter = state.subwayExpedition.currentFloorProgress.encounter;
  if (!encounter) throw new Error("진행 중인 지하철 상황이 없습니다.");

  if (generation.eventKind !== encounter.kind) {
    throw new Error("생성된 장면의 상황 종류가 서버 전투 상태와 일치하지 않습니다.");
  }

  encounter.actor = generation.actor
    ? {
        ...generation.actor,
        relationship: encounter.actor?.relationship ??
          generation.actor.relationship,
      }
    : null;
  if (encounter.kind === "combat") {
    const authoritativeEnemy =
      encounter.enemy ?? createEnemy(state.subwayExpedition.depth);
    encounter.enemy = authoritativeEnemy;
    if (encounter.actor) {
      encounter.actor = {
        ...encounter.actor,
        name: authoritativeEnemy.name,
        appearance: authoritativeEnemy.description,
      };
    }
  } else {
    encounter.enemy = null;
  }
  encounter.pendingThreat = generation.pendingThreat;
  encounter.lastGenerationDiagnostics = generation.diagnostics;
  generation.storyHooks.forEach((hook) => {
    if (!state.subwayExpedition.storyMemory.unresolvedThreads.includes(hook)) {
      state.subwayExpedition.storyMemory.unresolvedThreads.push(hook);
    }
  });
  state.subwayExpedition.storyMemory.unresolvedThreads =
    state.subwayExpedition.storyMemory.unresolvedThreads.slice(-12);
  if (encounter.actor) {
    const memoryActor = {
      ...encounter.actor,
      status: encounter.stage === "resolved" ? "resolved" as const : "active" as const,
      lastSeenDepth: state.subwayExpedition.depth,
    };
    const actors = state.subwayExpedition.storyMemory.knownActors;
    const existingIndex = actors.findIndex((actor) => actor.id === memoryActor.id);
    if (existingIndex >= 0) actors[existingIndex] = memoryActor;
    else actors.push(memoryActor);
    state.subwayExpedition.storyMemory.knownActors = actors.slice(-12);
  }
  setSubwayEncounterScene(state, generation.scene);
}

function nonCombatChance(
  actionToken: SubwayEncounterActionId,
  kind: SubwaySituationKind,
) {
  if (actionToken.startsWith("use_item:")) {
    return actionToken.endsWith("utilityKnife") ? 90 : 85;
  }
  if (actionToken === "flee") return kind === "hazard" ? 80 : 75;
  if (kind === "social") {
    return { talk: 75, observe: 70, careful: 80, force: 45 }[actionToken] ?? 50;
  }
  return { observe: 75, careful: 80, force: 55 }[actionToken] ?? 50;
}

function resultSummary(
  encounter: SubwayEncounterState,
  actionToken: SubwayEncounterActionId,
  success: boolean,
  damageDealt: number,
  damageTaken: number,
  resolution: SubwayEncounterTurnResult["resolution"],
) {
  if (resolution === "victory") return `${encounter.enemy?.name ?? "상대"}를 쓰러뜨리고 통로를 확보했다.`;
  if (resolution === "talked_down") return "대화가 통했고 상대는 더 싸우지 않고 물러났다.";
  if (resolution === "escaped") return "위험에서 벗어나 대합실로 돌아갈 거리를 확보했다.";
  if (resolution === "resolved") return "여러 번의 시도 끝에 이 층의 핵심 상황을 해결했다.";
  if (resolution === "failed") return "더 진행하면 위험하다고 판단해 현재 상황의 해결을 중단했다.";
  if (resolution === "player_defeated") return "받은 피해를 견디지 못하고 쓰러졌다.";
  if (damageDealt > 0) {
    return damageTaken > 0
      ? `${encounter.enemy?.name ?? "상대"}에게 ${damageDealt} 피해를 주었지만 ${damageTaken} 피해를 받았다.`
      : `${encounter.enemy?.name ?? "상대"}에게 ${damageDealt} 피해를 주고 반격을 피했다.`;
  }
  if (damageTaken > 0) return `시도는 실패했고 ${damageTaken} 피해를 받았다.`;
  return success ? "선택한 행동이 상황을 해결하는 데 도움이 되었다." : "시도는 통하지 않았지만 다시 대응할 여지가 남았다.";
}

export function resolveSubwaySituationChoice(
  state: GameState,
  choiceId: string,
  expectedTurnNumber: number | undefined,
  rng: () => number = Math.random,
) {
  syncClock(state);
  const progress = state.subwayExpedition.currentFloorProgress;
  const encounter = progress.encounter;
  if (!state.subwayExpedition.active || !encounter) {
    throw new Error("진행 중인 지하철 상황이 없습니다.");
  }
  if (progress.phase !== "encounter" || encounter.stage === "resolved") {
    throw new Error("현재는 지하철 상황 선택을 처리할 수 없습니다.");
  }
  if (expectedTurnNumber !== encounter.turnNumber) {
    throw new Error("이미 지난 상황 선택입니다. 최신 상황에서 다시 선택해 주세요.");
  }
  const choice = selectedChoice(encounter, choiceId);
  if (!choice) {
    throw new Error("현재 상황에서 선택할 수 없는 행동입니다.");
  }
  const intent = choice.intent;
  if (
    intent.primary === "use_item" &&
    (!intent.itemId || availableItemAmount(state, intent.itemId) <= 0)
  ) {
    throw new Error("현재 사용할 수 없는 아이템입니다.");
  }
  const actionToken =
    choice.legacyActionToken ?? legacyTokenForIntent(intent);
  const incomingThreat = encounter.pendingThreat;
  encounter.pendingThreat = null;
  const statsBefore = { ...state.stats };
  const itemTotalsBefore = accessibleItemTotals(state);

  let actionRoll: number | null = null;
  let counterRoll: number | null = null;
  let success = true;
  let damageDealt = 0;
  let damageTaken = 0;
  let minutes = encounter.kind === "combat" ? 5 : 10;
  let resolution: SubwayEncounterTurnResult["resolution"] = null;
  let stageAfter: SubwayEncounterState["stage"] = encounter.stage;
  let itemToken: string | null = null;
  let relationshipChange = 0;
  let combatTurnXp = 0;

  if (encounter.kind === "combat") {
    const enemy = encounter.enemy;
    if (!enemy) throw new Error("전투 상대 정보가 없습니다.");
    if (intent.primary === "persuade") {
      const profile = combatActionProfile(state, encounter, actionToken);
      const chance = profile?.kind === "talk"
        ? profile.successChance
        : encounter.stage === "opening" ? 50 : 30;
      actionRoll = rollPercent(rng);
      success = actionRoll <= chance;
      if (success) {
        stageAfter = "resolved";
        resolution = "talked_down";
        relationshipChange = 10;
      } else {
        stageAfter = "active";
        relationshipChange = -5;
        if (incomingThreat) {
          const counterChance =
            profile?.kind === "talk"
              ? profile.counterChance
              : encounter.stage === "opening" ? 50 : 65;
          const counter = counterDamage(
            state,
            encounter,
            counterChance,
            rng,
          );
          counterRoll = counter.roll;
          damageTaken = counter.damage;
        }
      }
    } else if (intent.primary === "retreat" || intent.primary === "evade") {
      if (intent.primary === "evade" && incomingThreat) combatTurnXp = COMBAT_TURN_XP;
      actionRoll = rollPercent(rng);
      const profile = combatActionProfile(state, encounter, actionToken);
      const chance =
        intent.primary === "evade"
          ? 80
          : profile?.kind === "flee"
            ? profile.successChance
            : encounter.stage === "opening" ? 80 : 60;
      success = actionRoll <= chance;
      if (success && intent.primary === "retreat") {
        stageAfter = "resolved";
        resolution = "escaped";
      } else {
        stageAfter = "active";
        if (!success && incomingThreat) {
          const counterChance =
            profile?.kind === "flee"
              ? profile.counterChance
              : encounter.stage === "opening" ? 50 : 70;
          const counter = counterDamage(
            state,
            encounter,
            intent.primary === "evade"
              ? 100
              : counterChance,
            rng,
          );
          counterRoll = counter.roll;
          damageTaken = counter.damage;
        }
      }
    } else if (
      intent.primary === "defend" ||
      actionToken === "use_item:makeshiftShield"
    ) {
      const profile = combatActionProfile(state, encounter, actionToken);
      if (incomingThreat) combatTurnXp = COMBAT_TURN_XP;
      if (actionToken === "use_item:makeshiftShield") {
        itemToken = actionToken;
        damageTool(state, "makeshiftShield");
      }
      actionRoll = rollPercent(rng);
      success = actionRoll <= (
        profile?.kind === "guard" ? profile.successChance : 80
      );
      if (!success && incomingThreat) {
        const counter = counterDamage(state, encounter, 100, rng);
        counterRoll = counter.roll;
        damageTaken = Math.max(
          0,
          counter.damage -
            (profile?.kind === "guard" ? profile.damageReduction : 0),
        );
      }
      stageAfter = "active";
    } else {
      const initialProfile = combatActionProfile(state, encounter, actionToken);
      let hitChance =
        initialProfile?.kind === "attack" ? initialProfile.hitChance : 50;
      let attackDamage =
        initialProfile?.kind === "attack" ? initialProfile.damage : 0;
      let counterChance =
        initialProfile?.kind === "attack" ? initialProfile.counterChance : 65;
      if (intent.primary === "use_item" && intent.itemId) {
        itemToken = actionToken;
        const itemId = intent.itemId;
        const item = itemDefinition(itemId);
        if (item?.kind === "tool") {
          damageTool(state, itemId);
          const itemProfile = combatActionProfile(state, encounter, actionToken);
          hitChance = itemProfile?.kind === "attack" ? itemProfile.hitChance : 85;
          attackDamage = itemProfile?.kind === "attack" ? itemProfile.damage : 1;
          counterChance = itemProfile?.kind === "attack"
            ? itemProfile.counterChance
            : 60;
        } else {
          minutes = useRecoveryItem(state, itemId);
          if (incomingThreat) {
            const counter = counterDamage(state, encounter, 50, rng);
            counterRoll = counter.roll;
            damageTaken = counter.damage;
          }
          stageAfter = "active";
          hitChance = 0;
        }
      } else if (intent.primary !== "attack") {
        hitChance = 0;
      }
      if (hitChance > 0) {
        combatTurnXp = COMBAT_TURN_XP;
        actionRoll = rollPercent(rng);
        success = actionRoll <= hitChance;
        damageDealt = success ? attackDamage : 0;
        enemy.hp = Math.max(0, enemy.hp - damageDealt);
        if (enemy.hp <= 0) {
          stageAfter = "resolved";
          resolution = "victory";
        } else {
          if (incomingThreat) {
            const counter = counterDamage(state, encounter, counterChance, rng);
            counterRoll = counter.roll;
            damageTaken = counter.damage;
          }
          stageAfter = "active";
        }
      }
    }
  } else {
    actionRoll = rollPercent(rng);
    success = actionRoll <= nonCombatChance(actionToken, encounter.kind);
    if (intent.primary === "use_item" && intent.itemId) {
      itemToken = actionToken;
      const item = itemDefinition(intent.itemId);
      if (item?.kind === "tool") damageTool(state, intent.itemId);
      else minutes = useRecoveryItem(state, intent.itemId);
    }
    if (intent.primary === "retreat" && success) {
      stageAfter = "resolved";
      resolution = "escaped";
    } else if (success) {
      encounter.progress += 1;
      if (encounter.kind === "social" && intent.primary === "persuade") {
        relationshipChange = 10;
      }
      if (encounter.progress >= encounter.targetProgress) {
        stageAfter = "resolved";
        resolution = "resolved";
      } else {
        stageAfter = "active";
      }
    } else {
      encounter.failureCount += 1;
      if (
        encounter.kind === "social" &&
        (intent.primary === "persuade" || intent.style === "forceful")
      ) {
        relationshipChange = -5;
      }
      if (incomingThreat) {
        if (encounter.kind === "social" && intent.style !== "forceful") {
          changeSurvivalStat(state, "mind", -1);
        } else {
          damageTaken = 1;
        }
      }
      stageAfter = "active";
    }
    if (!resolution && encounter.turnNumber + 1 >= MAX_SITUATION_TURNS) {
      stageAfter = "resolved";
      resolution = "failed";
    }
  }

  if (damageTaken > 0) changeSurvivalStat(state, "hp", -damageTaken);
  advanceGameMinutes(state, minutes);
  syncClock(state);
  if (state.isGameOver || state.stats.hp <= 0) {
    stageAfter = "resolved";
    resolution = "player_defeated";
    success = false;
  }
  encounter.stage = stageAfter;
  encounter.resolution = resolution;
  encounter.turnNumber += 1;
  if (encounter.actor && relationshipChange !== 0) {
    encounter.actor.relationship = Math.max(
      -100,
      Math.min(100, encounter.actor.relationship + relationshipChange),
    );
  }
  const itemTotalsAfterAction = accessibleItemTotals(state);
  if (resolution === "victory") {
    addEncounterReward(state, encounter);
    applySubwayVictoryRecovery(state);
  }
  progress.phase = resolution ? "encounter_result" : "encounter";

  const result = SubwayEncounterTurnResultSchema.parse({
    selectedChoiceId: choice.id,
    selectedIntent: intent,
    selectedEffectDescription: choice.effectDescription,
    selectedActionToken: actionToken,
    selectedLabel: choice.label,
    success,
    rolls: { action: actionRoll, counter: counterRoll },
    damageDealt,
    damageTaken,
    minutes,
    playerHpAfter: state.stats.hp,
    enemyHpAfter: encounter.enemy?.hp ?? 0,
    progressAfter: encounter.progress,
    failureCountAfter: encounter.failureCount,
    relationshipChange,
    statChanges: (["hp", "mind", "energy"] as const).flatMap((stat) => {
      const amount = state.stats[stat] - statsBefore[stat];
      return amount === 0 ? [] : [{ stat, amount }];
    }),
    itemChanges: Array.from(new Set([
      ...Object.keys(itemTotalsBefore),
      ...Object.keys(itemTotalsAfterAction),
    ])).flatMap((itemId) => {
      const amount =
        (itemTotalsAfterAction[itemId] ?? 0) - (itemTotalsBefore[itemId] ?? 0);
      return amount === 0 ? [] : [{ itemId, amount }];
    }),
    toolDurabilityChanges: itemToken &&
      itemDefinition(itemToken.slice("use_item:".length))?.kind === "tool"
      ? [{ itemId: itemToken.slice("use_item:".length), amount: -1 }]
      : [],
    postChoiceNarrative: choice.postChoiceNarrative ?? [],
    stageAfter,
    resolution,
    summary: resultSummary(
      encounter,
      actionToken,
      success,
      damageDealt,
      damageTaken,
      resolution,
    ),
  });
  encounter.history.push({ turnNumber: encounter.turnNumber, result });
  encounter.history = encounter.history.slice(-20);
  encounter.currentScene = null;
  if (resolution) {
    state.subwayExpedition.lastOutcome = result.summary;
  }
  // Award only after this turn is resolved; its checks use the level before the action.
  const xp = addSkillXp(
    state.skillProgress,
    "combat",
    combatTurnXp + (resolution === "victory" ? COMBAT_VICTORY_XP : 0),
  );
  const noteEntries = encounterSystemNote(result, encounter);
  if (xp.gainedXp > 0) {
    noteEntries.push({ type: "text", text: `전투 숙련도 +${xp.gainedXp} XP`, tone: "positive" });
  }
  if (xp.nextLevel > xp.previousLevel) {
    noteEntries.push({ type: "text", text: `전투 숙련도 Lv.${xp.nextLevel} 달성`, tone: "positive" });
    appendLogEntry(state, `전투 숙련도가 Lv.${xp.nextLevel}로 올랐습니다.`);
  }
  setSystemNote(state, noteEntries);
  appendLogEntry(
    state,
    `지하 ${state.subwayExpedition.depth}층 상황: ${result.summary}`,
  );
  return result;
}

export const resolveSubwayBanditChoice = resolveSubwaySituationChoice;

export function acknowledgeSubwaySituationResult(state: GameState) {
  const progress = state.subwayExpedition.currentFloorProgress;
  const encounter = progress.encounter;
  if (!encounter || progress.phase !== "encounter_result" || !encounter.resolution) {
    throw new Error("확인할 지하철 상황 결과가 없습니다.");
  }
  if (encounter.resolution === "player_defeated") {
    throw new Error("이미 생존에 실패했습니다.");
  }
  progress.eventResolved = true;
  progress.eventChoiceLabel = encounter.history.at(-1)?.result.selectedLabel ?? "";
  progress.eventOutcome = encounter.history.at(-1)?.result.summary ?? "상황을 해결했다.";
  const upgrades = encounter.resolution === "victory"
    ? prepareSubwayUpgradeChoices(state)
    : [];
  progress.phase = upgrades.length > 0 ? "upgrade" : "complete";
  progress.currentResult = null;
  state.subwayExpedition.lastOutcome = progress.eventOutcome;
  state.subwayExpedition.storyMemory.facts = Array.from(new Set([
    ...state.subwayExpedition.storyMemory.facts,
    `지하 ${state.subwayExpedition.depth}층의 ${encounter.kind} 상황은 ${encounter.resolution} 상태로 끝났다.`,
  ])).slice(-12);
  state.subwayExpedition.storyMemory.recentSummaries.push(progress.eventOutcome);
  state.subwayExpedition.storyMemory.recentSummaries =
    state.subwayExpedition.storyMemory.recentSummaries.slice(-3);
  state.subwayExpedition.storyMemory.lastBridge =
    "상황이 끝난 층의 소란이 가라앉고, 아래층 계단과 대합실로 돌아가는 통로가 모두 열렸다.";
  appendLogEntry(state, progress.eventOutcome);
  return "continue" as const;
}

export const acknowledgeSubwayBanditResult = acknowledgeSubwaySituationResult;

export function markSubwaySituationGenerationFailed(
  state: GameState,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);
  const progress = state.subwayExpedition.currentFloorProgress;
  progress.phase = "generation_failed";
  progress.generationFailure = message;
  if (progress.encounter) progress.encounter.currentScene = null;
  setSystemNote(state, [
    { type: "text", text: "지하철 장면 생성 실패", tone: "negative" },
    { type: "text", text: "대합실 귀환 가능", tone: "neutral" },
  ]);
}

export function currentSubwayEncounterChoices(
  state: GameState,
): SubwayEncounterChoice[] {
  const progress = state.subwayExpedition.currentFloorProgress;
  if (progress.phase !== "encounter") return [];
  return structuredClone(progress.encounter?.currentScene?.choices ?? []);
}
