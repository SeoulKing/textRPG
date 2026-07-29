import { baseItems } from "./data/items";
import { advanceGameMinutes, syncClock } from "./rules";
import {
  SubwayEncounterSceneSchema,
  SubwayEncounterStateSchema,
  SubwayEncounterTurnResultSchema,
  type GameState,
  type SubwayEncounterActionId,
  type SubwayEncounterChoice,
  type SubwayEncounterScene,
  type SubwayEncounterState,
  type SubwayEncounterTurnResult,
  type SubwaySituationKind,
  type SystemNoteEntry,
} from "./schemas";
import { appendLogEntry, changeSurvivalStat } from "./state-utils";
import { setSystemNote } from "./system-note";

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

function itemEffectHint(itemId: string) {
  const item = itemDefinition(itemId);
  if (!item) return "";
  const parts = [`-1 ${item.name}`];
  if (item.effects.hp) parts.push(`+${item.effects.hp} 체력`);
  if (item.effects.mind) parts.push(`+${item.effects.mind} 정신력`);
  if (item.effects.energy) parts.push(`+${item.effects.energy} 기력`);
  parts.push(`+${item.useMinutes ?? 0}분`);
  return parts.join(" / ");
}

function recoveryItemActions(state: GameState): SubwayEncounterActionCatalogEntry[] {
  return Object.entries(state.inventory)
    .filter(([itemId, amount]) => {
      if (amount <= 0) return false;
      const item = itemDefinition(itemId);
      return Boolean(
        item &&
        (item.effects.hp > 0 || item.effects.mind > 0 || item.effects.energy > 0),
      );
    })
    .map(([itemId]) => ({
      actionToken: `use_item:${itemId}`,
      intent: `${itemName(itemId)}을 실제로 한 개 사용해 몸을 추스른다.`,
      mechanicalHint: itemEffectHint(itemId),
    }));
}

function toolItemActions(
  state: GameState,
  kind: SubwaySituationKind,
): SubwayEncounterActionCatalogEntry[] {
  const tools = [
    {
      itemId: "utilityKnife",
      combatHint: "간이 칼 내구도 -1 / 명중 90%: 적 3피해 / 반격 50%: 나 1피해 / +5분",
      otherHint: "간이 칼 내구도 -1 / 성공 90% / +10분",
    },
    {
      itemId: "crudeAxe",
      combatHint: "손도끼 내구도 -1 / 명중 85%: 적 4피해 / 반격 60%: 나 1피해 / +5분",
      otherHint: "손도끼 내구도 -1 / 성공 85% / +10분",
    },
  ];
  return tools
    .filter(({ itemId }) => (state.inventory[itemId] ?? 0) > 0)
    .map(({ itemId, combatHint, otherHint }) => ({
      actionToken: `use_item:${itemId}`,
      intent: `${itemName(itemId)}을 상황에 맞게 사용한다. 다른 물건으로 바꾸어 서술하지 않는다.`,
      mechanicalHint: kind === "combat" ? combatHint : otherHint,
    }));
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

function rollPercent(rng: () => number) {
  const raw = rng();
  const normalized = Number.isFinite(raw)
    ? Math.max(0, Math.min(1 - Number.EPSILON, raw))
    : 0;
  return Math.floor(normalized * 100) + 1;
}

function situationKindForDepth(depth: number): SubwaySituationKind {
  if (depth === 1) return "combat";
  return (["hazard", "social", "combat"] as const)[(depth - 2) % 3];
}

export function subwaySituationActionCatalog(
  state: GameState,
  encounter = state.subwayExpedition.currentFloorProgress.encounter,
) {
  if (!encounter || encounter.stage === "resolved") {
    return [];
  }
  if (encounter.kind === "combat") {
    if (encounter.stage === "opening") {
      return structuredClone(OPENING_COMBAT_ACTIONS);
    }
    return [
      ...structuredClone(ACTIVE_COMBAT_ACTIONS),
      ...toolItemActions(state, "combat"),
      ...recoveryItemActions(state),
    ];
  }
  const common = encounter.kind === "social" ? SOCIAL_ACTIONS : HAZARD_ACTIONS;
  return [
    ...structuredClone(common),
    ...toolItemActions(state, encounter.kind),
  ];
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
  actionToken: SubwayEncounterActionId,
) {
  return encounter.currentScene?.choices.find(
    (choice) => choice.actionToken === actionToken,
  );
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

function damageTool(state: GameState, itemId: string) {
  const item = itemDefinition(itemId);
  const maxDurability = item?.maxDurability ?? 0;
  if (maxDurability <= 0 || (state.inventory[itemId] ?? 0) <= 0) {
    throw new Error("현재 사용할 수 없는 도구입니다.");
  }
  const current = state.toolDurability[itemId] ?? maxDurability;
  const next = current - 1;
  if (next > 0) {
    state.toolDurability[itemId] = next;
    return;
  }
  const remaining = (state.inventory[itemId] ?? 0) - 1;
  if (remaining > 0) {
    state.inventory[itemId] = remaining;
    state.toolDurability[itemId] = maxDurability;
  } else {
    delete state.inventory[itemId];
    delete state.toolDurability[itemId];
  }
}

function useRecoveryItem(state: GameState, itemId: string) {
  const item = itemDefinition(itemId);
  if (!item || (state.inventory[itemId] ?? 0) <= 0) {
    throw new Error("현재 사용할 수 없는 아이템입니다.");
  }
  if (!item.effects.hp && !item.effects.mind && !item.effects.energy) {
    throw new Error("이 상황에서 사용할 효과가 없는 아이템입니다.");
  }
  state.inventory[itemId] -= 1;
  if (state.inventory[itemId] <= 0) delete state.inventory[itemId];
  changeSurvivalStat(state, "hp", item.effects.hp);
  changeSurvivalStat(state, "mind", item.effects.mind);
  changeSurvivalStat(state, "energy", item.effects.energy);
  return item.useMinutes ?? 0;
}

function counterDamage(
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
    damage: roll <= chance ? encounter.enemy.attack : 0,
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

function createEnemy(depth: number) {
  const maxHp = Math.min(8, 4 + Math.floor(Math.max(0, depth - 2) / 4));
  return {
    id: depth === 1 ? "subway_bandit" : `subway_raider_${depth}`,
    name: depth === 1 ? "강도" : "약탈자",
    maxHp,
    hp: maxHp,
    attack: depth >= 11 ? 2 : 1,
    description: depth === 1
      ? "해진 패딩과 천 마스크를 쓴 약탈자다. 짧은 쇠막대를 쥔 채 지하 1층 통로를 막고 있다."
      : "지하 통로를 자기 영역처럼 지키는 무장한 생존자 한 명이다.",
    traits: ["human", "hostile", "subway"],
  };
}

export function createSubwaySituation(state: GameState) {
  const floor = state.subwayExpedition.currentFloor;
  if (!floor) throw new Error("상황을 만들 지하철 층이 없습니다.");
  const kind = floor.depth === 1
    ? "combat"
    : (floor.situationKind ?? situationKindForDepth(floor.depth));
  return SubwayEncounterStateSchema.parse({
    id: floor.depth === 1
      ? `${SUBWAY_BANDIT_ENCOUNTER_ID}:${state.subwayExpedition.runNumber}`
      : `subway_${kind}_${state.subwayExpedition.runNumber}_${floor.depth}`,
    kind,
    objective: floor.majorEvent.resolutionGoal,
    enemy: kind === "combat" ? createEnemy(floor.depth) : null,
    stage: "opening",
    resolution: null,
    turnNumber: 0,
    progress: 0,
    targetProgress: kind === "combat" ? 1 : 2,
    failureCount: 0,
    currentScene: null,
    history: [],
    rewardItems: floor.depth === 1
      ? [
          { itemId: "cannedFood", amount: 1 },
          { itemId: "painRelief", amount: 1 },
        ]
      : [],
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
  actionToken: SubwayEncounterActionId,
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
  const choice = selectedChoice(encounter, actionToken);
  const allowed = new Set(
    subwaySituationActionCatalog(state, encounter).map((entry) => entry.actionToken),
  );
  if (!choice || !allowed.has(actionToken)) {
    throw new Error("현재 상황에서 선택할 수 없는 행동입니다.");
  }
  const statsBefore = { ...state.stats };
  const inventoryBefore = { ...state.inventory };

  let actionRoll: number | null = null;
  let counterRoll: number | null = null;
  let success = true;
  let damageDealt = 0;
  let damageTaken = 0;
  let minutes = encounter.kind === "combat" ? 5 : 10;
  let resolution: SubwayEncounterTurnResult["resolution"] = null;
  let stageAfter: SubwayEncounterState["stage"] = encounter.stage;
  let itemToken: string | null = null;

  if (encounter.kind === "combat") {
    const enemy = encounter.enemy;
    if (!enemy) throw new Error("전투 상대 정보가 없습니다.");
    if (actionToken === "talk") {
      const chance = encounter.stage === "opening" ? 50 : 30;
      actionRoll = rollPercent(rng);
      success = actionRoll <= chance;
      if (success) {
        stageAfter = "resolved";
        resolution = "talked_down";
      } else {
        stageAfter = "active";
        const counter = counterDamage(encounter, encounter.stage === "opening" ? 50 : 65, rng);
        counterRoll = counter.roll;
        damageTaken = counter.damage;
      }
    } else if (actionToken === "flee") {
      actionRoll = rollPercent(rng);
      success = actionRoll <= (encounter.stage === "opening" ? 80 : 60);
      if (success) {
        stageAfter = "resolved";
        resolution = "escaped";
      } else {
        stageAfter = "active";
        const counter = counterDamage(encounter, encounter.stage === "opening" ? 50 : 70, rng);
        counterRoll = counter.roll;
        damageTaken = counter.damage;
      }
    } else if (actionToken === "guard") {
      actionRoll = rollPercent(rng);
      success = actionRoll <= 80;
      if (!success) {
        const counter = counterDamage(encounter, 100, rng);
        counterRoll = counter.roll;
        damageTaken = counter.damage;
      }
      stageAfter = "active";
    } else {
      const isCloseAttack = actionToken === "close_attack" || actionToken === "fight";
      let hitChance = isCloseAttack ? 80 : 65;
      let attackDamage = isCloseAttack ? 2 : 1;
      let counterChance = isCloseAttack ? 60 : 35;
      if (actionToken.startsWith("use_item:")) {
        itemToken = actionToken;
        const itemId = actionToken.slice("use_item:".length);
        const item = itemDefinition(itemId);
        if (item?.kind === "tool") {
          damageTool(state, itemId);
          if (itemId === "utilityKnife") {
            hitChance = 90;
            attackDamage = 3;
            counterChance = 50;
          } else {
            hitChance = 85;
            attackDamage = 4;
            counterChance = 60;
          }
        } else {
          minutes = useRecoveryItem(state, itemId);
          const counter = counterDamage(encounter, 50, rng);
          counterRoll = counter.roll;
          damageTaken = counter.damage;
          stageAfter = "active";
          hitChance = 0;
        }
      }
      if (hitChance > 0) {
        actionRoll = rollPercent(rng);
        success = actionRoll <= hitChance;
        damageDealt = success ? attackDamage : 0;
        enemy.hp = Math.max(0, enemy.hp - damageDealt);
        if (enemy.hp <= 0) {
          stageAfter = "resolved";
          resolution = "victory";
        } else {
          const counter = counterDamage(encounter, counterChance, rng);
          counterRoll = counter.roll;
          damageTaken = counter.damage;
          stageAfter = "active";
        }
      }
    }
  } else {
    actionRoll = rollPercent(rng);
    success = actionRoll <= nonCombatChance(actionToken, encounter.kind);
    if (actionToken.startsWith("use_item:")) {
      itemToken = actionToken;
      damageTool(state, actionToken.slice("use_item:".length));
    }
    if (actionToken === "flee" && success) {
      stageAfter = "resolved";
      resolution = "escaped";
    } else if (success) {
      encounter.progress += 1;
      if (encounter.progress >= encounter.targetProgress) {
        stageAfter = "resolved";
        resolution = "resolved";
      } else {
        stageAfter = "active";
      }
    } else {
      encounter.failureCount += 1;
      if (encounter.kind === "social" && actionToken !== "force") {
        changeSurvivalStat(state, "mind", -1);
      } else {
        damageTaken = 1;
      }
      stageAfter = "active";
    }
    if (!resolution && encounter.turnNumber + 1 >= MAX_SITUATION_TURNS) {
      stageAfter = "resolved";
      resolution = "failed";
    }
  }

  if (
    encounter.kind === "combat" &&
    !resolution &&
    encounter.turnNumber + 1 >= MAX_SITUATION_TURNS
  ) {
    stageAfter = "resolved";
    resolution = "failed";
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
  if (resolution === "victory") addEncounterReward(state, encounter);
  progress.phase = resolution ? "encounter_result" : "encounter";

  const result = SubwayEncounterTurnResultSchema.parse({
    selectedActionToken: actionToken,
    selectedLabel: actionToken === "fight" ? "기습한다" : choice.label,
    success,
    rolls: { action: actionRoll, counter: counterRoll },
    damageDealt,
    damageTaken,
    minutes,
    playerHpAfter: state.stats.hp,
    enemyHpAfter: encounter.enemy?.hp ?? 0,
    progressAfter: encounter.progress,
    failureCountAfter: encounter.failureCount,
    statChanges: (["hp", "mind", "energy"] as const).flatMap((stat) => {
      const amount = state.stats[stat] - statsBefore[stat];
      return amount === 0 ? [] : [{ stat, amount }];
    }),
    itemChanges: Array.from(new Set([
      ...Object.keys(inventoryBefore),
      ...Object.keys(state.inventory),
    ])).flatMap((itemId) => {
      const amount = (state.inventory[itemId] ?? 0) - (inventoryBefore[itemId] ?? 0);
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
  setSystemNote(state, encounterSystemNote(result, encounter));
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
  progress.phase = "complete";
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
