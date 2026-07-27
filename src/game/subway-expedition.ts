import { baseItems } from "./data/items";
import { advanceGameMinutes, syncClock } from "./rules";
import { appendLogEntry, changeSurvivalStat } from "./state-utils";
import { generateSubwayFloor } from "./subway-expedition-generator";
import type {
  ActionChoice,
  GameState,
  SceneCard,
  SubwayExpeditionFloor,
  SubwayExpeditionOption,
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
    eventResolved: false,
    eventChoiceLabel: "",
    eventOutcome: "",
    searchedLootSpotIds: [],
    floorLoot: {},
  };
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
    prepared.lootSpots.forEach((spot) => {
      spot.contents = spot.contents.filter((entry) => entry.itemId !== "radioAntenna");
    });
  }
  return prepared;
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

function resolveEventRisk(
  state: GameState,
  option: SubwayExpeditionOption,
  depth: number,
  resultParts: string[],
) {
  if (Math.random() >= riskChance(option, depth)) {
    resultParts.push("위험 회피");
    return;
  }

  const severe = option.riskHint === "high" && depth >= 7 && Math.random() < 0.35;
  const damage = severe ? 2 : 1;
  const damageStat = option.approach === "force"
    ? "hp"
    : option.approach === "observe"
      ? "mind"
      : Math.random() < 0.55
        ? "hp"
        : "mind";
  changeSurvivalStat(state, damageStat, -damage);
  resultParts.push(`${damageStat === "hp" ? "체력" : "정신력"} -${damage}`);
}

function cleanupFailedExpedition(state: GameState) {
  state.subwayExpedition.active = false;
  state.subwayExpedition.currentFloor = null;
  state.subwayExpedition.carriedLoot = {};
  resetFloorProgress(state);
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
  state.subwayExpedition = {
    active: true,
    runNumber: state.subwayExpedition.runNumber + 1,
    depth: 1,
    deepestDepth: Math.max(deepestDepth, 1),
    entryElapsedMs: state.worldElapsedMs,
    carriedLoot: {},
    currentFloor: null,
    currentFloorProgress: {
      eventResolved: false,
      eventChoiceLabel: "",
      eventOutcome: "",
      searchedLootSpotIds: [],
      floorLoot: {},
    },
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
  state.subwayExpedition.currentFloor =
    preparedFloor ??
      await generateSubwayFloor({
          gameId,
          state,
          depth: 1,
          previousOutcome: state.subwayExpedition.lastOutcome,
        });
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
  if (progress.eventResolved) {
    throw new Error("이 층의 큰 사건은 이미 해결했습니다.");
  }
  const option = floor.majorEvent.options.find((entry) => entry.id === optionId);
  if (!option) {
    throw new Error("현재 사건에서 선택할 수 없는 해결 방법입니다.");
  }

  const resultParts: string[] = [];
  applyEnergyCost(state, eventEnergyCost(option, floor.depth), resultParts);
  resolveEventRisk(state, option, floor.depth, resultParts);
  const minutes = eventMinutes(option, floor.depth);
  advanceGameMinutes(state, minutes);
  syncClock(state);
  const outcome = resultParts.join(" / ");

  if (state.isGameOver || state.stageClear || state.stats.hp <= 0) {
    cleanupFailedExpedition(state);
    return;
  }

  progress.eventResolved = true;
  progress.eventChoiceLabel = option.label;
  progress.eventOutcome = outcome;
  expedition.lastOutcome = `${floor.majorEvent.title} 해결: ${option.label} / ${outcome}`;
  state.systemNote = `큰 사건 해결 / ${outcome} / +${minutes}분`;
  addLog(state, `지하 ${floor.depth}층의 '${floor.majorEvent.title}'을 해결했다. ${outcome}`);
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
  if (!progress.eventResolved) {
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
  if (!progress.eventResolved) {
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
  const preparedFloor = preparedFloorForState(state, preparedNextFloor, nextDepth);
  expedition.currentFloor =
    preparedFloor ??
      await generateSubwayFloor({
          gameId,
          state,
          depth: nextDepth,
          previousOutcome: expedition.lastOutcome,
        });
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

  if (!progress.eventResolved) {
    return [
      ...floor.majorEvent.options.map((option) => ({
        id: option.id,
        label: option.label,
        outcomeHint: `${option.outcomeHint} · 위험 ${{
          low: "낮음",
          medium: "보통",
          high: "높음",
        }[option.riskHint]}`,
        showOutcomeHint: true,
        action: {
          type: "subway_expedition" as const,
          command: "resolve_event" as const,
          optionId: option.id,
        },
        isAvailable: true,
      })),
      returnAction(state),
    ];
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

  const phaseParagraphs = progress.eventResolved
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
  const actions = buildSubwayExpeditionActions(state);
  const choices = actions.map((choice) => ({
    id: choice.id,
    label: choice.label,
    outcomeHint: choice.outcomeHint,
    showOutcomeHint: choice.showOutcomeHint,
    serverActionHint: choice.action,
    isAvailable: choice.isAvailable,
  }));
  return {
    id: `${floor.id}:${progress.eventResolved ? "loot" : "event"}:${progress.searchedLootSpotIds.join("-")}`,
    locationId: "subway",
    title: `지하 ${floor.depth}층 · ${floor.title}`,
    paragraphs: [
      ...floor.paragraphs,
      floor.tensionSummary,
      ...phaseParagraphs,
    ],
    choices,
    materialIds: {
      locationIds: ["subway"],
      personIds: [],
      itemIds: Array.from(new Set([
        ...Object.keys(expedition.carriedLoot),
        ...floor.lootSpots.flatMap((spot) => spot.contents.map((entry) => entry.itemId)),
      ])),
    },
    source: floor.source,
    generatedAt: floor.generatedAt,
  };
}
