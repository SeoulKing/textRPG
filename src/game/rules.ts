import {
  AUTO_FULLNESS_TICK_MS,
  PHASE_DURATION_MS,
  PHASES,
  REAL_DAY_MS,
  SAVE_VERSION,
  STARVATION_TICK_MS,
} from "./base-data";
import { actionConditionsMet, choiceConditionsMet, resolveNextSceneDefinition, resolveSceneDefinition } from "./content-engine";
import { buildRuntimeRegistry, getQuestDefinitions, getRuntimeLinkedLocationIds, getRuntimeLocationDefinition } from "./runtime-registry";
import { appendLogEntry, applyEffect, evaluateCondition, evaluateObjective, getStockMoneyKey, getStockStateKey } from "./state-utils";
import type { ActionDefinition, ChoiceDefinition, DayEvolutionUpdate, GameAction, GameState } from "./schemas";

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

export function refreshLocationKnowledge(state: GameState) {
  const registry = buildRuntimeRegistry(state);
  markLocationKnown(state, state.location);
  state.flags[`visited_${state.location}`] = true;
  getRuntimeLinkedLocationIds(state, registry, state.location).forEach((locationId) => {
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

function findStockNodeName(state: GameState, nodeId: string) {
  const registry = buildRuntimeRegistry(state);
  for (const location of Object.values(registry.locations)) {
    const node = location.stockNodes.find((entry) => entry.id === nodeId);
    if (node) {
      return node.name;
    }
  }
  return nodeId;
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

function summarizeSystemNote(previousState: GameState, nextState: GameState, fallback = "") {
  const nextRegistry = buildRuntimeRegistry(nextState);
  const parts: string[] = [];

  if (!previousState.isGameOver && nextState.isGameOver && nextState.gameOverReason) {
    return nextState.gameOverReason;
  }

  if (previousState.location !== nextState.location) {
    parts.push(`이동: ${String(nextRegistry.locations[nextState.location]?.name ?? nextState.location)}`);
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
      parts.push(formatSignedDelta(delta, itemName(nextState, itemId)));
    }
  });

  const previousDiscovered = new Set(previousState.discoveredStockNodeIds || []);
  (nextState.discoveredStockNodeIds || []).forEach((nodeId) => {
    if (!previousDiscovered.has(nodeId)) {
      parts.push(`발견: ${findStockNodeName(nextState, nodeId)}`);
    }
  });

  if (previousState.activeStockNodeId !== nextState.activeStockNodeId) {
    if (nextState.activeStockNodeId) {
      parts.push(`확인: ${findStockNodeName(nextState, nextState.activeStockNodeId)}`);
    } else if (previousState.activeStockNodeId) {
      parts.push(`복귀: ${String(nextRegistry.locations[nextState.location]?.name ?? nextState.location)}`);
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
      parts.push(`퀘스트 완료: ${questTitle(nextState, questId)}`);
    } else if ((previousStatus === "inactive" || !previousStatus) && nextStatus === "active") {
      parts.push(`퀘스트 시작: ${questTitle(nextState, questId)}`);
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

export function syncScene(state: GameState, preferredSceneId?: string) {
  const registry = buildRuntimeRegistry(state);
  const scene =
    preferredSceneId !== undefined && preferredSceneId !== ""
      ? resolveNextSceneDefinition(state, registry, state.location, preferredSceneId)
      : resolveSceneDefinition(state, registry, state.location);
  state.sceneId = scene.id;
  state.activeEventId = scene.eventId ?? null;
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

function applyDayTransition(state: GameState, previousDay: number) {
  if (state.day === previousDay) {
    return;
  }

  state.autoFullnessElapsedMs = 0;
  state.starvationElapsedMs = 0;
  delete state.flags.rain_bucket_drawn_today;
  state.flags[`day${state.day}_mealSecured`] = false;
  state.flags[`day${state.day}_waterSecured`] = false;
  state.lastSleepFullness = state.stats.fullness;
  applyPlannedWorldEvolution(state);
  addLog(state, `${state.day}일차가 시작되었다.`);
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
    triggerGameOver(state, "몸이 더는 생존을 버티지 못했다.");
  }
}

export function createInitialGameState(): GameState {
  const now = Date.now();
  const registry = buildRuntimeRegistry();
  const state: GameState = {
    saveVersion: SAVE_VERSION,
    sceneId: "prologue_opening",
    activeEventId: null,
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
    flags: {
      visited_shelter: true,
    },
    quests: Object.fromEntries(getQuestDefinitions(registry).map((quest) => [quest.id, "inactive" as const])),
    lastSleepFullness: 8,
    starvationLevel: 0,
    log: [{ timestampLabel: "1일차 06:00", message: "눈을 뜬 당신은 오늘 하루를 어떻게든 버텨야 한다는 사실부터 떠올린다." }],
    systemNote: "",
  };
  refreshLocationKnowledge(state);
  syncScene(state, state.sceneId);
  syncQuestState(state, {});
  return state;
}

function resolveTravelRequirement(state: GameState, targetId: string) {
  const registry = buildRuntimeRegistry(state);
  const currentLocation = getRuntimeLocationDefinition(state, registry, state.location);
  const link = currentLocation.links[targetId];
  if (!link) {
    return {
      allowed: false,
      reason: "거기로 바로 이어지는 길은 아직 없다.",
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

function useItem(state: GameState, itemId: string) {
  const registry = buildRuntimeRegistry(state);
  const item = registry.items[itemId] as {
    name: string;
    kind: string;
    effects: { hp: number; mind: number; fullness: number; starvationRelief: number };
  } | undefined;
  const count = state.inventory[itemId] || 0;
  if (!item || count <= 0) {
    throw new Error("지금은 그 아이템을 사용할 수 없다.");
  }
  if (!["food", "drink", "medicine"].includes(item.kind)) {
    throw new Error("그 물건은 바로 사용할 수 없다.");
  }

  consumeCurrentSceneIntro(state);
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

function consumeCurrentSceneIntro(state: GameState) {
  const registry = buildRuntimeRegistry(state);
  const scene = resolveSceneDefinition(state, registry, state.location);
  const introFlag = scene.introFlag;
  if (!introFlag || state.flags[introFlag]) {
    return;
  }

  state.flags[introFlag] = true;
}

function jumpToNextDaybreak(state: GameState) {
  const previousDay = state.day;
  state.worldElapsedMs = Math.floor(state.worldElapsedMs / REAL_DAY_MS) * REAL_DAY_MS + REAL_DAY_MS;
  setClockFromElapsed(state);
  applyDayTransition(state, previousDay);
  refreshLocationKnowledge(state);
}

type ExecutionResult = {
  fallbackNote: string;
  preferredSceneId?: string;
};

function applyDefinitionEffects(state: GameState, effects: ActionDefinition["effects"] | ChoiceDefinition["effects"]) {
  effects.forEach((effect) => {
    if (effect.type === "advance_to_daybreak") {
      jumpToNextDaybreak(state);
      return;
    }
    applyEffect(effect, state);
  });
}

function applyShelterSleepBonus(state: GameState) {
  if (!state.flags.shelter_wall_patch) {
    return;
  }

  adjustStat(state, "hp", 1);
  adjustStat(state, "mind", 1);
  addLog(state, "보강해 둔 천막이 바람을 조금 막아 주어, 한숨 자고 난 뒤 몸과 마음이 한결 가벼워졌다.");
}

function executeShelterCookingAction(state: GameState, action: ActionDefinition): ExecutionResult {
  const hasIngredients =
    hasItemAmount(state, "rawRice", 1) &&
    hasItemAmount(state, "vegetables", 1) &&
    hasItemAmount(state, "woodPlank", 1);

  if (!hasIngredients) {
    applyDefinitionEffects(state, action.failureEffects);
    return {
      preferredSceneId: action.nextSceneId,
      fallbackNote: action.failureNote ?? action.label,
    };
  }

  applyDefinitionEffects(state, action.effects);
  return {
    preferredSceneId: action.nextSceneId,
    fallbackNote: action.label,
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

function executeActionDefinition(state: GameState, action: ActionDefinition): ExecutionResult {
  if (!actionConditionsMet(action, state)) {
    if (action.presentationMode !== "always") {
      throw new Error("지금은 그 행동을 할 수 없다.");
    }

    applyDefinitionEffects(state, action.failureEffects);
    return {
      preferredSceneId: action.nextSceneId,
      fallbackNote: dynamicDeliverFailureNote(state, action),
    };
  }

  consumeCurrentSceneIntro(state);
  if (action.id === "cook_at_shelter") {
    return executeShelterCookingAction(state, action);
  }
  applyDefinitionEffects(state, action.effects);
  if (action.id === "sleep_at_shelter") {
    applyShelterSleepBonus(state);
  }
  return {
    preferredSceneId: action.nextSceneId,
    fallbackNote: action.label,
  };
}

function executeSceneChoiceDefinition(state: GameState, choice: ChoiceDefinition): ExecutionResult {
  if (!choiceConditionsMet(choice, state)) {
    if (choice.presentationMode !== "always") {
      throw new Error("지금은 그 선택지를 고를 수 없다.");
    }

    applyDefinitionEffects(state, choice.failureEffects);
    return {
      preferredSceneId: choice.nextSceneId,
      fallbackNote: choice.failureNote ?? choice.label,
    };
  }

  consumeCurrentSceneIntro(state);
  applyDefinitionEffects(state, choice.effects);
  return {
    preferredSceneId: choice.nextSceneId,
    fallbackNote: choice.label,
  };
}

export function performAction(state: GameState, action: GameAction) {
  const previousState = structuredClone(state);
  syncClock(state);
  const registry = buildRuntimeRegistry(state);
  let fallbackNote = "";
  let preferredSceneId: string | undefined;

  switch (action.type) {
    case "travel": {
      const { allowed, reason } = resolveTravelRequirement(state, action.targetId);
      if (!allowed) {
        throw new Error(reason);
      }
      consumeCurrentSceneIntro(state);
      state.location = action.targetId;
      state.flags[`visited_${action.targetId}`] = true;
      state.activeStockNodeId = null;
      refreshLocationKnowledge(state);
      fallbackNote = `이동: ${String(registry.locations[action.targetId]?.name ?? action.targetId)}`;
      addLog(state, `${String(registry.locations[action.targetId]?.name ?? action.targetId)}(으)로 움직였다.`);
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
      ({ preferredSceneId, fallbackNote } = executeActionDefinition(state, definition));
      break;
    }
    case "content_choice": {
      const definition = registry.choices[action.choiceId];
      if (!definition) {
        throw new Error(`알 수 없는 선택지 '${action.choiceId}'이다.`);
      }
      ({ preferredSceneId, fallbackNote } = executeSceneChoiceDefinition(state, definition));
      break;
    }
    case "rest": {
      const definition = registry.actions.rest_light_at_shelter;
      ({ preferredSceneId, fallbackNote } = executeActionDefinition(state, definition));
      break;
    }
    case "cook": {
      const definition = registry.actions.cook_at_shelter;
      ({ preferredSceneId, fallbackNote } = executeActionDefinition(state, definition));
      break;
    }
    case "buy_meal": {
      const definition = registry.actions.buy_meal_at_kitchen;
      ({ preferredSceneId, fallbackNote } = executeActionDefinition(state, definition));
      break;
    }
    case "generate_event": {
      consumeCurrentSceneIntro(state);
      fallbackNote = "이야기를 이어간다.";
      break;
    }
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }

  syncQuestState(state, previousState.quests);
  syncScene(state, preferredSceneId);
  applySystemNote(previousState, state, fallbackNote);
}

export function summarizeState(state: GameState) {
  const registry = buildRuntimeRegistry(state);
  return {
    day: state.day,
    phase: PHASES[state.phaseIndex],
    location: String(registry.locations[state.location]?.name ?? state.location),
    hp: state.stats.hp,
    mind: state.stats.mind,
    fullness: state.stats.fullness,
    money: state.money,
    skills: [...state.skills],
    inventory: { ...state.inventory },
    flags: { ...state.flags },
  };
}
