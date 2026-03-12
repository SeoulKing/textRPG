/**
 * GameState ↔ Player / WorldState / GameStateV2 변환 유틸
 * Condition 평가 / Effect 적용
 * OBJECT_MODEL.md Phase 1
 */

import { PHASES } from "./base-data";
import type { GameState, Condition, Effect, Objective, QuestReward } from "./schemas";
import type { Player, WorldState, GameStateV2 } from "./schemas";

function activeDayKey(state: GameState, flag: string) {
  return `day${state.day}_${flag}`;
}

/** Objective 달성 여부 평가 */
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
      return Boolean(state.flags[activeDayKey(state, objective.flag)]);
    case "stage_clear":
      return state.stageClear;
    default:
      return false;
  }
}

/** Quest 보상 적용 */
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

/** Condition을 현재 state 기준으로 평가 */
export function evaluateCondition(condition: Condition, state: GameState): boolean {
  switch (condition.type) {
    case "has_item":
      return (state.inventory[condition.itemId] ?? 0) >= condition.amount;
    case "skill_gte":
      return state.skills.includes(condition.skillId); // 레벨 없음, 보유 여부만
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
    default:
      return false;
  }
}

/** Effect를 state에 적용 (변이) */
export function applyEffect(effect: Effect, state: GameState): void {
  switch (effect.type) {
    case "change_stat":
      state.stats[effect.stat] = Math.max(0, Math.min(10, state.stats[effect.stat] + effect.value));
      break;
    case "set_flag":
      state.flags[effect.flag] = true;
      break;
    case "add_item":
      state.inventory[effect.itemId] = (state.inventory[effect.itemId] ?? 0) + effect.amount;
      break;
    case "remove_item":
      const cur = state.inventory[effect.itemId] ?? 0;
      const next = Math.max(0, cur - effect.amount);
      if (next <= 0) delete state.inventory[effect.itemId];
      else state.inventory[effect.itemId] = next;
      break;
    case "add_money":
      state.money = Math.max(0, state.money + effect.amount);
      break;
    case "travel":
      state.location = effect.locationId;
      state.flags[`visited_${effect.locationId}`] = true;
      break;
  }
}

export function derivePlayer(state: GameState): Player {
  const flagsArray = Object.entries(state.flags)
    .filter(([, v]) => v === true || (typeof v === "string" && v.length > 0))
    .map(([k]) => k);
  return {
    id: "protagonist",
    name: "이름 없는 생존자",
    hp: state.stats.hp,
    sanity: state.stats.mind,
    hunger: state.stats.fullness,
    money: state.money,
    inventory: { ...state.inventory },
    skills: [...state.skills],
    flags: { ...state.flags },
    statusEffects: state.starvationLevel > 0 ? ["굶주림"] : [],
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
    .filter(
      ([k, v]) =>
        !k.startsWith("visited_") &&
        !k.startsWith("known_") &&
        !k.startsWith("day") &&
        (v === true || (typeof v === "string" && v.length > 0))
    )
    .map(([k]) => k);
  return {
    currentTime: PHASES[state.phaseIndex] ?? "아침",
    currentDay: state.day,
    phaseIndex: state.phaseIndex,
    globalFlags,
    unlockedLocationIds: unlockedIds,
    visitedLocationIds: visitedIds,
    worldElapsedMs: state.worldElapsedMs,
  };
}

export function toGameStateV2(state: GameState): GameStateV2 {
  const player = derivePlayer(state);
  const worldState = deriveWorldState(state);
  const activeQuestIds = Object.entries(state.quests)
    .filter(([, s]) => s === "active")
    .map(([id]) => id);
  const completedQuestIds = Object.entries(state.quests)
    .filter(([, s]) => s === "completed")
    .map(([id]) => id);
  return {
    player,
    worldState,
    currentLocationId: state.location,
    currentSceneId: state.sceneId,
    activeQuestIds,
    completedQuestIds,
    log: [...state.log],
    systemNote: state.systemNote,
    isGameOver: state.isGameOver,
    gameOverReason: state.gameOverReason,
    stageClear: state.stageClear,
    turn: Math.floor(state.worldElapsedMs / (15 * 60 * 1000 / 5)), // 대략 턴 수
  };
}
