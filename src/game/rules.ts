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
import { applyEffect, evaluateCondition, evaluateObjective } from "./state-utils";
import type { ActionDefinition, ChoiceDefinition, GameAction, GameState } from "./schemas";
import { questDefinitions } from "./quest-definitions";

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
  addLog(state, `Game over: ${reason}`);
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
  addLog(state, `Day ${state.day} begins.`);
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
    triggerGameOver(state, "Your mind gives out before the city does.");
  }
  if (state.stats.hp <= 0) {
    triggerGameOver(state, "Your body can no longer keep up with survival.");
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
    flags: {
      visited_shelter: true,
    },
    quests: Object.fromEntries(questDefinitions.map((quest) => [quest.id, "inactive" as const])),
    lastSleepFullness: 8,
    starvationLevel: 0,
    log: ["You wake up in the shelter and decide today has to count."],
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
      reason: "That location is not directly connected from here.",
    };
  }

  if (link.requiredFlag && !state.flags[link.requiredFlag]) {
    return {
      allowed: false,
      reason: link.blockedReason || "That route is not open yet.",
    };
  }

  return { allowed: true, reason: "" };
}

function useItem(state: GameState, itemId: keyof typeof baseItems) {
  const item = baseItems[itemId];
  const count = state.inventory[itemId] || 0;
  if (!item || count <= 0) {
    throw new Error("That item is not available.");
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

  state.systemNote = `Used ${item.name}.`;
  addLog(state, `You use ${item.name}.`);
}

function runActionDefinition(state: GameState, action: ActionDefinition) {
  if (!action.conditions.every((condition) => evaluateCondition(condition, state))) {
    throw new Error("That action is not available right now.");
  }
  action.effects.forEach((effect) => applyEffect(effect, state));
  if (action.nextSceneId) {
    state.sceneId = action.nextSceneId;
  }
  state.systemNote = action.outcomeHint;
}

function runChoiceDefinition(state: GameState, choice: ChoiceDefinition) {
  if (!choice.conditions.every((condition) => evaluateCondition(condition, state))) {
    throw new Error("That choice is not available right now.");
  }
  choice.effects.forEach((effect) => applyEffect(effect, state));
  if (choice.nextSceneId) {
    state.sceneId = choice.nextSceneId;
  }
  state.systemNote = choice.outcomeHint;
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
      state.flags[`visited_${action.targetId}`] = true;
      refreshLocationKnowledge(state);
      syncScene(state);
      state.systemNote = `Moved to ${baseLocations[action.targetId].name}.`;
      addLog(state, `You move to ${baseLocations[action.targetId].name}.`);
      break;
    }
    case "use_item": {
      useItem(state, action.itemId as keyof typeof baseItems);
      break;
    }
    case "content_action": {
      const definition = worldRegistry.actions[action.actionId];
      if (!definition) {
        throw new Error(`Unknown action '${action.actionId}'.`);
      }
      runActionDefinition(state, definition);
      syncScene(state);
      break;
    }
    case "content_choice": {
      const definition = worldRegistry.choices[action.choiceId];
      if (!definition) {
        throw new Error(`Unknown choice '${action.choiceId}'.`);
      }
      runChoiceDefinition(state, definition);
      syncScene(state);
      break;
    }
    case "rest": {
      runActionDefinition(state, worldRegistry.actions.rest_at_shelter);
      syncScene(state);
      break;
    }
    case "cook": {
      runActionDefinition(state, worldRegistry.actions.cook_simple_meal);
      syncScene(state);
      break;
    }
    case "buy_meal": {
      runActionDefinition(state, worldRegistry.actions.buy_meal_at_kitchen);
      syncScene(state);
      break;
    }
    case "generate_event": {
      state.systemNote = "You probe the area for something new.";
      break;
    }
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }

  syncQuestState(state);
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
