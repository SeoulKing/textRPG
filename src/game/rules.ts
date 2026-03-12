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
import { questDefinitions } from "./quest-definitions";
import { evaluateCondition, evaluateObjective } from "./state-utils";
import type { GameAction, GameState } from "./schemas";

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

function syncQuestState(state: GameState) {
  for (const def of questDefinitions) {
    const prereqPass = def.prerequisites.every((c) => evaluateCondition(c, state));
    if (!prereqPass) {
      state.quests[def.id] = "inactive";
      continue;
    }
    const allObjectivesMet = def.objectives.every((obj) => evaluateObjective(obj, state));
    state.quests[def.id] = allObjectivesMet ? "completed" : "active";
  }
}

function addLog(state: GameState, message: string) {
  state.log.unshift(message);
  state.log = state.log.slice(0, 20);
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

function markMealSecured(state: GameState) {
  state.flags[activeDayKey(state, "mealSecured")] = true;
  syncQuestState(state);
}

function markWaterSecured(state: GameState) {
  state.flags[activeDayKey(state, "waterSecured")] = true;
  syncQuestState(state);
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
  addLog(state, `게임 오버: ${reason}`);
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

  addLog(state, `${state.day}일차 아침을 맞았다.`);
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
    triggerGameOver(state, "정신이 더는 버티지 못했다.");
  }
  if (state.stats.hp <= 0) {
    triggerGameOver(state, "상처와 굶주림을 버티지 못했다.");
  }
}

export function createInitialGameState(): GameState {
  const now = Date.now();
  const state: GameState = {
    saveVersion: SAVE_VERSION,
    sceneId: "opening",
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
    flags: {
      visited_shelter: true,
    },
    quests: Object.fromEntries(questDefinitions.map((q) => [q.id, "inactive" as const])),
    lastSleepFullness: 8,
    starvationLevel: 0,
    log: ["이 캠프에서 살아가기로 했다. 물자를 모으고, 끼니를 해결하고, 버틴다."],
    systemNote: "",
  };
  refreshLocationKnowledge(state);
  syncQuestState(state);
  return state;
}

function resolveTravelRequirement(state: GameState, targetId: string) {
  const link = baseLocations[state.location].links[targetId];
  if (!link) {
    return {
      allowed: false,
      reason: "현재 위치와 닿아 있지 않은 장소다.",
    };
  }

  if (link.requiredFlag && !state.flags[link.requiredFlag]) {
    return {
      allowed: false,
      reason: link.blockedReason || "아직 이동할 수 없는 경로다.",
    };
  }

  return { allowed: true, reason: "" };
}

function useItem(state: GameState, itemId: keyof typeof baseItems) {
  const item = baseItems[itemId];
  const count = state.inventory[itemId] || 0;
  if (!item || count <= 0) {
    throw new Error("사용할 수 있는 아이템이 없다.");
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
    markMealSecured(state);
  }
  if (itemId === "waterBottle") {
    markWaterSecured(state);
  }

  state.systemNote = `사용: ${item.name}`;
  addLog(state, `${item.name}을 사용했다.`);
}

function restAtShelter(state: GameState) {
  if (state.location !== "shelter") {
    throw new Error("휴식은 임시 거처에서만 정리할 수 있다.");
  }
  adjustStat(state, "hp", 1);
  adjustStat(state, "mind", 1);
  state.systemNote = "휴식: 몸과 정신을 가다듬었다.";
  addLog(state, "임시 거처에서 짧게 숨을 돌렸다.");
}

function cookAtShelter(state: GameState) {
  if (state.location !== "shelter") {
    throw new Error("요리는 임시 거처에서만 할 수 있다.");
  }
  const rice = state.inventory.rawRice ?? 0;
  const veg = state.inventory.vegetables ?? 0;
  if (rice < 1 || veg < 1) {
    throw new Error("쌀과 채소가 필요하다.");
  }
  state.inventory.rawRice = rice - 1;
  if (state.inventory.rawRice <= 0) delete state.inventory.rawRice;
  state.inventory.vegetables = veg - 1;
  if (state.inventory.vegetables <= 0) delete state.inventory.vegetables;
  state.inventory.hotMeal = (state.inventory.hotMeal ?? 0) + 1;
  markMealSecured(state);
  state.systemNote = "요리: 쌀과 채소로 따뜻한 한 끼를 만들었다.";
  addLog(state, "임시 거처에서 쌀과 채소를 끓여 한 끼를 해결했다.");
}

const KITCHEN_MEAL_PRICE = 4500;

function buyMealAtKitchen(state: GameState) {
  if (state.location !== "kitchen") {
    throw new Error("급식소에서만 식사를 구매할 수 있다.");
  }
  if (state.money < KITCHEN_MEAL_PRICE) {
    throw new Error(`식사 비용은 ${KITCHEN_MEAL_PRICE}원이다.`);
  }
  state.money -= KITCHEN_MEAL_PRICE;
  state.inventory.hotMeal = (state.inventory.hotMeal ?? 0) + 1;
  markMealSecured(state);
  state.systemNote = "급식소에서 따뜻한 식사를 구매했다.";
  addLog(state, "급식소에서 돈을 내고 한 끼를 해결했다.");
}

export function performAction(state: GameState, action: GameAction) {
  syncClock(state);

  switch (action.type) {
    case "travel": {
      const { allowed, reason } = resolveTravelRequirement(state, action.targetId);
      if (!allowed) {
        throw new Error(reason);
      }
      state.location = action.targetId;
      state.sceneId = `location:${action.targetId}`;
      state.flags[`visited_${action.targetId}`] = true;
      if (["mart", "convenience", "riverside", "hospital"].includes(action.targetId)) {
        state.flags.stockpileStarted = true;
      }
      refreshLocationKnowledge(state);
      state.systemNote = `이동: ${baseLocations[action.targetId].name}`;
      addLog(state, `${baseLocations[action.targetId].name}(으)로 이동했다.`);
      return;
    }
    case "use_item": {
      useItem(state, action.itemId as keyof typeof baseItems);
      return;
    }
    case "rest": {
      restAtShelter(state);
      return;
    }
    case "cook": {
      cookAtShelter(state);
      return;
    }
    case "buy_meal": {
      buyMealAtKitchen(state);
      return;
    }
    case "generate_event": {
      state.systemNote = "새 이벤트를 생성했다.";
      return;
    }
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
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
