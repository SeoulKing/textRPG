/**
 * GameState helpers.
 */

import { PHASES, REAL_DAY_MS } from "./base-data";
import { resolveItemText } from "./item-text";
import { buildRuntimeRegistry } from "./runtime-registry";
import {
  getProgressionSkillLevel,
  selectRandomOutcome,
} from "./skill-progression";
import type {
  Condition,
  DailyLimit,
  Effect,
  GameState,
  GameStateV2,
  Objective,
  Player,
  QuestReward,
  SkillUse,
  WorldState,
} from "./schemas";

function activeDayKey(state: GameState, flag: string) {
  return `day${state.day}_${flag}`;
}

export function getDailyUsage(state: GameState, limit: DailyLimit): number {
  const value = state.flags[activeDayKey(state, limit.key)];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

export function getRemainingDailyUses(state: GameState, limit: DailyLimit): number {
  return Math.max(0, limit.max - getDailyUsage(state, limit));
}

export function consumeDailyUse(state: GameState, limit: DailyLimit): void {
  const remaining = getRemainingDailyUses(state, limit);
  if (remaining <= 0) {
    throw new Error("오늘 가능한 횟수를 모두 사용했다.");
  }
  state.flags[activeDayKey(state, limit.key)] = getDailyUsage(state, limit) + 1;
}

type SurvivalStatKey = "hp" | "mind" | "energy";
type TimeEffect = Extract<Effect, { type: "advance_time" | "advance_to_daybreak" }>;

const SURVIVAL_STAT_MAX: Record<SurvivalStatKey, number> = {
  hp: 10,
  mind: 10,
  energy: 15,
};

function clampStat(statKey: SurvivalStatKey, value: number) {
  return Math.max(0, Math.min(SURVIVAL_STAT_MAX[statKey], value));
}

function fallbackStatForDepleted(statKey: SurvivalStatKey): SurvivalStatKey | null {
  if (statKey === "energy") {
    return "mind";
  }
  if (statKey === "mind") {
    return "hp";
  }
  return null;
}

export function changeSurvivalStat(state: GameState, statKey: SurvivalStatKey, delta: number) {
  if (delta >= 0) {
    state.stats[statKey] = clampStat(statKey, state.stats[statKey] + delta);
    return;
  }

  let target: SurvivalStatKey | null = statKey;
  let remaining = Math.abs(delta);
  while (target && remaining > 0) {
    if (state.stats[target] > 0) {
      state.stats[target] = clampStat(target, state.stats[target] - 1);
      remaining -= 1;
      continue;
    }

    target = fallbackStatForDepleted(target);
  }
}

export function getStockStateKey(locationId: string, nodeId: string, itemId: string) {
  return `${locationId}:${nodeId}:${itemId}`;
}

export function getStockMoneyKey(locationId: string, nodeId: string) {
  return `${locationId}:${nodeId}:$money`;
}

export function getStockNode(state: GameState, locationId: string, nodeId: string) {
  const registry = buildRuntimeRegistry(state);
  const location = registry.locations[locationId];
  if (!location) {
    return null;
  }
  return location.stockNodes.find((node) => node.id === nodeId) ?? null;
}

export function getStockNodeLocationId(state: GameState, nodeId: string) {
  const registry = buildRuntimeRegistry(state);
  for (const location of Object.values(registry.locations)) {
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
  const hours = String(Math.floor(shiftedMinutes / 60)).padStart(2, "0");
  const minutes = String(shiftedMinutes % 60).padStart(2, "0");
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

  const node = getStockNode(state, locationId, nodeId);
  const stockItem = node?.items.find((entry) => entry.itemId === itemId);
  return stockItem?.initialQuantity ?? 0;
}

export function getStockMoney(state: GameState, locationId: string, nodeId: string) {
  const key = getStockMoneyKey(locationId, nodeId);
  if (typeof state.stockState[key] === "number") {
    return state.stockState[key];
  }

  const node = getStockNode(state, locationId, nodeId);
  return node?.money ?? 0;
}

export function isStockNodeDepleted(state: GameState, locationId: string, nodeId: string) {
  const node = getStockNode(state, locationId, nodeId);
  if (!node || (node.money <= 0 && node.items.length === 0)) {
    return false;
  }

  return getStockMoney(state, locationId, nodeId) <= 0 &&
    node.items.every((item) =>
      getStockQuantity(state, locationId, nodeId, item.itemId) <= 0
    );
}

export function isStockNodeGone(state: GameState, nodeId: string) {
  const locationId = getStockNodeLocationId(state, nodeId);
  if (!locationId) {
    return false;
  }
  const node = getStockNode(state, locationId, nodeId);
  return node?.depletionBehavior === "disappear" &&
    isStockNodeDepleted(state, locationId, nodeId);
}

function getEquivalentInventoryItemIds(state: GameState, itemId: string) {
  const directCount = state.inventory[itemId] ?? 0;
  if (!itemId.startsWith("dyn_")) {
    return directCount > 0 ? [itemId] : [];
  }

  const registry = buildRuntimeRegistry(state);
  const targetName = (registry.items[itemId] as { name?: string } | undefined)?.name;
  if (!targetName) {
    return directCount > 0 ? [itemId] : [];
  }

  const matchingIds = Object.keys(state.inventory).filter(
    (candidateId) =>
      (state.inventory[candidateId] ?? 0) > 0 &&
      candidateId.startsWith("dyn_") &&
      (registry.items[candidateId] as { name?: string } | undefined)?.name === targetName,
  );

  return Array.from(new Set([itemId, ...matchingIds])).filter((candidateId) => (state.inventory[candidateId] ?? 0) > 0);
}

function getInventoryAmount(state: GameState, itemId: string) {
  return getEquivalentInventoryItemIds(state, itemId).reduce(
    (total, candidateId) => total + (state.inventory[candidateId] ?? 0),
    0,
  );
}

function toolDisplayName(state: GameState, itemId: string) {
  const registry = buildRuntimeRegistry(state);
  return String((registry.items[itemId] as { name?: string } | undefined)?.name ?? itemId);
}

function toolMaxDurability(state: GameState, itemId: string) {
  const registry = buildRuntimeRegistry(state);
  const item = registry.items[itemId] as { maxDurability?: number } | undefined;
  const maxDurability = item?.maxDurability;
  return Number.isInteger(maxDurability) && Number(maxDurability) > 0
    ? Number(maxDurability)
    : 0;
}

function ensureToolDurability(state: GameState, itemId: string) {
  state.toolDurability ??= {};
  const maxDurability = toolMaxDurability(state, itemId);
  if (maxDurability <= 0 || (state.inventory[itemId] ?? 0) <= 0) {
    delete state.toolDurability[itemId];
    return 0;
  }

  const current = state.toolDurability[itemId];
  if (Number.isInteger(current) && current > 0) {
    return Math.min(current, maxDurability);
  }

  state.toolDurability[itemId] = maxDurability;
  return maxDurability;
}

function setToolDurability(state: GameState, itemId: string, value: number) {
  state.toolDurability ??= {};
  const maxDurability = toolMaxDurability(state, itemId);
  if (maxDurability <= 0 || value <= 0) {
    delete state.toolDurability[itemId];
    return;
  }
  state.toolDurability[itemId] = Math.min(value, maxDurability);
}

function damageTool(state: GameState, itemId: string, amount: number) {
  const count = state.inventory[itemId] ?? 0;
  if (count <= 0) {
    appendLogEntry(state, `${toolDisplayName(state, itemId)}이(가) 없어 내구도를 소모하지 못했다.`);
    return;
  }

  const current = ensureToolDurability(state, itemId);
  const next = current - Math.max(1, amount);
  if (next > 0) {
    state.toolDurability[itemId] = next;
    return;
  }

  delete state.inventory[itemId];
  delete state.toolDurability[itemId];
  appendLogEntry(state, `${toolDisplayName(state, itemId)}이(가) 망가졌다.`);
}

function removeInventoryAmount(state: GameState, itemId: string, amount: number) {
  let remaining = amount;
  for (const candidateId of getEquivalentInventoryItemIds(state, itemId)) {
    if (remaining <= 0) {
      break;
    }

    const current = state.inventory[candidateId] ?? 0;
    const consumed = Math.min(current, remaining);
    const next = current - consumed;
    if (next <= 0) {
      delete state.inventory[candidateId];
      delete state.toolDurability?.[candidateId];
    } else {
      state.inventory[candidateId] = next;
    }
    remaining -= consumed;
  }

  return amount - remaining;
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

export function isTimeEffect(effect: Effect): effect is TimeEffect {
  return effect.type === "advance_time" || effect.type === "advance_to_daybreak";
}

export function evaluateObjective(objective: Objective, state: GameState): boolean {
  switch (objective.type) {
    case "obtain_item":
      return getInventoryAmount(state, objective.itemId) >= objective.amount;
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
      return getInventoryAmount(state, condition.itemId) >= condition.amount;
    case "not_has_item":
      return getInventoryAmount(state, condition.itemId) < condition.amount;
    case "skill_gte":
      if (condition.skillId === "collection" || condition.skillId === "exploration") {
        return getProgressionSkillLevel(state.skillProgress, condition.skillId) >= condition.value;
      }
      return state.skills.includes(condition.skillId) && condition.value <= 1;
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
    case "stat_gte":
      return state.stats[condition.stat] >= condition.value;
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

export type ApplyEffectOptions = {
  skillUse?: SkillUse;
  rng?: () => number;
};

export function applyEffect(
  effect: Effect,
  state: GameState,
  options: ApplyEffectOptions = {},
): void {
  switch (effect.type) {
    case "random_outcome": {
      const selected = selectRandomOutcome(effect.outcomes, {
        skillUse: options.skillUse,
        progress: state.skillProgress,
        rng: options.rng,
      });
      if (!selected) {
        break;
      }
      selected.effects.forEach((outcomeEffect) => applyEffect(outcomeEffect, state, options));
      break;
    }
    case "change_stat":
      changeSurvivalStat(state, effect.stat, effect.value);
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
      removeInventoryAmount(state, effect.itemId, effect.amount);
      break;
    }
    case "set_tool_durability":
      setToolDurability(state, effect.itemId, effect.value);
      break;
    case "damage_tool":
      damageTool(state, effect.itemId, effect.amount);
      break;
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
      appendLogEntry(state, resolveItemText(effect.message, buildRuntimeRegistry(state)));
      break;
    case "set_scene":
      state.sceneId = effect.sceneId;
      break;
    case "set_random_scene": {
      const registry = buildRuntimeRegistry(state);
      const candidates = Object.values(registry.scenes)
        .filter((scene) => scene.locationId === state.location)
        .filter((scene) => (scene.tags ?? []).includes(effect.tag))
        .filter((scene) => scene.conditions.every((condition) => evaluateCondition(condition, state)));
      if (candidates.length > 0) {
        const roll = options.rng ? options.rng() : Math.random();
        const normalizedRoll = Number.isFinite(roll)
          ? Math.max(0, Math.min(1 - Number.EPSILON, roll))
          : 0;
        const index = Math.floor(normalizedRoll * candidates.length);
        state.sceneId = candidates[Math.min(index, candidates.length - 1)].id;
      }
      break;
    }
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
    case "collect_stock_item_all": {
      const current = getStockQuantity(state, effect.locationId, effect.nodeId, effect.itemId);
      if (current <= 0) {
        break;
      }
      setStockQuantity(state, effect.locationId, effect.nodeId, effect.itemId, 0);
      state.inventory[effect.itemId] = (state.inventory[effect.itemId] ?? 0) + current;
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
    case "collect_stock_money_all": {
      const current = getStockMoney(state, effect.locationId, effect.nodeId);
      if (current <= 0) {
        break;
      }
      setStockMoney(state, effect.locationId, effect.nodeId, 0);
      state.money = Math.max(0, state.money + current);
      break;
    }
    case "advance_time":
    case "advance_to_daybreak":
      throw new Error(`Time effect '${effect.type}' must be handled by the rules layer.`);
    default: {
      const exhaustiveCheck: never = effect;
      return exhaustiveCheck;
    }
  }
}

export function derivePlayer(state: GameState): Player {
  return {
    id: "protagonist",
    name: "Unnamed Survivor",
    hp: state.stats.hp,
    sanity: state.stats.mind,
    energy: state.stats.energy,
    money: state.money,
    inventory: { ...state.inventory },
    skills: [...state.skills],
    flags: { ...state.flags },
    statusEffects: state.exhaustionLevel > 0 ? ["exhausted"] : [],
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
