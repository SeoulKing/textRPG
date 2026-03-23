/**
 * GameState helpers.
 */

import { PHASES, REAL_DAY_MS, baseLocations } from "./base-data";
import type { Condition, Effect, GameState, GameStateV2, Objective, Player, QuestReward, WorldState } from "./schemas";

function activeDayKey(state: GameState, flag: string) {
  return `day${state.day}_${flag}`;
}

function clampStat(value: number) {
  return Math.max(0, Math.min(10, value));
}

export function getStockStateKey(locationId: string, nodeId: string, itemId: string) {
  return `${locationId}:${nodeId}:${itemId}`;
}

export function getStockMoneyKey(locationId: string, nodeId: string) {
  return `${locationId}:${nodeId}:$money`;
}

export function getStockNode(locationId: string, nodeId: string) {
  const location = baseLocations[locationId];
  if (!location) {
    return null;
  }
  return location.stockNodes.find((node) => node.id === nodeId) ?? null;
}

export function getStockNodeLocationId(nodeId: string) {
  for (const location of Object.values(baseLocations)) {
    if (location.stockNodes.some((node) => node.id === nodeId)) {
      return location.id;
    }
  }
  return null;
}

/** 게임 내 시계(06:00를 하루 시작으로 하는 표시 시각) 기준, 자정 이후 경과 분(0–1439). */
export function getGameClockShiftedMinutes(worldElapsedMs: number) {
  const elapsedInDay = ((worldElapsedMs % REAL_DAY_MS) + REAL_DAY_MS) % REAL_DAY_MS;
  const totalMinutes = Math.floor((elapsedInDay / REAL_DAY_MS) * 24 * 60);
  return (totalMinutes + 6 * 60) % (24 * 60);
}

export function formatClockLabelFromElapsed(worldElapsedMs: number) {
  const shiftedMinutes = getGameClockShiftedMinutes(worldElapsedMs);
  const roundedMinutes = Math.floor(shiftedMinutes / 10) * 10;
  const hours = String(Math.floor(roundedMinutes / 60)).padStart(2, "0");
  const minutes = String(roundedMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatLogTimestamp(day: number, worldElapsedMs: number) {
  return `${day}일차 ${formatClockLabelFromElapsed(worldElapsedMs)}`;
}

export function appendLogEntry(state: GameState, message: string) {
  state.log.unshift({
    timestampLabel: formatLogTimestamp(state.day, state.worldElapsedMs),
    message,
  });
  state.log = state.log.slice(0, 20);
}

export function getStockQuantity(state: GameState, locationId: string, nodeId: string, itemId: string) {
  const key = getStockStateKey(locationId, nodeId, itemId);
  if (typeof state.stockState[key] === "number") {
    return state.stockState[key];
  }

  const node = getStockNode(locationId, nodeId);
  const stockItem = node?.items.find((entry) => entry.itemId === itemId);
  return stockItem?.initialQuantity ?? 0;
}

export function getStockMoney(state: GameState, locationId: string, nodeId: string) {
  const key = getStockMoneyKey(locationId, nodeId);
  if (typeof state.stockState[key] === "number") {
    return state.stockState[key];
  }

  const node = getStockNode(locationId, nodeId);
  return node?.money ?? 0;
}

function setStockQuantity(state: GameState, locationId: string, nodeId: string, itemId: string, nextQuantity: number) {
  state.stockState[getStockStateKey(locationId, nodeId, itemId)] = Math.max(0, nextQuantity);
}

function setStockMoney(state: GameState, locationId: string, nodeId: string, nextAmount: number) {
  state.stockState[getStockMoneyKey(locationId, nodeId)] = Math.max(0, nextAmount);
}

function hasDiscoveredStockNode(state: GameState, nodeId: string) {
  return state.discoveredStockNodeIds.includes(nodeId);
}

export function evaluateObjective(objective: Objective, state: GameState): boolean {
  switch (objective.type) {
    case "obtain_item":
      return (state.inventory[objective.itemId] ?? 0) >= objective.amount;
    case "return_to_npc":
      return Boolean(state.flags[`returned_to_${objective.npcId}`]);
    case "reach_location":
      return state.location === objective.locationId;
    case "flag":
      return Boolean(state.flags[objective.flag]);
    case "daily_flag":
      return Boolean(state.flags[activeDayKey(state, objective.flag)] || state.flags[objective.flag]);
    case "stage_clear":
      return state.stageClear;
    default:
      return false;
  }
}

export function applyQuestReward(reward: QuestReward, state: GameState): void {
  switch (reward.type) {
    case "money":
      state.money = Math.max(0, state.money + reward.amount);
      break;
    case "set_flag":
      state.flags[reward.flag] = true;
      break;
    case "add_item":
      state.inventory[reward.itemId] = (state.inventory[reward.itemId] ?? 0) + reward.amount;
      break;
  }
}

export function evaluateCondition(condition: Condition, state: GameState): boolean {
  switch (condition.type) {
    case "has_item":
      return (state.inventory[condition.itemId] ?? 0) >= condition.amount;
    case "skill_gte":
      return state.skills.includes(condition.skillId);
    case "flag":
      return Boolean(state.flags[condition.flag]);
    case "flag_not":
      return !state.flags[condition.flag];
    case "location":
      return state.location === condition.locationId;
    case "location_visited":
      return Boolean(state.flags[`visited_${condition.locationId}`]);
    case "day_gte":
      return state.day >= condition.value;
    case "day_lt":
      return state.day < condition.value;
    case "money_gte":
      return state.money >= condition.amount;
    case "quest_state":
      return state.quests[condition.questId] === condition.status;
    case "stock_item_gte":
      return getStockQuantity(state, condition.locationId, condition.nodeId, condition.itemId) >= condition.amount;
    case "stock_money_gte":
      return getStockMoney(state, condition.locationId, condition.nodeId) >= condition.amount;
    case "stock_item_lt":
      return getStockQuantity(state, condition.locationId, condition.nodeId, condition.itemId) < condition.amount;
    case "stock_money_lt":
      return getStockMoney(state, condition.locationId, condition.nodeId) < condition.amount;
    case "stock_node_discovered":
      return hasDiscoveredStockNode(state, condition.nodeId);
    case "active_stock_node":
      return state.activeStockNodeId === condition.nodeId;
    case "active_stock_node_not":
      return state.activeStockNodeId !== condition.nodeId;
    case "shelter_sleep_window": {
      const m = getGameClockShiftedMinutes(state.worldElapsedMs);
      const evening = 18 * 60;
      const morning = 6 * 60;
      return m >= evening || m < morning;
    }
    default:
      return false;
  }
}

export function applyEffect(effect: Effect, state: GameState): void {
  switch (effect.type) {
    case "change_stat":
      state.stats[effect.stat] = clampStat(state.stats[effect.stat] + effect.value);
      break;
    case "set_flag":
      state.flags[effect.flag] = true;
      if (effect.flag === "mealSecured" || effect.flag === "waterSecured") {
        state.flags[activeDayKey(state, effect.flag)] = true;
      }
      break;
    case "clear_flag":
      delete state.flags[effect.flag];
      delete state.flags[activeDayKey(state, effect.flag)];
      break;
    case "add_item":
      state.inventory[effect.itemId] = (state.inventory[effect.itemId] ?? 0) + effect.amount;
      break;
    case "remove_item": {
      const current = state.inventory[effect.itemId] ?? 0;
      const next = Math.max(0, current - effect.amount);
      if (next === 0) delete state.inventory[effect.itemId];
      else state.inventory[effect.itemId] = next;
      break;
    }
    case "change_money":
      state.money = Math.max(0, state.money + effect.amount);
      break;
    case "travel":
      state.location = effect.locationId;
      state.flags[`visited_${effect.locationId}`] = true;
      state.activeStockNodeId = null;
      break;
    case "start_quest":
      state.quests[effect.questId] = "active";
      break;
    case "complete_quest":
      state.quests[effect.questId] = "completed";
      break;
    case "log":
      appendLogEntry(state, effect.message);
      break;
    case "set_scene":
      state.sceneId = effect.sceneId;
      break;
    case "discover_stock_node":
      if (!hasDiscoveredStockNode(state, effect.nodeId)) {
        state.discoveredStockNodeIds.push(effect.nodeId);
      }
      break;
    case "focus_stock_node":
      state.activeStockNodeId = effect.nodeId;
      if (!hasDiscoveredStockNode(state, effect.nodeId)) {
        state.discoveredStockNodeIds.push(effect.nodeId);
      }
      break;
    case "clear_stock_node_focus":
      state.activeStockNodeId = null;
      break;
    case "collect_stock_item": {
      const current = getStockQuantity(state, effect.locationId, effect.nodeId, effect.itemId);
      if (current <= 0) {
        break;
      }
      const collected = Math.min(effect.amount, current);
      setStockQuantity(state, effect.locationId, effect.nodeId, effect.itemId, current - collected);
      state.inventory[effect.itemId] = (state.inventory[effect.itemId] ?? 0) + collected;
      break;
    }
    case "collect_stock_money": {
      const current = getStockMoney(state, effect.locationId, effect.nodeId);
      if (current <= 0) {
        break;
      }
      const collected = Math.min(effect.amount, current);
      setStockMoney(state, effect.locationId, effect.nodeId, current - collected);
      state.money = Math.max(0, state.money + collected);
      break;
    }
  }
}

export function derivePlayer(state: GameState): Player {
  return {
    id: "protagonist",
    name: "Unnamed Survivor",
    hp: state.stats.hp,
    sanity: state.stats.mind,
    hunger: state.stats.fullness,
    money: state.money,
    inventory: { ...state.inventory },
    skills: [...state.skills],
    flags: { ...state.flags },
    statusEffects: state.starvationLevel > 0 ? ["starving"] : [],
  };
}

export function deriveWorldState(state: GameState): WorldState {
  const visitedIds = Object.entries(state.flags)
    .filter(([key]) => key.startsWith("visited_") && state.flags[key])
    .map(([key]) => key.replace("visited_", ""));
  const knownIds = Object.entries(state.flags)
    .filter(([key]) => key.startsWith("known_") && state.flags[key])
    .map(([key]) => key.replace("known_", ""));
  const unlockedIds = [...new Set([...visitedIds, ...knownIds, state.location])];
  const globalFlags = Object.entries(state.flags)
    .filter(([key, value]) => !key.startsWith("visited_") && !key.startsWith("known_") && !key.startsWith("day") && Boolean(value))
    .map(([key]) => key);
  return {
    currentTime: PHASES[state.phaseIndex] ?? "morning",
    currentDay: state.day,
    phaseIndex: state.phaseIndex,
    globalFlags,
    unlockedLocationIds: unlockedIds,
    visitedLocationIds: visitedIds,
    worldElapsedMs: state.worldElapsedMs,
  };
}

export function toGameStateV2(state: GameState): GameStateV2 {
  const activeQuestIds = Object.entries(state.quests)
    .filter(([, status]) => status === "active")
    .map(([id]) => id);
  const completedQuestIds = Object.entries(state.quests)
    .filter(([, status]) => status === "completed")
    .map(([id]) => id);
  return {
    player: derivePlayer(state),
    worldState: deriveWorldState(state),
    currentLocationId: state.location,
    currentSceneId: state.sceneId,
    activeQuestIds,
    completedQuestIds,
    log: state.log.map((entry) => ({ ...entry })),
    systemNote: state.systemNote,
    isGameOver: state.isGameOver,
    gameOverReason: state.gameOverReason,
    stageClear: state.stageClear,
    turn: Math.floor(state.worldElapsedMs / (15 * 60 * 1000 / 5)),
  };
}
