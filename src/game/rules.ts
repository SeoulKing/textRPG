import { currentContentVersionId } from "./content-versions";
import { advanceConditions, minutesToConditionEvent, normalizeHealthConditions, checkHealthFailure, applyTreatment, canApplyTreatment, CONDITION_LABELS, SLEEP_CONDITION_RATE } from "./health-conditions";
import {
  AUTO_ENERGY_TICK_MS,
  GAME_MINUTE_MS,
  PHASE_DURATION_MS,
  PHASES,
  REAL_DAY_MS,
  SAVE_VERSION,
  EXHAUSTION_TICK_MS,
  TARGET_RESCUE_DAY,
  TRAVEL_DURATION_MS,
} from "./base-data";
import { actionConditionsMet, choiceConditionsMet, resolveNextSceneDefinition, resolveSceneDefinition } from "./content-engine";
import { resolveItemText } from "./item-text";
import { buildRuntimeRegistry, getQuestDefinitions, getRuntimeLocationDefinition } from "./runtime-registry";
import {
  appendLogEntry,
  applyEffect,
  changeSurvivalStat,
  consumeDailyUse,
  evaluateCondition,
  getRemainingDailyUses,
  evaluateObjective,
  getStockMoneyKey,
  getStockStateKey,
  isStockNodeGone,
  isTimeEffect,
} from "./state-utils";
import type {
  ActionDefinition,
  ChoiceDefinition,
  DayEvolutionUpdate,
  Effect,
  GameAction,
  GameState,
  SkillId,
  SkillUse,
  SystemNoteEntry,
} from "./schemas";
import {
  PROGRESSION_SKILLS,
  addSkillXp,
  createEmptySkillProgress,
  getProgressionSkillLevel,
  getSkillXpForMinutes,
  resolveSkillAdjustedMinutes,
} from "./skill-progression";
import { clearSystemNote, setSystemNote } from "./system-note";

const STAT_LABELS = {
  hp: "체력",
  mind: "정신력",
  energy: "기력",
} as const;

function adjustStat(state: GameState, statKey: "hp" | "mind" | "energy", delta: number) {
  changeSurvivalStat(state, statKey, delta);
}

function hasItemAmount(state: GameState, itemId: string, amount = 1) {
  return (state.inventory[itemId] ?? 0) >= amount;
}

function setClockFromElapsed(state: GameState) {
  const totalElapsed = Math.max(0, state.worldElapsedMs || 0);
  state.worldElapsedMs = totalElapsed;
  state.day = Math.floor(totalElapsed / REAL_DAY_MS) + 1;
  state.phaseIndex = Math.min(
    PHASES.length - 1,
    Math.floor((totalElapsed % REAL_DAY_MS) / PHASE_DURATION_MS),
  );
}

function activeDayKey(state: GameState, name: string) {
  return `day${state.day}_${name}`;
}

function addLog(state: GameState, message: string) {
  appendLogEntry(state, message);
}

export function syncQuestState(
  state: GameState,
  previousQuests: Record<string, "inactive" | "active" | "completed"> = state.quests,
) {
  const registry = buildRuntimeRegistry(state);
  for (const def of getQuestDefinitions(registry)) {
    const prereqPass = def.prerequisites.every((condition) => evaluateCondition(condition, state));
    if (!prereqPass) {
      state.quests[def.id] = "inactive";
      continue;
    }

    const allObjectivesMet = def.objectives.every((objective) => evaluateObjective(objective, state));
    if (!allObjectivesMet) {
      state.quests[def.id] = "active";
      continue;
    }

    state.quests[def.id] = "completed";
    if (previousQuests[def.id] === "completed" || state.flags[`quest_rewarded_${def.id}`]) {
      continue;
    }

    def.rewards.forEach((reward) => {
      applyEffect(
        reward.type === "money"
          ? { type: "change_money", amount: reward.amount }
          : reward.type === "add_item"
            ? { type: "add_item", itemId: reward.itemId, amount: reward.amount }
            : { type: "set_flag", flag: reward.flag },
        state,
      );
    });

    if (def.rewards.length > 0) {
      state.flags[`quest_rewarded_${def.id}`] = true;
      addLog(state, `퀘스트 보상을 받았다: ${def.title}`);
    }
  }
}

function markLocationKnown(state: GameState, locationId: string) {
  state.flags[`known_${locationId}`] = true;
}

const DISCOVERY_UNLOCK_FLAGS: Record<string, string[]> = {
  hospital: ["hospital_lead_checked", "visited_convenience", "visited_hospital"],
  river: ["visited_convenience", "visited_forest", "visited_hospital", "visited_river"],
  checkpoint: ["checkpoint_lead_checked", "visited_subway", "visited_checkpoint"],
  arcana_plaza: ["magic_world_entered_once", "visited_arcana_plaza"],
  arcana_hunting_ground: ["visited_arcana_plaza", "visited_arcana_hunting_ground"],
};

function normalizeExplorationKnowledge(state: GameState) {
  for (const location of Object.values(buildRuntimeRegistry(state).locations)) {
    if (location.discoveryConditions?.every(condition => evaluateCondition(condition, state))) state.flags[`known_${location.id}`] = true;
  }
  state.flags.known_convenience = true;
  state.flags.known_kitchen = true;
  state.flags.known_forest = true;
  state.flags.known_subway = true;
  state.flags.known_magic_city_entrance = true;

  Object.entries(DISCOVERY_UNLOCK_FLAGS).forEach(([locationId, unlockFlags]) => {
    if (unlockFlags.some((flag) => state.flags[flag])) {
      state.flags[`known_${locationId}`] = true;
      return;
    }
    delete state.flags[`known_${locationId}`];
  });
}

export function refreshLocationKnowledge(state: GameState) {
  markLocationKnown(state, state.location);
  state.flags[`visited_${state.location}`] = true;
  normalizeExplorationKnowledge(state);
}

function relieveExhaustion(state: GameState, amount = 1) {
  state.exhaustionLevel = Math.max(0, state.exhaustionLevel - amount);
}

function triggerGameOver(state: GameState, reason: string) {
  if (state.isGameOver || state.stageClear) {
    return;
  }
  state.isGameOver = true;
  state.gameOverReason = reason;
  setSystemNote(state, [{ type: "text", text: reason, tone: "negative" }]);
  addLog(state, `생존 실패: ${reason}`);
}

function triggerStageClear(state: GameState) {
  if (state.isGameOver || state.stageClear) {
    return;
  }
  state.stageClear = true;
  setSystemNote(state, [{
    type: "text",
    text: "구조 신호가 닿았다. 멀리서 헬기 소리가 서울의 먼지 낀 하늘을 갈라 온다.",
    tone: "positive",
  }]);
  addLog(state, "10일차 아침, 조립한 무전기가 구조대에 좌표를 보냈다. 당신은 구조 신호가 닿았다는 응답을 듣는다.");
}

function evaluateSurvivalOutcome(state: GameState) {
  checkHealthFailure(state);
  if (state.isGameOver || state.stageClear) {
    return;
  }

  if (state.stats.hp <= 0) {
    triggerGameOver(state, "몸이 더는 생존을 버티지 못했다.");
    return;
  }

  if (state.day >= TARGET_RESCUE_DAY) {
    if (state.flags.rescue_signal_ready) {
      triggerStageClear(state);
      return;
    }
    triggerGameOver(state, "10일차 구조 신호를 보낼 장비가 완성되지 않아 구조 기회를 놓쳤다.");
  }
}

function elapsedTimeMinutes(elapsedMs: number) {
  const totalMinutes = Math.round((Math.max(0, elapsedMs) / REAL_DAY_MS) * 24 * 60);
  return Math.max(0, totalMinutes);
}

function questTitle(state: GameState, questId: string) {
  const registry = buildRuntimeRegistry(state);
  return getQuestDefinitions(registry).find((quest) => quest.id === questId)?.title ?? questId;
}

function itemName(state: GameState, itemId: string) {
  const registry = buildRuntimeRegistry(state);
  const item = registry.items[itemId] as { name?: string } | undefined;
  return String(item?.name ?? itemId);
}

function locationName(state: GameState, locationId: string) {
  const registry = buildRuntimeRegistry(state);
  return String(registry.locations[locationId]?.name ?? locationId);
}

function summarizeSystemNoteEntries(
  previousState: GameState,
  nextState: GameState,
  fallback = "",
): SystemNoteEntry[] {
  const nextRegistry = buildRuntimeRegistry(nextState);
  const entries: SystemNoteEntry[] = [];

  if (!previousState.isGameOver && nextState.isGameOver && nextState.gameOverReason) {
    return [{
      type: "text",
      text: nextState.gameOverReason,
      tone: "negative",
    }] satisfies SystemNoteEntry[];
  }

  if (previousState.location !== nextState.location) {
    entries.push({
      type: "text",
      text: `이동: ${String(nextRegistry.locations[nextState.location]?.name ?? nextState.location)}`,
      tone: "neutral",
    });
  }

  for (const kind of ["injury", "infection"] as const) {
    const before = previousState.conditions[kind].level;
    const after = nextState.conditions[kind].level;
    if (before !== after) entries.push({ type: "text", text: `${CONDITION_LABELS[kind]} Lv${before} → Lv${after}`, tone: after > before ? "negative" : "positive" });
  }

  const elapsedMinutes = elapsedTimeMinutes(
    nextState.worldElapsedMs - previousState.worldElapsedMs,
  );

  Object.keys(nextRegistry.locations).forEach((locationId) => {
    const wasKnown = Boolean(previousState.flags[`known_${locationId}`] || previousState.flags[`visited_${locationId}`]);
    const isKnown = Boolean(nextState.flags[`known_${locationId}`] || nextState.flags[`visited_${locationId}`]);
    if (!wasKnown && isKnown) {
      entries.push({
        type: "text",
        text: `신규 지역: ${locationName(nextState, locationId)}`,
        tone: "positive",
      });
    }
  });

  (Object.keys(STAT_LABELS) as Array<keyof typeof STAT_LABELS>).forEach((statKey) => {
    const delta = nextState.stats[statKey] - previousState.stats[statKey];
    if (delta !== 0) {
      const label = statKey === "mind" && nextState.flags.in_magic_world
        ? "MP"
        : STAT_LABELS[statKey];
      entries.push({
        type: "delta",
        subject: "stat",
        label,
        amount: delta,
      });
    }
  });

  const moneyDelta = nextState.money - previousState.money;
  if (moneyDelta !== 0) {
    entries.push({
      type: "delta",
      subject: "money",
      label: "원",
      amount: moneyDelta,
    });
  }

  const toolIds = new Set<string>([
    ...Object.keys(previousState.toolDurability || {}),
    ...Object.keys(nextState.toolDurability || {}),
  ]);
  toolIds.forEach((itemId) => {
    const previousDurability = previousState.toolDurability?.[itemId];
    const nextDurability = nextState.toolDurability?.[itemId];
    if (typeof previousDurability !== "number") {
      return;
    }
    if ((nextState.inventory[itemId] ?? 0) <= 0) {
      entries.push({
        type: "text",
        text: `${itemName(nextState, itemId)} 파손`,
        tone: "negative",
      });
      return;
    }
    if (typeof nextDurability === "number" && nextDurability < previousDurability) {
      entries.push({
        type: "delta",
        subject: "durability",
        label: itemName(nextState, itemId),
        itemId,
        amount: -(previousDurability - nextDurability),
      });
    }
  });

  const itemIds = new Set<string>([
    ...Object.keys(previousState.inventory || {}),
    ...Object.keys(nextState.inventory || {}),
  ]);
  itemIds.forEach((itemId) => {
    const delta = (nextState.inventory[itemId] ?? 0) - (previousState.inventory[itemId] ?? 0);
    if (delta !== 0) {
      entries.push({
        type: "delta",
        subject: "item",
        label: itemName(nextState, itemId),
        itemId,
        amount: delta,
      });
    }
  });

  const questIds = new Set<string>([
    ...Object.keys(previousState.quests || {}),
    ...Object.keys(nextState.quests || {}),
  ]);
  questIds.forEach((questId) => {
    const previousStatus = previousState.quests[questId];
    const nextStatus = nextState.quests[questId];
    if (previousStatus !== "completed" && nextStatus === "completed") {
      entries.push({
        type: "text",
        text: `퀘스트 완료: ${questTitle(nextState, questId)}`,
        tone: "positive",
      });
    } else if ((previousStatus === "inactive" || !previousStatus) && nextStatus === "active") {
      entries.push({
        type: "text",
        text: `퀘스트 시작: ${questTitle(nextState, questId)}`,
        tone: "neutral",
      });
    }
  });

  getSkillLevelUps(previousState, nextState).forEach(({ skillId, nextLevel }) => {
    entries.push({
      type: "text",
      text: `${PROGRESSION_SKILLS[skillId].name} 숙련도 Lv.${nextLevel} 달성`,
      tone: "positive",
    });
  });

  if (elapsedMinutes > 0) {
    entries.push({ type: "time", minutes: elapsedMinutes });
  }

  const stockFocusChanged = previousState.activeStockNodeId !== nextState.activeStockNodeId;
  const previousDiscovered = new Set(previousState.discoveredStockNodeIds || []);
  const stockDiscoveryChanged = (nextState.discoveredStockNodeIds || []).some((nodeId) => !previousDiscovered.has(nodeId));
  if (entries.length === 0 && (stockFocusChanged || stockDiscoveryChanged)) {
    return [];
  }

  return entries.length > 0
    ? entries
    : fallback
      ? [{ type: "text", text: fallback, tone: "neutral" }]
      : [];
}

function getSkillLevelUps(previousState: GameState, nextState: GameState) {
  return (Object.keys(PROGRESSION_SKILLS) as SkillId[])
    .map((skillId) => ({
      skillId,
      previousLevel: getProgressionSkillLevel(previousState.skillProgress, skillId),
      nextLevel: getProgressionSkillLevel(nextState.skillProgress, skillId),
    }))
    .filter(({ previousLevel, nextLevel }) => nextLevel > previousLevel);
}

export function applySystemNote(previousState: GameState, nextState: GameState, fallback = "") {
  const skillLevelUps = getSkillLevelUps(previousState, nextState);
  skillLevelUps.forEach(({ skillId, nextLevel }) => {
    appendLogEntry(
      nextState,
      `${PROGRESSION_SKILLS[skillId].name} 숙련도가 Lv.${nextLevel}로 올랐습니다.`,
    );
  });

  if ((nextState.isGameOver || nextState.stageClear) && nextState.systemNote) {
    const levelUpEntries: SystemNoteEntry[] = skillLevelUps.map(
      ({ skillId, nextLevel }) =>
        ({
          type: "text",
          text: `${PROGRESSION_SKILLS[skillId].name} 숙련도 Lv.${nextLevel} 달성`,
          tone: "positive",
        }),
    );
    if (levelUpEntries.length > 0) {
      const existingEntries = nextState.systemNoteEntries.length > 0
        ? nextState.systemNoteEntries
        : [{
            type: "text" as const,
            text: nextState.systemNote,
            tone: "neutral" as const,
          }];
      setSystemNote(nextState, [...existingEntries, ...levelUpEntries]);
    }
    return;
  }

  const nextEntries = summarizeSystemNoteEntries(previousState, nextState, fallback);
  if (nextEntries.length > 0) {
    setSystemNote(nextState, nextEntries);
    return;
  }

  clearSystemNote(nextState);
}

export function syncScene(state: GameState, preferredSceneId?: string) {
  const registry = buildRuntimeRegistry(state);
  const scene =
    preferredSceneId !== undefined && preferredSceneId !== ""
      ? resolveNextSceneDefinition(state, registry, state.location, preferredSceneId)
      : resolveSceneDefinition(state, registry, state.location);
  state.sceneId = scene.id;
  if (scene.completionFlag) state.flags[scene.completionFlag] = true;
  state.activeEventId = scene.eventId ?? null;
}

function closeShelterSubmenus(state: GameState) {
  delete state.flags.shelter_crafting_open;
  delete state.flags.shelter_cooking_open;
}

function applyEvolutionUpdate(state: GameState, update: DayEvolutionUpdate) {
  switch (update.type) {
    case "stock_item":
      state.stockState[getStockStateKey(update.locationId, update.nodeId, update.itemId)] = Math.max(0, update.quantity);
      break;
    case "stock_money":
      state.stockState[getStockMoneyKey(update.locationId, update.nodeId)] = Math.max(0, update.amount);
      break;
    case "move_person": {
      const person = state.dynamicContent.people[update.personId];
      if (!person) {
        break;
      }
      const previousLocationId = person.locationId;
      person.locationId = update.locationId;
      if (update.summary) {
        person.summary = update.summary;
      }
      if (update.relationToPlayer) {
        person.relationToPlayer = update.relationToPlayer;
      }
      const previousLocation = state.dynamicContent.locations[previousLocationId];
      if (previousLocation) {
        previousLocation.residentIds = previousLocation.residentIds.filter((residentId) => residentId !== update.personId);
      }
      const nextLocation = state.dynamicContent.locations[update.locationId];
      if (nextLocation && !nextLocation.residentIds.includes(update.personId)) {
        nextLocation.residentIds.push(update.personId);
      }
      break;
    }
    case "scene_text": {
      const scene = state.dynamicContent.scenes[update.sceneId];
      if (!scene) {
        break;
      }
      if (update.title) {
        scene.title = update.title;
      }
      if (update.paragraphs) {
        scene.paragraphs = [...update.paragraphs];
      }
      break;
    }
    case "location_text": {
      const location = state.dynamicContent.locations[update.locationId];
      if (!location) {
        break;
      }
      if (update.summary) {
        location.summary = update.summary;
      }
      if (update.traits) {
        location.traits = [...update.traits];
      }
      if (update.tags) {
        location.tags = [...update.tags];
      }
      break;
    }
    case "activate_quest":
      if (state.quests[update.questId] !== "completed") {
        state.quests[update.questId] = "active";
      }
      break;
    case "complete_quest":
      state.quests[update.questId] = "completed";
      break;
    case "set_flag":
      state.flags[update.flag] = true;
      break;
    case "clear_flag":
      delete state.flags[update.flag];
      break;
  }
}

function applyPlannedWorldEvolution(state: GameState) {
  const tomorrow = state.worldPlan.tomorrow;
  if (!tomorrow || tomorrow.day !== state.day) {
    return;
  }

  tomorrow.evolutions.forEach((evolution) => {
    evolution.updates.forEach((update) => applyEvolutionUpdate(state, update));
    addLog(state, evolution.summary);
  });

  state.worldPlan.today = {
    day: state.day,
    regions: [...state.worldPlan.today.regions],
    notes: [...tomorrow.notes],
  };
  state.worldPlan.tomorrow = {
    day: state.day + 1,
    evolutions: [],
    notes: [],
  };
}

function applySurvivalMilestone(state: GameState) {
  if (state.day === 2 && !state.flags.day2_refugee_crowd) {
    state.flags.day2_refugee_crowd = true;
    addLog(state, "피난민이 눈에 띄게 늘었다. 급식소의 줄은 더 길어졌고, 따뜻한 식사의 값도 조금 올랐다.");
    return;
  }

  if (state.day === 4 && !state.flags.day4_hospital_hint) {
    state.flags.day4_hospital_hint = true;
    addLog(state, "편의점 폐허 뒤편 골목에 작은 병원이 있다는 소문이 돈다. 직접 길을 확인해야 지도에 남길 수 있다.");
    return;
  }

  if (state.day === 6 && !state.flags.day6_subway_hint) {
    state.flags.day6_subway_hint = true;
    addLog(state, "급식소 뒤편 통로 아래에 지하철역이 이어진다는 이야기가 들린다. 어두운 길은 직접 살펴야 한다.");
    return;
  }

  if (state.day === 8 && !state.flags.day8_checkpoint_hint) {
    state.flags.day8_checkpoint_hint = true;
    addLog(state, "지하철역 반대편 출구 너머 검문소에 구조대 무전 기록이 남았다는 소문이 퍼진다.");
    return;
  }

  if (state.day === TARGET_RESCUE_DAY && !state.flags.day10_rescue_judgement) {
    state.flags.day10_rescue_judgement = true;
    addLog(state, "10일차 아침이 밝았다. 구조대가 근처를 훑고 지나가기 전에 신호를 보낼 수 있어야 한다.");
  }
}

function applyDayTransition(state: GameState, previousDay: number) {
  if (state.day === previousDay) {
    return;
  }

  state.autoEnergyElapsedMs = 0;
  state.exhaustionElapsedMs = 0;
  delete state.flags.rain_bucket_drawn_today;
  state.flags[`day${state.day}_mealSecured`] = false;
  state.flags[`day${state.day}_waterSecured`] = false;
  state.lastSleepEnergy = state.stats.energy;
  applyPlannedWorldEvolution(state);
  applySurvivalMilestone(state);
  addLog(state, `${state.day}일차가 시작되었다.`);
}

function applySurvivalPressureForElapsed(
  state: GameState,
  elapsed: number,
  energyDrainMultiplier = 1,
) {
  state.autoEnergyElapsedMs += elapsed * Math.max(0, energyDrainMultiplier);
  while (state.autoEnergyElapsedMs >= AUTO_ENERGY_TICK_MS) {
    state.autoEnergyElapsedMs -= AUTO_ENERGY_TICK_MS;
    adjustStat(state, "energy", -1);
  }

  if (state.stats.energy === 0) {
    state.exhaustionElapsedMs += elapsed;
    while (state.exhaustionElapsedMs >= EXHAUSTION_TICK_MS) {
      state.exhaustionElapsedMs -= EXHAUSTION_TICK_MS;
      state.exhaustionLevel += 1;
    }
  } else {
    state.exhaustionElapsedMs = 0;
  }
}

function advanceGameTime(
  state: GameState,
  elapsed: number,
  options: { energyDrainMultiplier?: number; conditionRate?: number; onConditionDamage?: (amount: number) => void } = {},
) {
  if (state.isGameOver || state.stageClear) {
    return;
  }

  const safeElapsed = Math.max(0, elapsed);
  if (safeElapsed === 0) {
    return;
  }

  checkHealthFailure(state);
  const conditionRate = options.conditionRate ?? 1;
  const energyRate = options.energyDrainMultiplier ?? 1;
  let remaining = safeElapsed;
  while (remaining > 1e-7 && !state.isGameOver && !state.stageClear) {
    const previousDay = state.day;
    const untilDaybreak = REAL_DAY_MS - state.worldElapsedMs % REAL_DAY_MS;
    const untilEnergy = energyRate > 0 ? Math.max(0, AUTO_ENERGY_TICK_MS - state.autoEnergyElapsedMs) / energyRate : Infinity;
    const untilCondition = minutesToConditionEvent(state) * GAME_MINUTE_MS / conditionRate;
    const step = Math.min(remaining, untilDaybreak, untilEnergy, untilCondition);
    state.worldElapsedMs += step;
    setClockFromElapsed(state);
    applySurvivalPressureForElapsed(state, step, energyRate);
    const damage = advanceConditions(state, step / GAME_MINUTE_MS * conditionRate);
    if (damage > 0) options.onConditionDamage?.(damage);
    if (!state.isGameOver) applyDayTransition(state, previousDay);
    evaluateSurvivalOutcome(state);
    remaining -= step;
  }
  // The world clock is stored in milliseconds; fractional event boundaries can
  // arise when a partially progressed condition changes level.
  state.worldElapsedMs = Math.round(state.worldElapsedMs);
  state.autoEnergyElapsedMs = Math.round(state.autoEnergyElapsedMs);
  state.exhaustionElapsedMs = Math.round(state.exhaustionElapsedMs);
  refreshLocationKnowledge(state);
}

export function advanceGameMinutes(state: GameState, minutes: number, options: { onConditionDamage?: (amount: number) => void } = {}) {
  checkHealthFailure(state);
  if (state.isGameOver || state.stageClear) return;
  if (state.phaseIndex >= PHASES.length - 1) {
    adjustStat(state, "hp", -1);
    if (state.stats.mind > 0) {
      adjustStat(state, "mind", -1);
    }
    addLog(state, "밤이 깊은 뒤에도 움직인 탓에 몸과 마음이 동시에 깎여 나간다.");
  }
  advanceGameTime(state, GAME_MINUTE_MS * Math.max(1, minutes), options);
}

function advanceTravelTime(state: GameState) {
  advanceGameTime(state, TRAVEL_DURATION_MS);
}

export function syncClock(state: GameState, now = Date.now()) {
  state.lastRealTimestamp = now;
  setClockFromElapsed(state);
  refreshLocationKnowledge(state);
  evaluateSurvivalOutcome(state);
}

export function createInitialGameState(): GameState {
  const now = Date.now();
  const registry = buildRuntimeRegistry();
  const state: GameState = {
    saveVersion: SAVE_VERSION,
    conditions: normalizeHealthConditions(undefined),
    contentVersionId: currentContentVersionId(),
    sceneId: "prologue_opening",
    activeEventId: null,
    location: "shelter",
    day: 1,
    phaseIndex: 0,
    worldElapsedMs: 0,
    lastRealTimestamp: now,
    autoEnergyElapsedMs: 0,
    exhaustionElapsedMs: 0,
    isGameOver: false,
    gameOverReason: "",
    stageClear: false,
    stats: {
      hp: 8,
      mind: 6,
      energy: 7,
    },
    money: 6500,
    skills: [],
    skillProgress: createEmptySkillProgress(),
    inventory: {
      emergencySnack: 1,
      waterBottle: 1,
    },
    toolDurability: {},
    stockState: {},
    discoveredStockNodeIds: [],
    activeStockNodeId: null,
    dynamicContent: {
      locations: {},
      items: {},
      people: {},
      quests: {},
      skills: {},
      actions: {},
      choices: {},
      events: {},
      scenes: {},
    },
    worldPlan: {
      today: { day: 1, regions: [], notes: [] },
      tomorrow: { day: 2, evolutions: [], notes: [] },
    },
    frontierState: {
      nextSequence: 1,
      slots: {},
    },
    narrativeState: {
      nextBeatSequence: 1,
      history: [],
      pregenerated: {},
      anchors: {},
    },
    subwayExpedition: {
      active: false,
      runNumber: 0,
      depth: 0,
      deepestDepth: 0,
      entryElapsedMs: 0,
      carriedLoot: {},
      currentFloor: null,
      currentFloorProgress: {
        phase: "event",
        encounter: null,
        currentResult: null,
        eventResolved: false,
        eventChoiceLabel: "",
        eventOutcome: "",
        searchedLootSpotIds: [],
        floorLoot: {},
        generationFailure: "",
      },
      runBuild: {
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
      },
      runPlan: null,
      storyMemory: {
        facts: [],
        knownActors: [],
        unresolvedThreads: [],
        resolvedThreads: [],
        recentSummaries: [],
        lastBridge: "",
      },
      preparedNextFloor: null,
      nextFloorStatus: "idle",
      nextFloorError: "",
      history: [],
      lastOutcome: "",
    },
    npcDialogue: {
      active: null,
      conversations: {},
    },
    flags: {
      visited_shelter: true,
      known_convenience: true,
      known_kitchen: true,
      known_forest: true,
      known_subway: true,
      known_magic_city_entrance: true,
    },
    quests: Object.fromEntries(getQuestDefinitions(registry).map((quest) => [quest.id, "inactive" as const])),
    lastSleepEnergy: 8,
    exhaustionLevel: 0,
    log: [{ timestampLabel: "1일차 06:00", message: "눈을 뜬 당신은 오늘 하루를 어떻게든 버텨야 한다는 사실부터 떠올린다." }],
    systemNote: "",
    systemNoteEntries: [],
  };
  refreshLocationKnowledge(state);
  syncScene(state, state.sceneId);
  syncQuestState(state, {});
  return state;
}

function isKnownTravelLocation(state: GameState, locationId: string) {
  return (
    locationId === state.location ||
    Boolean(state.flags[`known_${locationId}`]) ||
    Boolean(state.flags[`visited_${locationId}`])
  );
}

export function resolveTravelPath(state: GameState, targetId: string, registry = buildRuntimeRegistry(state)) {
  if (!registry.locations[targetId]) {
    return null;
  }

  if (targetId === state.location) {
    return [state.location];
  }

  if (!isKnownTravelLocation(state, targetId)) {
    return null;
  }

  const queue: string[][] = [[state.location]];
  const visited = new Set<string>([state.location]);

  while (queue.length > 0) {
    const path = queue.shift();
    if (!path) {
      break;
    }

    const sourceId = path[path.length - 1];
    const sourceLocation = registry.locations[sourceId];
    if (!sourceLocation) {
      continue;
    }

    for (const [nextId, link] of Object.entries(sourceLocation.links)) {
      if (visited.has(nextId) || !registry.locations[nextId]) {
        continue;
      }

      if (!isKnownTravelLocation(state, nextId)) {
        continue;
      }

      if (link.requiredFlag && !state.flags[link.requiredFlag]) {
        continue;
      }

      const nextPath = [...path, nextId];
      if (nextId === targetId) {
        return nextPath;
      }

      visited.add(nextId);
      queue.push(nextPath);
    }
  }

  return null;
}

function resolveTravelRequirement(state: GameState, targetId: string) {
  const registry = buildRuntimeRegistry(state);
  const path = resolveTravelPath(state, targetId, registry);
  if (path && path.length > 1) {
    return { allowed: true, reason: "", path };
  }

  const currentLocation = getRuntimeLocationDefinition(state, registry, state.location);
  const link = currentLocation.links[targetId];
  if (!link) {
    return {
      allowed: false,
      reason: "거기로 이어지는 경로가 아직 없다.",
      path: null,
    };
  }

  if (link.requiredFlag && !state.flags[link.requiredFlag]) {
    return {
      allowed: false,
      reason: link.blockedReason || "아직 열리지 않은 길이다.",
      path: null,
    };
  }

  return { allowed: false, reason: "아직 이동할 수 없는 경로다.", path: null };
}

function useItem(state: GameState, itemId: string) {
  const registry = buildRuntimeRegistry(state);
  const item = registry.items[itemId] as {
    name: string;
    kind: string;
    effects: { hp: number; mind: number; energy: number; exhaustionRelief: number; injuryRelief?: number; infectionRelief?: number };
    useMinutes?: number;
  } | undefined;
  const count = state.inventory[itemId] || 0;
  if (!item || count <= 0) {
    throw new Error("지금은 그 아이템을 사용할 수 없다.");
  }
  if (!["food", "drink", "medicine"].includes(item.kind)) {
    throw new Error("그 물건은 바로 사용할 수 없다.");
  }

  if (!canApplyTreatment(state, item.effects)) throw new Error("치료할 부상 또는 감염이 없습니다.");
  consumeCurrentSceneIntro(state);
  state.inventory[itemId] = count - 1;
  if (state.inventory[itemId] <= 0) {
    delete state.inventory[itemId];
  }

  applyTreatment(state, item.effects);
  adjustStat(state, "hp", item.effects.hp);
  adjustStat(state, "mind", item.effects.mind);
  adjustStat(state, "energy", item.effects.energy);
  if (item.effects.exhaustionRelief > 0) {
    relieveExhaustion(state, item.effects.exhaustionRelief);
  }

  if (item.useMinutes && item.useMinutes > 0) {
    advanceGameMinutes(state, item.useMinutes);
  }

  if (itemId === "emergencySnack" || itemId === "cannedFood" || itemId === "hotMeal") {
    state.flags[activeDayKey(state, "mealSecured")] = true;
    state.flags.mealSecured = true;
  }
  if (itemId === "waterBottle") {
    state.flags[activeDayKey(state, "waterSecured")] = true;
    state.flags.waterSecured = true;
  }

  addLog(state, `${item.name}을(를) 사용했다.`);
}

export function consumeCurrentSceneIntro(state: GameState) {
  const registry = buildRuntimeRegistry(state);
  const scene = resolveSceneDefinition(state, registry, state.location);
  const introFlag = scene.introFlag;
  if (!introFlag || state.flags[introFlag]) {
    return;
  }

  state.flags[introFlag] = true;
}

function jumpToNextDaybreak(state: GameState, options: { onConditionDamage?: (amount: number) => void } = {}) {
  const nextDaybreakMs = Math.floor(state.worldElapsedMs / REAL_DAY_MS) * REAL_DAY_MS + REAL_DAY_MS;
  advanceGameTime(
    state,
    Math.max(0, nextDaybreakMs - state.worldElapsedMs),
    { ...options, energyDrainMultiplier: 0.5, conditionRate: SLEEP_CONDITION_RATE },
  );
}

type ExecutionResult = {
  fallbackNote: string;
  preferredSceneId?: string;
};

export type PerformActionOptions = {
  rng?: () => number;
  onConditionDamage?: (amount: number) => void;
};

function applyDefinitionEffects(
  state: GameState,
  effects: ActionDefinition["effects"] | ChoiceDefinition["effects"],
  skillUse: SkillUse | undefined,
  options: PerformActionOptions,
) {
  effects.forEach((effect) => {
    if (state.isGameOver || state.stageClear) return;
    if (isTimeEffect(effect)) {
      if (effect.type === "advance_to_daybreak") {
        jumpToNextDaybreak(state, options);
      } else {
        advanceGameMinutes(
          state,
          resolveSkillAdjustedMinutes(effect.minutes, skillUse, state.skillProgress),
          options,
        );
      }
      return;
    }
    applyEffect(effect, state, { skillUse, rng: options.rng });
  });
}

function authoredAdvanceTimeMinutes(effects: Effect[]) {
  return effects.find(
    (effect): effect is Extract<Effect, { type: "advance_time" }> =>
      effect.type === "advance_time",
  )?.minutes;
}

function inventoryOrMoneyIncreased(previousState: GameState, nextState: GameState) {
  if (nextState.money > previousState.money) {
    return true;
  }
  const itemIds = new Set([
    ...Object.keys(previousState.inventory),
    ...Object.keys(nextState.inventory),
  ]);
  return Array.from(itemIds).some(
    (itemId) => (nextState.inventory[itemId] ?? 0) > (previousState.inventory[itemId] ?? 0),
  );
}

function awardDefinitionSkillXp(
  previousState: GameState,
  nextState: GameState,
  skillUse: SkillUse | undefined,
  effects: Effect[],
) {
  if (!skillUse || nextState.isGameOver || nextState.stageClear) {
    return;
  }
  const baseMinutes = authoredAdvanceTimeMinutes(effects);
  if (baseMinutes === undefined) {
    return;
  }
  if (
    skillUse.skillId === "collection" &&
    !inventoryOrMoneyIncreased(previousState, nextState)
  ) {
    return;
  }
  addSkillXp(
    nextState.skillProgress,
    skillUse.skillId,
    getSkillXpForMinutes(baseMinutes),
  );
}

function applyShelterSleepBonus(state: GameState) {
  if (state.isGameOver || state.stageClear) return;
  if (!state.flags.shelter_wall_patch) {
    return;
  }

  adjustStat(state, "hp", 1);
  adjustStat(state, "mind", 1);
  addLog(state, "보강해 둔 천막이 바람을 조금 막아 주어, 한숨 자고 난 뒤 몸과 마음이 한결 가벼워졌다.");
}

function executeShelterCookingAction(
  state: GameState,
  action: ActionDefinition,
  options: PerformActionOptions,
): ExecutionResult {
  const hasIngredients =
    hasItemAmount(state, "rawRice", 1) &&
    hasItemAmount(state, "vegetables", 1) &&
    hasItemAmount(state, "woodPlank", 1);

  if (!hasIngredients) {
    applyDefinitionEffects(state, action.failureEffects, undefined, options);
    return {
      preferredSceneId: action.nextSceneId,
      fallbackNote: action.failureNote ?? action.label,
    };
  }

  applyDefinitionEffects(state, action.effects, undefined, options);
  return {
    preferredSceneId: action.nextSceneId,
    fallbackNote: action.systemNote === null ? "" : (action.systemNote ?? action.label),
  };
}

function dynamicDeliverFailureNote(state: GameState, action: ActionDefinition) {
  if (!(action.id.startsWith("dyn_action_") && action.id.endsWith("_deliver"))) {
    return action.failureNote ?? action.label;
  }

  const questAccepted = action.conditions.find((condition) => condition.type === "flag");
  if (questAccepted?.type === "flag" && !state.flags[questAccepted.flag]) {
    return "먼저 이 부탁을 수락해야 한다.";
  }

  const questDelivered = action.conditions.find((condition) => condition.type === "flag_not");
  if (questDelivered?.type === "flag_not" && state.flags[questDelivered.flag]) {
    return "이미 물건을 건넸다.";
  }

  const itemCondition = action.conditions.find((condition) => condition.type === "has_item");
  if (itemCondition?.type === "has_item") {
    const registry = buildRuntimeRegistry(state);
    const itemName = (registry.items[itemCondition.itemId] as { name?: string } | undefined)?.name;
    if (itemName) {
      return `${itemName}이 아직 손에 없다.`;
    }
  }

  return action.failureNote ?? action.label;
}

function executeActionDefinition(
  state: GameState,
  action: ActionDefinition,
  options: PerformActionOptions,
): ExecutionResult {
  const focusEffect = action.effects.find((effect) => effect.type === "focus_stock_node");
  if (focusEffect?.type === "focus_stock_node" && isStockNodeGone(state, focusEffect.nodeId)) {
    throw new Error("이미 모두 수집해 사라진 더미다.");
  }
  if (action.dailyLimit && getRemainingDailyUses(state, action.dailyLimit) <= 0) {
    throw new Error("오늘 가능한 횟수를 모두 사용했다.");
  }
  if (!actionConditionsMet(action, state)) {
    if (action.presentationMode !== "always") {
      throw new Error("지금은 그 행동을 할 수 없다.");
    }

    applyDefinitionEffects(state, action.failureEffects, undefined, options);
    return {
      preferredSceneId: action.nextSceneId,
      fallbackNote: dynamicDeliverFailureNote(state, action),
    };
  }

  consumeCurrentSceneIntro(state);
  if (action.id === "cook_at_shelter") {
    return executeShelterCookingAction(state, action, options);
  }
  const previousState = structuredClone(state);
  if (action.dailyLimit) {
    consumeDailyUse(state, action.dailyLimit);
  }
  applyDefinitionEffects(state, action.effects, action.skillUse, options);
  awardDefinitionSkillXp(previousState, state, action.skillUse, action.effects);
  if (action.id === "sleep_at_shelter") {
    applyShelterSleepBonus(state);
  }
  return {
    preferredSceneId: action.nextSceneId,
    fallbackNote: action.label,
  };
}

function executeSceneChoiceDefinition(
  state: GameState,
  choice: ChoiceDefinition,
  options: PerformActionOptions,
): ExecutionResult {
  if (!choiceConditionsMet(choice, state)) {
    if (choice.presentationMode !== "always") {
      throw new Error("지금은 그 선택지를 고를 수 없다.");
    }

    applyDefinitionEffects(state, choice.failureEffects, undefined, options);
    return {
      preferredSceneId: choice.nextSceneId,
      fallbackNote: choice.failureNote ?? choice.label,
    };
  }

  if (choice.tags?.includes("studio-authored") && !resolveSceneDefinition(state, buildRuntimeRegistry(state)).choiceIds.includes(choice.id)) throw new Error("현재 장면에서 선택할 수 없습니다.");
  consumeCurrentSceneIntro(state);
  const previousState = structuredClone(state);
  applyDefinitionEffects(state, choice.effects, choice.skillUse, options);
  awardDefinitionSkillXp(previousState, state, choice.skillUse, choice.effects);
  return {
    preferredSceneId: choice.nextSceneId,
    fallbackNote: choice.systemNote === null ? "" : (choice.systemNote ?? choice.label),
  };
}

export function performAction(
  state: GameState,
  action: GameAction,
  options: PerformActionOptions = {},
) {
  const previousState = structuredClone(state);
  syncClock(state);
  if (state.isGameOver) {
    throw new Error(state.gameOverReason || "이미 게임오버 상태입니다.");
  }
  const registry = buildRuntimeRegistry(state);
  let fallbackNote = "";
  let preferredSceneId: string | undefined;

  switch (action.type) {
    case "travel": {
      const { allowed, reason, path } = resolveTravelRequirement(state, action.targetId);
      if (!allowed || !path || path.length < 2) {
        throw new Error(reason);
      }
      closeShelterSubmenus(state);
      const routeTargets = path.slice(1);
      const destinationId = routeTargets[routeTargets.length - 1];
      const destinationName = String(registry.locations[destinationId]?.name ?? destinationId);
      consumeCurrentSceneIntro(state);
      for (const stepTargetId of routeTargets) {
        state.location = stepTargetId;
        state.flags[`visited_${stepTargetId}`] = true;
        state.activeStockNodeId = null;
        refreshLocationKnowledge(state);
        advanceTravelTime(state);
        if (state.isGameOver || state.stageClear) {
          break;
        }
      }
      fallbackNote = routeTargets.length > 1
        ? `이동: ${destinationName} (${routeTargets.length}구간)`
        : `이동: ${destinationName}`;
      addLog(state, routeTargets.length > 1
        ? `${destinationName}(으)로 ${routeTargets.length}구간 이동했다.`
        : `${destinationName}(으)로 이동했다.`);
      break;
    }
    case "use_item": {
      useItem(state, action.itemId);
      fallbackNote = itemName(state, action.itemId);
      break;
    }
    case "content_action": {
      const definition = registry.actions[action.actionId];
      if (!definition) {
        throw new Error(`알 수 없는 행동 '${action.actionId}'이다.`);
      }
      ({ preferredSceneId, fallbackNote } = executeActionDefinition(state, definition, options));
      break;
    }
    case "content_choice": {
      const definition = registry.choices[action.choiceId];
      if (!definition) {
        throw new Error(`알 수 없는 선택지 '${action.choiceId}'이다.`);
      }
      ({ preferredSceneId, fallbackNote } = executeSceneChoiceDefinition(state, definition, options));
      break;
    }
    case "subway_expedition":
      throw new Error("지하철 심층 탐험 행동은 게임 서비스에서 처리해야 합니다.");
    case "npc_dialogue":
      throw new Error("NPC 대화 행동은 게임 서비스에서 처리해야 합니다.");
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }

  if (!state.isGameOver && !state.stageClear) syncQuestState(state, previousState.quests);
  evaluateSurvivalOutcome(state);
  syncScene(state, preferredSceneId);
  applySystemNote(previousState, state, resolveItemText(fallbackNote, registry));
}

/** Uses the actual sleep action on a clone; never consumes the live RNG or state. */
export function forecastShelterSleep(state: GameState) {
  if (state.isGameOver || state.stageClear) return null;
  const definition = buildRuntimeRegistry(state).actions.sleep_at_shelter;
  if (!definition || state.location !== "shelter" || !actionConditionsMet(definition, state)
    || (definition.dailyLimit && getRemainingDailyUses(state, definition.dailyLimit) <= 0)) return null;
  const next = structuredClone(state);
  let conditionLoss = 0;
  performAction(next, { type: "content_action", actionId: definition.id }, { rng: () => 1, onConditionDamage: amount => { conditionLoss += amount; } });
  return {
    hpBefore: state.stats.hp, hpAfter: next.stats.hp, conditionDamage: conditionLoss,
    infectionBefore: state.conditions.infection.level, infectionAfter: next.conditions.infection.level,
    isFatal: next.isGameOver, reason: next.gameOverReason,
  };
}

export function summarizeState(state: GameState) {
  const registry = buildRuntimeRegistry(state);
  return {
    day: state.day,
    phase: PHASES[state.phaseIndex],
    location: String(registry.locations[state.location]?.name ?? state.location),
    hp: state.stats.hp,
    mind: state.stats.mind,
    energy: state.stats.energy,
    money: state.money,
    skills: [...state.skills],
    skillProgress: structuredClone(state.skillProgress),
    inventory: { ...state.inventory },
    flags: { ...state.flags },
  };
}
