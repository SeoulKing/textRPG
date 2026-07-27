import { baseItems } from "./data/items";
import { advanceGameMinutes, syncClock } from "./rules";
import { appendLogEntry, changeSurvivalStat } from "./state-utils";
import {
  buildTemplateSubwayFloorBundle,
  buildTemplateSubwayRunPlan,
  prepareSubwayFloorGeneration,
} from "./subway-expedition-generator";
import type {
  ActionChoice,
  GameState,
  SceneCard,
  SubwayExpeditionFloor,
  SubwayExpeditionOption,
  SubwayFloorProgress,
  SubwayOutcomeMechanics,
  SubwayOutcomeVariant,
  SubwayRunPlan,
  SubwayStoryMemory,
} from "./schemas";

function addLog(state: GameState, message: string) {
  appendLogEntry(state, message);
}

function itemName(itemId: string) {
  return (baseItems as Record<string, { name?: string }>)[itemId]?.name ?? itemId;
}

function addCarriedLoot(state: GameState, itemId: string, amount: number) {
  state.subwayExpedition.carriedLoot[itemId] =
    (state.subwayExpedition.carriedLoot[itemId] ?? 0) + amount;
  state.subwayExpedition.currentFloorProgress.floorLoot[itemId] =
    (state.subwayExpedition.currentFloorProgress.floorLoot[itemId] ?? 0) + amount;
}

function resetFloorProgress(state: GameState) {
  state.subwayExpedition.currentFloorProgress = {
    phase: "event",
    currentResult: null,
    eventResolved: false,
    eventChoiceLabel: "",
    eventOutcome: "",
    searchedLootSpotIds: [],
    floorLoot: {},
  };
}

function emptyStoryMemory(): SubwayStoryMemory {
  return {
    facts: [],
    unresolvedThreads: [],
    resolvedThreads: [],
    recentSummaries: [],
    lastBridge: "",
  };
}

function storyMemoryFromPlan(plan: SubwayRunPlan): SubwayStoryMemory {
  return {
    ...emptyStoryMemory(),
    facts: uniqueStrings(plan.facts),
    unresolvedThreads: uniqueStrings(plan.unresolvedThreads),
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function mergeOutcomeMemory(
  memory: SubwayStoryMemory,
  outcome: SubwayOutcomeVariant,
) {
  mergeStoryMemoryLists(memory, {
    facts: outcome.facts,
    unresolvedThreads: outcome.unresolvedThreads,
    resolvedThreads: outcome.resolvedThreads,
    recentSummaries: [outcome.summary],
  });
  memory.lastBridge = outcome.nextFloorBridge;
}

function mergeStoryMemoryLists(
  memory: SubwayStoryMemory,
  delta: Pick<
    SubwayStoryMemory,
    "facts" | "unresolvedThreads" | "resolvedThreads" | "recentSummaries"
  >,
) {
  const resolvedThreads = uniqueStrings([
    ...memory.resolvedThreads,
    ...delta.resolvedThreads,
  ]);
  const resolved = new Set(resolvedThreads);
  memory.facts = uniqueStrings([...memory.facts, ...delta.facts]);
  memory.resolvedThreads = resolvedThreads;
  memory.unresolvedThreads = uniqueStrings([
    ...uniqueStrings(memory.unresolvedThreads).filter((thread) => !resolved.has(thread)),
    ...uniqueStrings(delta.unresolvedThreads).filter((thread) => !resolved.has(thread)),
  ]);
  memory.recentSummaries = uniqueStrings([
    ...memory.recentSummaries,
    ...delta.recentSummaries,
  ]).slice(-8);
}

function mergeFloorMemory(
  memory: SubwayStoryMemory,
  floor: SubwayExpeditionFloor,
) {
  if (!floor.memoryDelta) {
    return;
  }
  mergeStoryMemoryLists(memory, floor.memoryDelta);
}

function currentFloorPhase(progress: SubwayFloorProgress) {
  // Saves made before explicit phases existed default to "event" on parse.
  // Treat an already-resolved legacy event as the loot phase.
  if (progress.phase === "event" && progress.eventResolved && !progress.currentResult) {
    return "loot" as const;
  }
  if (
    (progress.phase === "event_result" || progress.phase === "loot_result") &&
    !progress.currentResult
  ) {
    return progress.eventResolved ? "loot" as const : "event" as const;
  }
  return progress.phase;
}

function preparedFloorForState(
  state: GameState,
  floor: SubwayExpeditionFloor | null | undefined,
  expectedDepth: number,
) {
  if (!floor || floor.depth !== expectedDepth) {
    return null;
  }
  const prepared = structuredClone(floor);
  const alreadyHasAntenna =
    (state.inventory.radioAntenna ?? 0) > 0 ||
    (state.subwayExpedition.carriedLoot.radioAntenna ?? 0) > 0;
  if (alreadyHasAntenna) {
    let adjustedUniqueLoot = false;
    prepared.lootSpots.forEach((spot) => {
      const previousLength = spot.contents.length;
      spot.contents = spot.contents.filter((entry) => entry.itemId !== "radioAntenna");
      if (spot.contents.length === previousLength) {
        return;
      }
      adjustedUniqueLoot = true;
      spot.resultParagraphs = spot.contents.length > 0
        ? [
            `${spot.name} 안쪽을 다시 확인해 남은 물자를 챙겼다.`,
            `수색 결과: ${spot.contents
              .map((entry) => `${itemName(entry.itemId)} ${entry.amount}개`)
              .join(", ")}.`,
          ]
        : [
            `${spot.name} 안쪽까지 확인했지만 이미 가진 장비와 겹치지 않는 쓸 만한 물자는 남아 있지 않았다.`,
            "수색 결과: 쓸 만한 물자 없음.",
          ];
    });
    if (adjustedUniqueLoot) {
      prepared.source = "template";
    }
  }
  return prepared;
}

function templateFloorForState(
  state: GameState,
  gameId: string,
  depth: number,
  previousOutcome: string,
) {
  return buildTemplateSubwayFloorBundle(
    prepareSubwayFloorGeneration({
      gameId,
      state,
      depth,
      previousOutcome,
      runPlan: state.subwayExpedition.runPlan,
      runMemory: state.subwayExpedition.storyMemory,
    }),
  );
}

function riskChance(option: SubwayExpeditionOption, depth: number) {
  const base = {
    low: 0.1,
    medium: 0.28,
    high: 0.48,
  }[option.riskHint];
  const depthPressure = Math.min(0.28, Math.max(0, depth - 3) * 0.025);
  const approachAdjustment = option.approach === "careful"
    ? -0.12
    : option.approach === "force"
      ? 0.1
      : 0;
  return Math.min(0.84, Math.max(0.05, base + depthPressure + approachAdjustment));
}

function eventMinutes(option: SubwayExpeditionOption, depth: number) {
  const base = {
    careful: 55,
    scavenge: 45,
    force: 30,
    observe: 45,
  }[option.approach];
  return Math.min(90, base + Math.floor(Math.max(0, depth - 1) / 5) * 5);
}

function eventEnergyCost(option: SubwayExpeditionOption, depth: number) {
  const base = option.approach === "force" ? 2 : 1;
  return depth >= 11 ? base + 1 : base;
}

function applyEnergyCost(state: GameState, amount: number, resultParts: string[]) {
  const current = state.stats.energy;
  changeSurvivalStat(state, "energy", -amount);
  resultParts.push(`기력 -${Math.min(current, amount)}`);
  if (current < amount) {
    const deficit = amount - current;
    changeSurvivalStat(state, "hp", -deficit);
    resultParts.push(`탈진으로 체력 -${deficit}`);
  }
}

function signedAmount(amount: number) {
  return amount > 0 ? `+${amount}` : `${amount}`;
}

function mechanicsParts(mechanics: SubwayOutcomeMechanics) {
  const parts: string[] = [];
  if (mechanics.energyCost > 0) {
    parts.push(`기력 -${mechanics.energyCost}`);
  }
  mechanics.statChanges.forEach((change) => {
    parts.push(`${change.stat === "hp" ? "체력" : "정신력"} ${signedAmount(change.amount)}`);
  });
  parts.push(`+${mechanics.minutes}분`);
  return parts;
}

const SUBWAY_OUTCOME_STAT_MAX = {
  hp: 10,
  mind: 10,
} as const;

function canApplyOutcomeMechanicsExactly(
  state: GameState,
  mechanics: SubwayOutcomeMechanics,
) {
  if (state.stats.energy < mechanics.energyCost) {
    return false;
  }

  return mechanics.statChanges.every((change) => {
    const nextValue = state.stats[change.stat] + change.amount;
    return nextValue >= 0 && nextValue <= SUBWAY_OUTCOME_STAT_MAX[change.stat];
  });
}

function applyOutcomeMechanics(
  state: GameState,
  mechanics: SubwayOutcomeMechanics,
) {
  if (!canApplyOutcomeMechanicsExactly(state, mechanics)) {
    throw new Error("현재 상태로는 이 선택의 가능한 결과를 규칙에 적힌 수치 그대로 감당할 수 없습니다.");
  }

  state.stats.energy -= mechanics.energyCost;
  mechanics.statChanges.forEach((change) => {
    state.stats[change.stat] += change.amount;
  });
  advanceGameMinutes(state, mechanics.minutes);
  syncClock(state);
}

function legacyOutcomeVariant(
  option: SubwayExpeditionOption,
  depth: number,
  costly: boolean,
): SubwayOutcomeVariant {
  const stat = option.approach === "force" ? "hp" : "mind";
  const mechanics: SubwayOutcomeMechanics = {
    minutes: eventMinutes(option, depth),
    energyCost: eventEnergyCost(option, depth),
    statChanges: costly ? [{ stat, amount: -1 }] : [],
  };
  return {
    title: costly ? "대가를 치른 해결" : "깔끔한 해결",
    paragraphs: [
      costly
        ? `${option.label}는 통했지만, 위험을 완전히 피하지는 못했다.`
        : `${option.label}로 위험을 피해 통로를 확보했다.`,
    ],
    summary: costly
      ? `${option.label}로 사건을 해결했지만 대가를 치렀다.`
      : `${option.label}로 사건을 안전하게 해결했다.`,
    mechanics,
    nextFloorBridge: costly
      ? "방금 치른 대가의 여운을 안고 더 깊은 통로로 향했다."
      : "확보한 통로 너머로 더 깊은 구역의 흔적이 이어졌다.",
    facts: [],
    unresolvedThreads: [],
    resolvedThreads: [],
  };
}

function outcomeVariantsForOption(
  option: SubwayExpeditionOption,
  depth: number,
) {
  return option.outcomes ?? {
    clean: legacyOutcomeVariant(option, depth, false),
    costly: legacyOutcomeVariant(option, depth, true),
  };
}

function canResolveSubwayOption(
  state: GameState,
  option: SubwayExpeditionOption,
  depth: number,
) {
  const outcomes = outcomeVariantsForOption(option, depth);
  return (
    canApplyOutcomeMechanicsExactly(state, outcomes.clean.mechanics) &&
    canApplyOutcomeMechanicsExactly(state, outcomes.costly.mechanics)
  );
}

function cleanupFailedExpedition(state: GameState) {
  state.subwayExpedition.active = false;
  state.subwayExpedition.depth = 0;
  state.subwayExpedition.currentFloor = null;
  state.subwayExpedition.carriedLoot = {};
  resetFloorProgress(state);
  state.subwayExpedition.runPlan = null;
  state.subwayExpedition.storyMemory = emptyStoryMemory();
  state.subwayExpedition.preparedNextFloor = null;
  state.subwayExpedition.lastOutcome = "탐험 도중 쓰러져 전리품을 잃었다.";
}

function lootRecordSummary(loot: Record<string, number>) {
  const entries = Object.entries(loot).filter(([, amount]) => amount > 0);
  return entries.length > 0
    ? entries.map(([itemId, amount]) => `${itemName(itemId)} ${amount}개`).join(", ")
    : "획득 물자 없음";
}

function carriedLootSummary(state: GameState) {
  return lootRecordSummary(state.subwayExpedition.carriedLoot);
}

function currentFloorSettlement(state: GameState) {
  const floor = state.subwayExpedition.currentFloor;
  const progress = state.subwayExpedition.currentFloorProgress;
  const unsearched = floor
    ? floor.lootSpots.filter((spot) => !progress.searchedLootSpotIds.includes(spot.id)).length
    : 0;
  return {
    loot: lootRecordSummary(progress.floorLoot),
    unsearched,
  };
}

export function subwayReturnCost(state: GameState) {
  const depth = Math.max(1, state.subwayExpedition.depth);
  return {
    minutes: Math.min(240, 20 + depth * 12),
    energy: Math.max(1, Math.ceil(depth / 4)),
  };
}

export async function startSubwayExpedition(
  state: GameState,
  gameId: string,
  preparedFirstFloor?: SubwayExpeditionFloor | null,
  preparedRunPlan?: SubwayRunPlan | null,
) {
  syncClock(state);
  if (state.isGameOver || state.stageClear) {
    throw new Error(state.gameOverReason || "이미 이번 생존은 종료되었습니다.");
  }
  if (state.location !== "subway") {
    throw new Error("지하철역 대합실에서만 심층 탐험을 시작할 수 있습니다.");
  }
  if (state.subwayExpedition.active) {
    throw new Error("이미 지하철 심층부를 탐험하고 있습니다.");
  }
  if (state.stats.energy < 1) {
    throw new Error("지하 1층으로 내려갈 기력이 부족합니다.");
  }

  const deepestDepth = state.subwayExpedition.deepestDepth;
  const runNumber = state.subwayExpedition.runNumber + 1;
  const runPlan = structuredClone(
    preparedRunPlan ?? buildTemplateSubwayRunPlan({ runNumber }),
  );
  state.subwayExpedition = {
    active: true,
    runNumber,
    depth: 1,
    deepestDepth: Math.max(deepestDepth, 1),
    entryElapsedMs: state.worldElapsedMs,
    carriedLoot: {},
    currentFloor: null,
    currentFloorProgress: {
      phase: "event",
      currentResult: null,
      eventResolved: false,
      eventChoiceLabel: "",
      eventOutcome: "",
      searchedLootSpotIds: [],
      floorLoot: {},
    },
    runPlan,
    storyMemory: storyMemoryFromPlan(runPlan),
    preparedNextFloor: null,
    history: [],
    lastOutcome: "대합실에서 장비를 확인한 뒤 지하 1층으로 내려왔다.",
  };
  changeSurvivalStat(state, "energy", -1);
  advanceGameMinutes(state, 30);
  if (state.isGameOver || state.stageClear) {
    cleanupFailedExpedition(state);
    return;
  }
  const preparedFloor = preparedFloorForState(state, preparedFirstFloor, 1);
  const firstFloor =
    preparedFloor ??
    templateFloorForState(
      state,
      gameId,
      1,
      state.subwayExpedition.lastOutcome,
    );
  state.subwayExpedition.currentFloor = firstFloor;
  mergeFloorMemory(state.subwayExpedition.storyMemory, firstFloor);
  state.systemNote = "지하 1층 진입 / 기력 -1 / +30분";
  addLog(state, "지하철 대합실에서 준비를 마치고 지하 1층으로 내려갔다.");
}

export function resolveSubwayFloorEvent(
  state: GameState,
  optionId: string | undefined,
) {
  syncClock(state);
  const expedition = state.subwayExpedition;
  const floor = expedition.currentFloor;
  const progress = expedition.currentFloorProgress;
  if (!expedition.active || !floor) {
    throw new Error("진행 중인 지하철 심층 탐험이 없습니다.");
  }
  if (currentFloorPhase(progress) !== "event" || progress.eventResolved) {
    throw new Error("이 층의 큰 사건은 이미 해결했습니다.");
  }
  const option = floor.majorEvent.options.find((entry) => entry.id === optionId);
  if (!option) {
    throw new Error("현재 사건에서 선택할 수 없는 해결 방법입니다.");
  }
  if (!canResolveSubwayOption(state, option, floor.depth)) {
    throw new Error("현재 상태로는 이 선택에서 나올 수 있는 결과를 모두 감당할 수 없습니다. 대합실로 귀환해 정비해 주세요.");
  }

  const costly = Math.random() < riskChance(option, floor.depth);
  const generatedOutcomes = option.outcomes;
  const outcomes = outcomeVariantsForOption(option, floor.depth);
  const outcome = outcomes[costly ? "costly" : "clean"];
  applyOutcomeMechanics(state, outcome.mechanics);
  const mechanics = mechanicsParts(outcome.mechanics).join(" / ");

  if (state.isGameOver || state.stageClear || state.stats.hp <= 0) {
    cleanupFailedExpedition(state);
    return;
  }

  progress.eventResolved = true;
  progress.eventChoiceLabel = option.label;
  progress.eventOutcome = `${outcome.summary} / ${mechanics}`;
  progress.phase = "event_result";
  progress.currentResult = {
    kind: "event",
    title: outcome.title,
    paragraphs: [...outcome.paragraphs],
    summary: outcome.summary,
    mechanics: structuredClone(outcome.mechanics),
    nextFloorBridge: outcome.nextFloorBridge,
    source: generatedOutcomes ? floor.source : "template",
    optionId: option.id,
  };
  mergeOutcomeMemory(expedition.storyMemory, outcome);
  expedition.lastOutcome = `${floor.majorEvent.title} 해결: ${option.label} / ${outcome.summary}`;
  state.systemNote = `큰 사건 해결 / ${outcome.summary} / ${mechanics}`;
  addLog(
    state,
    `지하 ${floor.depth}층의 '${floor.majorEvent.title}'을 해결했다. ${outcome.summary} (${mechanics})`,
  );
}

export function acknowledgeSubwayResult(state: GameState) {
  const expedition = state.subwayExpedition;
  const progress = expedition.currentFloorProgress;
  if (!expedition.active || !expedition.currentFloor) {
    throw new Error("진행 중인 지하철 심층 탐험이 없습니다.");
  }
  const phase = currentFloorPhase(progress);
  if (phase !== "event_result" && phase !== "loot_result") {
    throw new Error("확인할 지하철 탐험 결과가 없습니다.");
  }
  progress.phase = "loot";
  progress.currentResult = null;
}

export function searchSubwayLootSpot(
  state: GameState,
  lootSpotId: string | undefined,
) {
  syncClock(state);
  const expedition = state.subwayExpedition;
  const floor = expedition.currentFloor;
  const progress = expedition.currentFloorProgress;
  if (!expedition.active || !floor) {
    throw new Error("진행 중인 지하철 심층 탐험이 없습니다.");
  }
  if (!progress.eventResolved || currentFloorPhase(progress) !== "loot") {
    throw new Error("이 층의 큰 사건을 먼저 해결해야 파밍할 수 있습니다.");
  }
  const spot = floor.lootSpots.find((entry) => entry.id === lootSpotId);
  if (!spot) {
    throw new Error("현재 층에 없는 파밍 지점입니다.");
  }
  if (progress.searchedLootSpotIds.includes(spot.id)) {
    throw new Error("이미 수색한 장소입니다.");
  }

  progress.searchedLootSpotIds.push(spot.id);
  spot.contents.forEach((entry) => addCarriedLoot(state, entry.itemId, entry.amount));
  const minutes = floor.depth >= 11 ? 20 : 15;
  advanceGameMinutes(state, minutes);
  syncClock(state);
  if (state.isGameOver || state.stageClear || state.stats.hp <= 0) {
    cleanupFailedExpedition(state);
    return;
  }

  const found = spot.contents.length > 0
    ? spot.contents.map((entry) => `${itemName(entry.itemId)} +${entry.amount}`).join(", ")
    : "쓸 만한 물자 없음";
  const generatedResultParagraphs = spot.resultParagraphs;
  const resultParagraphs = generatedResultParagraphs?.length
    ? [...generatedResultParagraphs]
    : [
        spot.contents.length > 0
          ? `${spot.name} 안쪽을 확인하자 챙겨 갈 수 있는 물자가 남아 있었다.`
          : `${spot.name}을 끝까지 뒤졌지만 챙길 만한 물자는 남아 있지 않았다.`,
      ];
  progress.phase = "loot_result";
  progress.currentResult = {
    kind: "loot",
    title: `${spot.name} 수색 결과`,
    paragraphs: resultParagraphs,
    summary: found,
    mechanics: {
      minutes,
      energyCost: 0,
      statChanges: [],
    },
    nextFloorBridge: "",
    source: generatedResultParagraphs?.length ? floor.source : "template",
    lootSpotId: spot.id,
  };
  state.systemNote = `${spot.name} 수색 / ${found} / +${minutes}분`;
  addLog(state, `지하 ${floor.depth}층의 ${spot.name}을 수색했다. ${found}`);
}

export async function descendSubwayFloor(
  state: GameState,
  gameId: string,
  preparedNextFloor?: SubwayExpeditionFloor | null,
) {
  syncClock(state);
  const expedition = state.subwayExpedition;
  const floor = expedition.currentFloor;
  const progress = expedition.currentFloorProgress;
  if (!expedition.active || !floor) {
    throw new Error("진행 중인 지하철 심층 탐험이 없습니다.");
  }
  if (!progress.eventResolved || currentFloorPhase(progress) !== "loot") {
    throw new Error("이 층의 큰 사건을 먼저 해결해야 내려갈 수 있습니다.");
  }

  const settlement = currentFloorSettlement(state);
  const settlementText = settlement.unsearched > 0
    ? `${settlement.loot} / 미수색 ${settlement.unsearched}곳`
    : settlement.loot;
  expedition.history.push({
    depth: floor.depth,
    title: floor.title,
    choiceLabel: progress.eventChoiceLabel,
    outcome: `${progress.eventOutcome} / 층 보상: ${settlementText}`,
  });
  expedition.history = expedition.history.slice(-12);

  const resultParts: string[] = [];
  applyEnergyCost(state, 1, resultParts);
  advanceGameMinutes(state, 20);
  syncClock(state);
  if (state.isGameOver || state.stageClear || state.stats.hp <= 0) {
    cleanupFailedExpedition(state);
    return;
  }

  const nextDepth = floor.depth + 1;
  expedition.depth = nextDepth;
  expedition.deepestDepth = Math.max(expedition.deepestDepth, nextDepth);
  state.flags.subway_deepest_depth = Math.max(
    Number(state.flags.subway_deepest_depth ?? 0),
    nextDepth,
  );
  expedition.lastOutcome = `지하 ${floor.depth}층 정산: ${settlementText}`;
  resetFloorProgress(state);
  const cachedNextFloor = expedition.preparedNextFloor;
  expedition.preparedNextFloor = null;
  const cachedFloor = cachedNextFloor &&
    (!cachedNextFloor.floor.contextHash ||
      cachedNextFloor.floor.contextHash === cachedNextFloor.contextHash)
    ? cachedNextFloor.floor
    : null;
  const preparedFloor =
    preparedFloorForState(state, preparedNextFloor, nextDepth) ??
    preparedFloorForState(state, cachedFloor, nextDepth);
  const nextFloor =
    preparedFloor ??
    templateFloorForState(
      state,
      gameId,
      nextDepth,
      expedition.lastOutcome,
    );
  const bridge = expedition.storyMemory.lastBridge.trim();
  if (bridge && !nextFloor.paragraphs.includes(bridge)) {
    nextFloor.paragraphs = [
      bridge,
      ...nextFloor.paragraphs,
    ].slice(0, 4);
  }
  expedition.storyMemory.lastBridge = "";
  expedition.currentFloor = nextFloor;
  mergeFloorMemory(expedition.storyMemory, nextFloor);
  state.systemNote = `지하 ${floor.depth}층 정산 / ${settlementText} / 기력 -1 / 지하 ${nextDepth}층 진입`;
  addLog(state, `지하 ${floor.depth}층 탐색을 마쳤다. ${settlementText}`);
}

export function returnFromSubwayExpedition(state: GameState) {
  syncClock(state);
  const expedition = state.subwayExpedition;
  if (!expedition.active || !expedition.currentFloor) {
    throw new Error("진행 중인 지하철 심층 탐험이 없습니다.");
  }

  const reachedDepth = expedition.depth;
  const returnCost = subwayReturnCost(state);
  const resultParts: string[] = [];
  applyEnergyCost(state, returnCost.energy, resultParts);
  advanceGameMinutes(state, returnCost.minutes);
  syncClock(state);

  const lootEntries = Object.entries(expedition.carriedLoot).filter(([, amount]) => amount > 0);
  if (!state.isGameOver && !state.stageClear && state.stats.hp > 0) {
    lootEntries.forEach(([itemId, amount]) => {
      state.inventory[itemId] = (state.inventory[itemId] ?? 0) + amount;
    });
  }

  const lootSummary = carriedLootSummary(state);
  expedition.active = false;
  expedition.depth = 0;
  expedition.currentFloor = null;
  expedition.carriedLoot = {};
  resetFloorProgress(state);
  expedition.runPlan = null;
  expedition.storyMemory = emptyStoryMemory();
  expedition.preparedNextFloor = null;
  expedition.lastOutcome = state.isGameOver
    ? "귀환 도중 쓰러져 전리품을 잃었다."
    : `지하 ${reachedDepth}층에서 귀환했다. ${lootSummary}`;
  state.systemNote = state.isGameOver
    ? state.gameOverReason
    : `탐험 귀환 / ${lootSummary} / 기력 -${returnCost.energy} / +${returnCost.minutes}분`;
  addLog(
    state,
    state.isGameOver
      ? `지하 ${reachedDepth}층에서 돌아오던 중 쓰러졌다.`
      : `지하 ${reachedDepth}층에서 대합실로 돌아왔다. ${lootSummary}`,
  );
}

function returnAction(state: GameState): ActionChoice {
  const cost = subwayReturnCost(state);
  return {
    id: "return-from-subway-expedition",
    label: "탐험을 끝내고 대합실로 돌아간다",
    outcomeHint: `전리품 확정: ${carriedLootSummary(state)} · 귀환 비용 기력 ${cost.energy} · 약 ${cost.minutes}분`,
    showOutcomeHint: true,
    action: {
      type: "subway_expedition",
      command: "return",
    },
    isAvailable: true,
  };
}

export function buildSubwayExpeditionActions(state: GameState): ActionChoice[] {
  const expedition = state.subwayExpedition;
  const floor = expedition.currentFloor;
  const progress = expedition.currentFloorProgress;
  if (!expedition.active || !floor) {
    return [];
  }

  const phase = currentFloorPhase(progress);
  if (phase === "event_result" || phase === "loot_result") {
    const eventResult = progress.currentResult?.kind === "event";
    return [{
      id: `acknowledge-${phase}`,
      label: eventResult
        ? "결과를 확인하고 주변을 수색한다"
        : "수색 결과를 확인하고 계속한다",
      outcomeHint: "추가 비용 없이 탐험 화면으로 돌아갑니다.",
      showOutcomeHint: true,
      action: {
        type: "subway_expedition",
        command: "acknowledge_result",
      },
      isAvailable: true,
    }];
  }

  if (phase === "event") {
    return [
      ...floor.majorEvent.options.map((option) => {
        const isAvailable = canResolveSubwayOption(state, option, floor.depth);
        return {
          id: option.id,
          label: option.label,
          outcomeHint: isAvailable
            ? `${option.outcomeHint} · 위험 ${{
                low: "낮음",
                medium: "보통",
                high: "높음",
              }[option.riskHint]}`
            : `${option.outcomeHint} · 현재 상태로는 가능한 결과의 비용을 감당할 수 없습니다.`,
          showOutcomeHint: true,
          action: {
            type: "subway_expedition" as const,
            command: "resolve_event" as const,
            optionId: option.id,
          },
          isAvailable,
        };
      }),
      returnAction(state),
    ];
  }

  if (phase !== "loot") {
    return [returnAction(state)];
  }

  const lootActions: ActionChoice[] = floor.lootSpots
    .filter((spot) => !progress.searchedLootSpotIds.includes(spot.id))
    .map((spot) => ({
      id: spot.id,
      label: `${spot.name}을 수색한다`,
      outcomeHint: spot.searchHint,
      showOutcomeHint: true,
      action: {
        type: "subway_expedition",
        command: "search_loot",
        lootSpotId: spot.id,
      },
      isAvailable: true,
    }));
  const settlement = currentFloorSettlement(state);
  lootActions.push({
    id: "descend-subway-floor",
    label: `지하 ${floor.depth}층을 정산하고 다음 층으로 내려간다`,
    outcomeHint: `${settlement.loot} · 미수색 ${settlement.unsearched}곳 · 기력 -1 · +20분`,
    showOutcomeHint: true,
    action: {
      type: "subway_expedition",
      command: "descend",
    },
    isAvailable: true,
  });
  lootActions.push(returnAction(state));
  return lootActions;
}

function lootSpotStatusParagraphs(state: GameState, floor: SubwayExpeditionFloor) {
  const searched = new Set(state.subwayExpedition.currentFloorProgress.searchedLootSpotIds);
  return floor.lootSpots.map((spot) =>
    searched.has(spot.id)
      ? `[수색 완료] ${spot.name}: 더 챙길 만한 것은 남아 있지 않다.`
      : `[파밍 지점] ${spot.name}: ${spot.description}`
  );
}

export function buildSubwayExpeditionScene(state: GameState): SceneCard | null {
  const expedition = state.subwayExpedition;
  const floor = expedition.currentFloor;
  const progress = expedition.currentFloorProgress;
  if (!expedition.active || !floor) {
    return null;
  }

  const phase = currentFloorPhase(progress);
  const actions = buildSubwayExpeditionActions(state);
  const choices = actions.map((choice) => ({
    id: choice.id,
    label: choice.label,
    outcomeHint: choice.outcomeHint,
    showOutcomeHint: choice.showOutcomeHint,
    serverActionHint: choice.action,
    isAvailable: choice.isAvailable,
  }));
  const materialIds = {
    locationIds: ["subway"],
    personIds: [],
    itemIds: Array.from(new Set([
      ...Object.keys(expedition.carriedLoot),
      ...floor.lootSpots
        .filter((spot) => progress.searchedLootSpotIds.includes(spot.id))
        .flatMap((spot) => spot.contents.map((entry) => entry.itemId)),
    ])),
  };

  if (
    (phase === "event_result" || phase === "loot_result") &&
    progress.currentResult
  ) {
    const result = progress.currentResult;
    const rewardSummary = result.kind === "loot"
      ? [
          `현재 층 획득: ${lootRecordSummary(progress.floorLoot)}.`,
          `전체 임시 전리품: ${carriedLootSummary(state)}.`,
        ].join(" ")
      : "";
    return {
      id: `${floor.id}:${phase}:${result.optionId ?? result.lootSpotId ?? "result"}`,
      locationId: "subway",
      title: `지하 ${floor.depth}층 · ${result.title}`,
      paragraphs: [
        ...result.paragraphs,
        `[결과] ${result.summary}`,
        `[소모 및 변화] ${mechanicsParts(result.mechanics).join(" / ")}`,
        ...(rewardSummary ? [rewardSummary] : []),
      ],
      choices,
      materialIds,
      source: result.source,
      generatedAt: floor.generatedAt,
    };
  }

  const phaseParagraphs = phase === "loot"
    ? [
        `[사건 해결] ${floor.majorEvent.title}: ${progress.eventOutcome}`,
        ...lootSpotStatusParagraphs(state, floor),
        `현재 층 획득: ${lootRecordSummary(progress.floorLoot)}. 전체 임시 전리품: ${carriedLootSummary(state)}.`,
      ]
    : [
        `[큰 사건] ${floor.majorEvent.title}`,
        ...floor.majorEvent.paragraphs,
        `해결 목표: ${floor.majorEvent.resolutionGoal}`,
      ];
  return {
    id: `${floor.id}:${phase}:${progress.searchedLootSpotIds.join("-")}`,
    locationId: "subway",
    title: `지하 ${floor.depth}층 · ${floor.title}`,
    paragraphs: [
      ...floor.paragraphs,
      floor.tensionSummary,
      ...phaseParagraphs,
    ],
    choices,
    materialIds,
    source: floor.source,
    generatedAt: floor.generatedAt,
  };
}
