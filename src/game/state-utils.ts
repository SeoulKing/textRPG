/**
 * GameState helpers.
 */

import { PHASES } from "./base-data";
import type { GameState, Condition, Effect, Objective, QuestReward } from "./schemas";
import type { Player, WorldState, GameStateV2 } from "./schemas";

function activeDayKey(state: GameState, flag: string) {
  return `day${state.day}_${flag}`;
}

function clampStat(value: number) {
  return Math.max(0, Math.min(10, value));
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
      break;
    case "start_quest":
      state.quests[effect.questId] = "active";
      break;
    case "complete_quest":
      state.quests[effect.questId] = "completed";
      break;
    case "log":
      state.log.unshift(effect.message);
      state.log = state.log.slice(0, 20);
      break;
    case "set_scene":
      state.sceneId = effect.sceneId;
      break;
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
    .filter(([k]) => k.startsWith("visited_") && state.flags[k])
    .map(([k]) => k.replace("visited_", ""));
  const knownIds = Object.entries(state.flags)
    .filter(([k]) => k.startsWith("known_") && state.flags[k])
    .map(([k]) => k.replace("known_", ""));
  const unlockedIds = [...new Set([...visitedIds, ...knownIds, state.location])];
  const globalFlags = Object.entries(state.flags)
    .filter(([k, v]) => !k.startsWith("visited_") && !k.startsWith("known_") && !k.startsWith("day") && Boolean(v))
    .map(([k]) => k);
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
    log: [...state.log],
    systemNote: state.systemNote,
    isGameOver: state.isGameOver,
    gameOverReason: state.gameOverReason,
    stageClear: state.stageClear,
    turn: Math.floor(state.worldElapsedMs / (15 * 60 * 1000 / 5)),
  };
}
