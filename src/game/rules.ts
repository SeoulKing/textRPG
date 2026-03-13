import {
  AUTO_FULLNESS_TICK_MS,
  PHASE_DURATION_MS,
  PHASES,
  REAL_DAY_MS,
  SAVE_VERSION,
  STARVATION_TICK_MS,
  baseItems,
  baseLocations,
} from "./base-data";
import { worldRegistry } from "./data/registry";
import { resolveSceneDefinition } from "./content-engine";
import { appendLogEntry, applyEffect, evaluateCondition, evaluateObjective } from "./state-utils";
import type { ActionDefinition, ChoiceDefinition, GameAction, GameState } from "./schemas";
import { questDefinitions } from "./quest-definitions";

const STAT_LABELS = {
  hp: "체력",
  mind: "정신력",
  fullness: "포만감",
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function adjustStat(state: GameState, statKey: "hp" | "mind" | "fullness", delta: number) {
  state.stats[statKey] = clamp(state.stats[statKey] + delta, 0, 10);
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

export function syncQuestState(state: GameState) {
  for (const def of questDefinitions) {
    const prereqPass = def.prerequisites.every((condition) => evaluateCondition(condition, state));
    if (!prereqPass) {
      state.quests[def.id] = "inactive";
      continue;
    }
    const allObjectivesMet = def.objectives.every((objective) => evaluateObjective(objective, state));
    state.quests[def.id] = allObjectivesMet ? "completed" : "active";
  }
}

function addLog(state: GameState, message: string) {
  appendLogEntry(state, message);
}

function markLocationKnown(state: GameState, locationId: string) {
  state.flags[`known_${locationId}`] = true;
}

export function refreshLocationKnowledge(state: GameState) {
  markLocationKnown(state, state.location);
  state.flags[`visited_${state.location}`] = true;
  Object.keys(baseLocations[state.location].links).forEach((locationId) => {
    markLocationKnown(state, locationId);
  });
}

function relieveStarvation(state: GameState, amount = 1) {
  state.starvationLevel = Math.max(0, state.starvationLevel - amount);
}

function triggerGameOver(state: GameState, reason: string) {
  if (state.isGameOver || state.stageClear) {
    return;
  }
  state.isGameOver = true;
  state.gameOverReason = reason;
  state.systemNote = reason;
  addLog(state, `생존 실패: ${reason}`);
}

function formatSignedDelta(value: number, label: string) {
  const sign = value > 0 ? "+" : "-";
  return `${sign} ${Math.abs(value)} ${label}`;
}

function findStockNodeName(nodeId: string) {
  for (const location of Object.values(baseLocations)) {
    const node = location.stockNodes.find((entry) => entry.id === nodeId);
    if (node) {
      return node.name;
    }
  }
  return nodeId;
}

function questTitle(questId: string) {
  return questDefinitions.find((quest) => quest.id === questId)?.title ?? questId;
}

function summarizeSystemNote(previousState: GameState, nextState: GameState, fallback = "") {
  const parts: string[] = [];

  if (!previousState.isGameOver && nextState.isGameOver && nextState.gameOverReason) {
    return nextState.gameOverReason;
  }

  if (previousState.location !== nextState.location) {
    parts.push(`이동: ${baseLocations[nextState.location]?.name ?? nextState.location}`);
  }

  (Object.keys(STAT_LABELS) as Array<keyof typeof STAT_LABELS>).forEach((statKey) => {
    const delta = nextState.stats[statKey] - previousState.stats[statKey];
    if (delta !== 0) {
      parts.push(formatSignedDelta(delta, STAT_LABELS[statKey]));
    }
  });

  const moneyDelta = nextState.money - previousState.money;
  if (moneyDelta !== 0) {
    const sign = moneyDelta > 0 ? "+" : "-";
    parts.push(`${sign} ${Math.abs(moneyDelta)}원`);
  }

  const itemIds = new Set<string>([
    ...Object.keys(previousState.inventory || {}),
    ...Object.keys(nextState.inventory || {}),
  ]);
  itemIds.forEach((itemId) => {
    const delta = (nextState.inventory[itemId] ?? 0) - (previousState.inventory[itemId] ?? 0);
    if (delta !== 0) {
      parts.push(formatSignedDelta(delta, baseItems[itemId as keyof typeof baseItems]?.name ?? itemId));
    }
  });

  const previousDiscovered = new Set(previousState.discoveredStockNodeIds || []);
  (nextState.discoveredStockNodeIds || []).forEach((nodeId) => {
    if (!previousDiscovered.has(nodeId)) {
      parts.push(`발견: ${findStockNodeName(nodeId)}`);
    }
  });

  if (previousState.activeStockNodeId !== nextState.activeStockNodeId) {
    if (nextState.activeStockNodeId) {
      parts.push(`확인: ${findStockNodeName(nextState.activeStockNodeId)}`);
    } else if (previousState.activeStockNodeId) {
      parts.push(`복귀: ${baseLocations[nextState.location]?.name ?? nextState.location}`);
    }
  }

  const questIds = new Set<string>([
    ...Object.keys(previousState.quests || {}),
    ...Object.keys(nextState.quests || {}),
  ]);
  questIds.forEach((questId) => {
    const previousStatus = previousState.quests[questId];
    const nextStatus = nextState.quests[questId];
    if (previousStatus !== "completed" && nextStatus === "completed") {
      parts.push(`퀘스트 완료: ${questTitle(questId)}`);
    } else if ((previousStatus === "inactive" || !previousStatus) && nextStatus === "active") {
      parts.push(`퀘스트 시작: ${questTitle(questId)}`);
    }
  });

  return parts.length > 0 ? parts.join(" / ") : fallback;
}

export function applySystemNote(previousState: GameState, nextState: GameState, fallback = "") {
  const nextNote = summarizeSystemNote(previousState, nextState, fallback);
  if (nextNote) {
    nextState.systemNote = nextNote;
    return;
  }

  nextState.systemNote = nextState.systemNote || previousState.systemNote || "";
}

function syncScene(state: GameState) {
  const scene = resolveSceneDefinition(state, worldRegistry, state.location);
  state.sceneId = scene.id;
}

function applyDayTransition(state: GameState, previousDay: number) {
  if (state.day === previousDay) {
    return;
  }

  state.autoFullnessElapsedMs = 0;
  state.starvationElapsedMs = 0;
  state.flags[`day${state.day}_mealSecured`] = false;
  state.flags[`day${state.day}_waterSecured`] = false;
  state.lastSleepFullness = state.stats.fullness;
  syncQuestState(state);
  syncScene(state);
  addLog(state, `${state.day}일차가 시작된다.`);
}

export function syncClock(state: GameState, now = Date.now()) {
  if (state.isGameOver || state.stageClear) {
    state.lastRealTimestamp = now;
    return;
  }

  const elapsed = Math.max(0, now - state.lastRealTimestamp);
  if (elapsed === 0) {
    return;
  }

  state.lastRealTimestamp = now;
  const previousDay = state.day;
  state.worldElapsedMs += elapsed;

  state.autoFullnessElapsedMs += elapsed;
  while (state.autoFullnessElapsedMs >= AUTO_FULLNESS_TICK_MS) {
    state.autoFullnessElapsedMs -= AUTO_FULLNESS_TICK_MS;
    if (state.stats.fullness > 0) {
      adjustStat(state, "fullness", -1);
    }
  }

  if (state.stats.fullness === 0) {
    state.starvationElapsedMs += elapsed;
    while (state.starvationElapsedMs >= STARVATION_TICK_MS) {
      state.starvationElapsedMs -= STARVATION_TICK_MS;
      state.starvationLevel += 1;
      if (state.starvationLevel >= 3) {
        adjustStat(state, "hp", -1);
      }
    }
  } else {
    state.starvationElapsedMs = 0;
  }

  setClockFromElapsed(state);
  applyDayTransition(state, previousDay);
  refreshLocationKnowledge(state);

  if (state.stats.mind <= 0) {
    triggerGameOver(state, "도시보다 먼저 정신이 무너졌다.");
  }
  if (state.stats.hp <= 0) {
    triggerGameOver(state, "몸이 더는 생존을 버텨 내지 못했다.");
  }
}

export function createInitialGameState(): GameState {
  const now = Date.now();
  const state: GameState = {
    saveVersion: SAVE_VERSION,
    sceneId: "shelter_opening",
    location: "shelter",
    day: 1,
    phaseIndex: 0,
    worldElapsedMs: 0,
    lastRealTimestamp: now,
    autoFullnessElapsedMs: 0,
    starvationElapsedMs: 0,
    isGameOver: false,
    gameOverReason: "",
    stageClear: false,
    stats: {
      hp: 8,
      mind: 6,
      fullness: 7,
    },
    money: 6500,
    skills: [],
    inventory: {
      emergencySnack: 1,
      waterBottle: 1,
    },
    stockState: {},
    discoveredStockNodeIds: [],
    activeStockNodeId: null,
    flags: {
      visited_shelter: true,
    },
    quests: Object.fromEntries(questDefinitions.map((quest) => [quest.id, "inactive" as const])),
    lastSleepFullness: 8,
    starvationLevel: 0,
    log: [{ timestampLabel: "1일차 06:00", message: "눈을 뜬 당신은 오늘 하루만큼은 반드시 버텨 내기로 마음먹는다." }],
    systemNote: "",
  };
  refreshLocationKnowledge(state);
  syncScene(state);
  syncQuestState(state);
  return state;
}

function resolveTravelRequirement(state: GameState, targetId: string) {
  const link = baseLocations[state.location].links[targetId];
  if (!link) {
    return {
      allowed: false,
      reason: "여기서 바로 이어지는 길은 아니다.",
    };
  }

  if (link.requiredFlag && !state.flags[link.requiredFlag]) {
    return {
      allowed: false,
      reason: link.blockedReason || "아직 열리지 않은 길이다.",
    };
  }

  return { allowed: true, reason: "" };
}

function useItem(state: GameState, itemId: keyof typeof baseItems) {
  const item = baseItems[itemId];
  const count = state.inventory[itemId] || 0;
  if (!item || count <= 0) {
    throw new Error("지금은 그 아이템을 사용할 수 없다.");
  }

  state.inventory[itemId] = count - 1;
  if (state.inventory[itemId] <= 0) {
    delete state.inventory[itemId];
  }

  adjustStat(state, "hp", item.effects.hp);
  adjustStat(state, "mind", item.effects.mind);
  adjustStat(state, "fullness", item.effects.fullness);
  if (item.effects.starvationRelief > 0) {
    relieveStarvation(state, item.effects.starvationRelief);
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

function runActionDefinition(state: GameState, action: ActionDefinition) {
  if (!action.conditions.every((condition) => evaluateCondition(condition, state))) {
    throw new Error("지금은 그 행동을 할 수 없다.");
  }
  action.effects.forEach((effect) => applyEffect(effect, state));
  if (action.nextSceneId) {
    state.sceneId = action.nextSceneId;
  }
}

function runChoiceDefinition(state: GameState, choice: ChoiceDefinition) {
  if (!choice.conditions.every((condition) => evaluateCondition(condition, state))) {
    throw new Error("지금은 그 선택지를 고를 수 없다.");
  }
  choice.effects.forEach((effect) => applyEffect(effect, state));
  if (choice.nextSceneId) {
    state.sceneId = choice.nextSceneId;
  }
}

export function performAction(state: GameState, action: GameAction) {
  const previousState = structuredClone(state);
  syncClock(state);
  let fallbackNote = "";

  switch (action.type) {
    case "travel": {
      const { allowed, reason } = resolveTravelRequirement(state, action.targetId);
      if (!allowed) {
        throw new Error(reason);
      }
      state.location = action.targetId;
      state.flags[`visited_${action.targetId}`] = true;
      state.activeStockNodeId = null;
      refreshLocationKnowledge(state);
      syncScene(state);
      fallbackNote = `이동: ${baseLocations[action.targetId].name}`;
      addLog(state, `${baseLocations[action.targetId].name}(으)로 움직였다.`);
      break;
    }
    case "use_item": {
      useItem(state, action.itemId as keyof typeof baseItems);
      fallbackNote = baseItems[action.itemId as keyof typeof baseItems]?.name ?? action.itemId;
      break;
    }
    case "content_action": {
      const definition = worldRegistry.actions[action.actionId];
      if (!definition) {
        throw new Error(`알 수 없는 행동 '${action.actionId}'이다.`);
      }
      runActionDefinition(state, definition);
      syncScene(state);
      fallbackNote = definition.label;
      break;
    }
    case "content_choice": {
      const definition = worldRegistry.choices[action.choiceId];
      if (!definition) {
        throw new Error(`알 수 없는 선택지 '${action.choiceId}'이다.`);
      }
      runChoiceDefinition(state, definition);
      syncScene(state);
      fallbackNote = definition.label;
      break;
    }
    case "rest": {
      runActionDefinition(state, worldRegistry.actions.rest_at_shelter);
      syncScene(state);
      fallbackNote = worldRegistry.actions.rest_at_shelter.label;
      break;
    }
    case "cook": {
      runActionDefinition(state, worldRegistry.actions.cook_simple_meal);
      syncScene(state);
      fallbackNote = worldRegistry.actions.cook_simple_meal.label;
      break;
    }
    case "buy_meal": {
      runActionDefinition(state, worldRegistry.actions.buy_meal_at_kitchen);
      syncScene(state);
      fallbackNote = worldRegistry.actions.buy_meal_at_kitchen.label;
      break;
    }
    case "generate_event": {
      fallbackNote = "새 단서를 살핀다";
      break;
    }
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }

  syncQuestState(state);
  applySystemNote(previousState, state, fallbackNote);
}

export function summarizeState(state: GameState) {
  return {
    day: state.day,
    phase: PHASES[state.phaseIndex],
    location: baseLocations[state.location].name,
    hp: state.stats.hp,
    mind: state.stats.mind,
    fullness: state.stats.fullness,
    money: state.money,
    skills: [...state.skills],
    inventory: { ...state.inventory },
    flags: { ...state.flags },
  };
}
