import assert from "node:assert/strict";
import test from "node:test";

import { GAME_MINUTE_MS } from "../src/game/base-data";
import { createInitialGameState } from "../src/game/rules";
import { GameService } from "../src/game/service";
import {
  beginSubwayBanditEncounter,
  beginSubwaySituation,
  resolveSubwayBanditChoice,
  setSubwayEncounterScene,
} from "../src/game/subway-encounter";
import {
  validateSubwayEncounterDraftForTest,
} from "../src/game/subway-encounter-generator";
import {
  buildSubwayExpeditionActions,
  buildSubwayExpeditionScene,
  descendSubwayFloor,
  returnFromSubwayExpedition,
  startSubwayExpedition,
} from "../src/game/subway-expedition";
import {
  SubwayExpeditionStateSchema,
  type GameSession,
  type GameState,
  type SubwayEncounterActionId,
} from "../src/game/schemas";
import type { GameRepository } from "../src/game/repository";

function sceneChoices(actionIds: SubwayEncounterActionId[]) {
  return actionIds.map((actionToken) => ({
    actionToken,
    label: actionToken === "fight" ? "기습한다" : `선택: ${actionToken}`,
    postChoiceNarrative: [`${actionToken} 행동을 시작한다.`],
  }));
}

function setOpeningScene(state: GameState) {
  const encounter = state.subwayExpedition.currentFloorProgress.encounter!;
  setSubwayEncounterScene(state, {
    scenarioId: encounter.id,
    turnNumber: encounter.turnNumber,
    kind: encounter.kind,
    phase: encounter.stage,
    title: "승강장의 강도",
    paragraphs: ["쇠막대를 든 강도 한 명이 지하 1층 통로를 막아섰다."],
    choices: sceneChoices(["fight", "talk", "flee"]),
    source: "llm",
    generatedAt: "2026-07-29T00:00:00.000Z",
  });
}

function setActiveScene(state: GameState) {
  const encounter = state.subwayExpedition.currentFloorProgress.encounter!;
  setSubwayEncounterScene(state, {
    scenarioId: encounter.id,
    turnNumber: encounter.turnNumber,
    kind: encounter.kind,
    phase: encounter.stage,
    title: "짧아진 거리",
    paragraphs: ["강도가 쇠막대를 고쳐 쥐고 달려들 틈을 노린다."],
    choices: sceneChoices(["close_attack", "throw_improvised", "talk", "flee"]),
    source: "llm",
    generatedAt: "2026-07-29T00:00:00.000Z",
  });
}

async function stateWithBanditEncounter() {
  const state = createInitialGameState();
  state.location = "subway";
  state.flags.known_subway = true;
  state.flags.visited_subway = true;
  state.stats.energy = 15;
  await startSubwayExpedition(state, "encounter-test");
  beginSubwayBanditEncounter(state);
  setOpeningScene(state);
  return state;
}

function sequenceRng(values: number[]) {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

test("지하 1층 강도는 서버 판정으로 피해를 받고 고정 보상을 남긴다", async () => {
  const state = await stateWithBanditEncounter();
  const startedAt = state.worldElapsedMs;

  const opening = resolveSubwayBanditChoice(
    state,
    "fight",
    0,
    sequenceRng([0, 0.99]),
  );
  assert.equal(opening.stageAfter, "active");
  assert.equal(opening.selectedLabel, "기습한다");
  assert.equal(opening.damageDealt, 2);
  assert.equal(opening.damageTaken, 0);
  assert.equal(opening.enemyHpAfter, 2);
  assert.deepEqual(opening.postChoiceNarrative, ["fight 행동을 시작한다."]);
  assert.equal(state.subwayExpedition.currentFloorProgress.encounter?.turnNumber, 1);

  setActiveScene(state);
  const finishingStrike = resolveSubwayBanditChoice(
    state,
    "close_attack",
    1,
    sequenceRng([0]),
  );
  assert.equal(finishingStrike.resolution, "victory");
  assert.equal(finishingStrike.enemyHpAfter, 0);
  assert.equal(state.subwayExpedition.carriedLoot.cannedFood, 1);
  assert.equal(state.subwayExpedition.carriedLoot.painRelief, 1);
  assert.equal(state.subwayExpedition.currentFloorProgress.floorLoot.cannedFood, 1);
  assert.equal(
    state.worldElapsedMs - startedAt,
    GAME_MINUTE_MS * 10,
  );

  setSubwayEncounterScene(state, {
    scenarioId: state.subwayExpedition.currentFloorProgress.encounter!.id,
    turnNumber: state.subwayExpedition.currentFloorProgress.encounter!.turnNumber,
    kind: "combat",
    phase: "resolved",
    title: "쓰러진 강도",
    paragraphs: ["강도는 쇠막대를 놓치고 바닥에 쓰러졌다."],
    choices: [],
    source: "llm",
    generatedAt: "2026-07-29T00:00:00.000Z",
  });
  state.subwayExpedition.nextFloorStatus = "ready";
  const rendered = buildSubwayExpeditionScene(state);
  assert.equal(
    rendered?.paragraphs.join("\n"),
    "강도는 쇠막대를 놓치고 바닥에 쓰러졌다.",
  );
  assert.equal(
    state.systemNote,
    "강도: 2피해 / +1 캔 음식 / +1 진통제 / +5분",
  );
  assert.equal(state.subwayExpedition.currentFloorProgress.phase, "complete");
  assert.equal(state.subwayExpedition.currentFloorProgress.eventResolved, true);
  assert.deepEqual(
    buildSubwayExpeditionActions(state).flatMap((action) =>
      action.action.type === "subway_expedition" ? [action.action.command] : []
    ),
    ["descend", "return"],
  );
});

test("대화 성공은 보상 없이 강도 조우를 해결한다", async () => {
  const state = await stateWithBanditEncounter();
  const result = resolveSubwayBanditChoice(
    state,
    "talk",
    0,
    sequenceRng([0.49]),
  );

  assert.equal(result.success, true);
  assert.equal(result.resolution, "talked_down");
  assert.equal(state.subwayExpedition.carriedLoot.cannedFood ?? 0, 0);
  assert.equal(state.subwayExpedition.carriedLoot.painRelief ?? 0, 0);
});

test("LLM 선택지는 짧은 행동과 선택후 서사만 표시 데이터로 제공한다", async () => {
  const state = await stateWithBanditEncounter();

  const actions = buildSubwayExpeditionActions(state);
  const attack = actions.find((action) =>
    action.action.type === "subway_expedition" &&
    action.action.optionId === "fight"
  );
  assert.equal(attack?.label, "기습한다");
  assert.equal(
    attack?.outcomeHint,
    "명중 80%: 적 2피해 / 반격 60%: 나 1피해 / +5분",
  );
  assert.equal(attack?.showOutcomeHint, false);
  assert.deepEqual(attack?.postChoiceNarrative, ["fight 행동을 시작한다."]);
});

test("보유한 허용 도구만 선택지와 서버 판정에 사용할 수 있다", async () => {
  const state = await stateWithBanditEncounter();
  resolveSubwayBanditChoice(
    state,
    "fight",
    0,
    sequenceRng([0.99, 0.99]),
  );
  state.inventory.utilityKnife = 1;
  state.toolDurability.utilityKnife = 10;
  const encounter = state.subwayExpedition.currentFloorProgress.encounter!;
  setSubwayEncounterScene(state, {
    scenarioId: encounter.id,
    turnNumber: encounter.turnNumber,
    kind: encounter.kind,
    phase: encounter.stage,
    title: "손에 잡힌 간이 칼",
    paragraphs: ["가방 옆주머니의 간이 칼이 손에 닿는다."],
    choices: sceneChoices(["use_item:utilityKnife", "flee"]),
    source: "llm",
    generatedAt: "2026-07-29T00:00:00.000Z",
  });

  const action = buildSubwayExpeditionActions(state).find((entry) =>
    entry.action.type === "subway_expedition" &&
    entry.action.optionId === "use_item:utilityKnife"
  );
  assert.equal(
    action?.outcomeHint,
    "간이 칼 내구도 -1 / 명중 90%: 적 3피해 / 반격 50%: 나 1피해 / +5분",
  );
  const result = resolveSubwayBanditChoice(
    state,
    "use_item:utilityKnife",
    1,
    sequenceRng([0, 0.99]),
  );
  assert.equal(result.damageDealt, 3);
  assert.equal(state.toolDurability.utilityKnife, 9);
  assert.match(state.systemNote, /^간이 칼 내구도 -1 \/ 강도: 3피해/);
  assert.throws(
    () => resolveSubwayBanditChoice(state, "use_item:crudeAxe", 2, () => 0),
    /선택할 수 없는 행동/,
  );
});

test("환경 위험은 해결 장면과 함께 출구 두 개를 바로 표시한다", async () => {
  const state = await stateWithBanditEncounter();
  state.subwayExpedition.depth = 2;
  state.subwayExpedition.currentFloor!.depth = 2;
  state.subwayExpedition.currentFloor!.situationKind = "hazard";
  state.subwayExpedition.currentFloorProgress.encounter = null;
  state.subwayExpedition.currentFloorProgress.phase = "event";
  const situation = beginSubwaySituation(state);

  const setHazardScene = () => setSubwayEncounterScene(state, {
    scenarioId: situation.id,
    turnNumber: situation.turnNumber,
    kind: "hazard",
    phase: situation.stage,
    title: "침수된 통로",
    paragraphs: ["끊어진 전선 아래로 얕은 물이 흐른다."],
    choices: sceneChoices(["observe", "careful"]),
    source: "llm",
    generatedAt: "2026-07-29T00:00:00.000Z",
  });
  setHazardScene();
  const first = resolveSubwayBanditChoice(state, "observe", 0, () => 0);
  assert.equal(first.progressAfter, 1);
  assert.equal(first.resolution, null);
  setHazardScene();
  const second = resolveSubwayBanditChoice(state, "careful", 1, () => 0);
  assert.equal(second.progressAfter, 2);
  assert.equal(second.resolution, "resolved");

  setSubwayEncounterScene(state, {
    scenarioId: situation.id,
    turnNumber: situation.turnNumber,
    kind: "hazard",
    phase: "resolved",
    title: "확보한 통로",
    paragraphs: ["전선을 피해 반대편 작업대로 건너갔다."],
    choices: [],
    source: "llm",
    generatedAt: "2026-07-29T00:00:00.000Z",
  });
  state.subwayExpedition.nextFloorStatus = "ready";
  const exits = buildSubwayExpeditionActions(state);
  assert.equal(state.subwayExpedition.currentFloorProgress.phase, "complete");
  assert.deepEqual(
    exits.flatMap((action) =>
      action.action.type === "subway_expedition" ? [action.action.command] : []
    ),
    ["descend", "return"],
  );
});

test("층 이동은 기력을 소모하지 않고 내려가기 15분, 귀환은 층당 5분이 흐른다", async () => {
  const descendState = await stateWithBanditEncounter();
  descendState.subwayExpedition.currentFloorProgress.eventResolved = true;
  descendState.subwayExpedition.currentFloorProgress.phase = "complete";
  const preparedFloor = structuredClone(descendState.subwayExpedition.currentFloor!);
  preparedFloor.id = "subway-floor-2-cost-test";
  preparedFloor.depth = 2;
  const descendEnergy = descendState.stats.energy;
  const descendStartedAt = descendState.worldElapsedMs;

  await descendSubwayFloor(descendState, "movement-cost-test", preparedFloor);
  assert.equal(descendState.stats.energy, descendEnergy);
  assert.equal(
    descendState.worldElapsedMs - descendStartedAt,
    GAME_MINUTE_MS * 15,
  );
  assert.doesNotMatch(descendState.systemNote, /기력/);

  const returnState = await stateWithBanditEncounter();
  returnState.subwayExpedition.depth = 3;
  returnState.subwayExpedition.currentFloor!.depth = 3;
  returnState.subwayExpedition.currentFloorProgress.eventResolved = true;
  returnState.subwayExpedition.currentFloorProgress.phase = "complete";
  returnState.subwayExpedition.nextFloorStatus = "ready";
  returnState.subwayExpedition.carriedLoot = {
    scrapMetal: 2,
    clothScrap: 1,
  };
  const exitHints = buildSubwayExpeditionActions(returnState).map((action) => action.outcomeHint);
  assert.deepEqual(exitHints, ["+15분", "+15분"]);
  const returnEnergy = returnState.stats.energy;
  const returnStartedAt = returnState.worldElapsedMs;

  returnFromSubwayExpedition(returnState);
  assert.equal(returnState.stats.energy, returnEnergy);
  assert.equal(
    returnState.worldElapsedMs - returnStartedAt,
    GAME_MINUTE_MS * 15,
  );
  assert.doesNotMatch(returnState.systemNote, /기력/);
  assert.equal(
    returnState.systemNote,
    "탐험 귀환 / +2 고철 조각 / +1 천 조각 / +15분",
  );
  assert.deepEqual(
    returnState.systemNoteEntries.slice(1, 3).map((entry) =>
      entry.type === "delta"
        ? [entry.subject, entry.itemId, entry.amount]
        : [entry.type]
    ),
    [
      ["item", "scrapMetal", 2],
      ["item", "clothScrap", 1],
    ],
  );
});

test("지난 턴 번호나 현재 장면에 없는 선택은 거부한다", async () => {
  const state = await stateWithBanditEncounter();
  resolveSubwayBanditChoice(state, "fight", 0);
  setActiveScene(state);

  assert.throws(
    () => resolveSubwayBanditChoice(state, "close_attack", 0, () => 0),
    /이미 지난 상황 선택/,
  );
  assert.throws(
    () => resolveSubwayBanditChoice(state, "fight", 1, () => 0),
    /선택할 수 없는 행동/,
  );
});

test("LLM 조우 응답은 단계별 허용 행동을 지켜야 한다", () => {
  const opening = validateSubwayEncounterDraftForTest({
    scenarioId: "test-scenario",
    turnNumber: 0,
    kind: "combat",
    phase: "opening",
    title: "강도 출현",
    paragraphs: ["강도 한 명이 통로를 막았다."],
    choices: sceneChoices(["fight", "talk", "flee"]),
  }, "opening");
  assert.ok(opening.draft);

  const combatWithoutAttack = validateSubwayEncounterDraftForTest({
    scenarioId: "test-scenario",
    turnNumber: 0,
    kind: "combat",
    phase: "active",
    title: "대치",
    paragraphs: ["서로 거리를 재고 있다."],
    choices: sceneChoices(["talk", "flee"]),
  }, "active");
  assert.ok(combatWithoutAttack.draft);

  const resolvedWithChoice = validateSubwayEncounterDraftForTest({
    scenarioId: "test-scenario",
    turnNumber: 0,
    kind: "combat",
    phase: "resolved",
    title: "종료",
    paragraphs: ["강도가 물러났다."],
    choices: sceneChoices(["flee"]),
  }, "resolved");
  assert.equal(resolvedWithChoice.draft, null);

  const resolvedWithRewardNarration = validateSubwayEncounterDraftForTest({
    scenarioId: "test-scenario",
    turnNumber: 0,
    kind: "combat",
    phase: "resolved",
    title: "승리",
    paragraphs: ["승리 보상으로 캔 음식 1개와 진통제 1개를 획득했다."],
    choices: [],
  }, "resolved");
  assert.equal(resolvedWithRewardNarration.draft, null);
  assert.match(
    resolvedWithRewardNarration.errors.join(" "),
    /must not contain mechanics/,
  );

  const llmOwnedHint = validateSubwayEncounterDraftForTest({
    scenarioId: "test-scenario",
    turnNumber: 0,
    kind: "combat",
    phase: "opening",
    title: "강도 출현",
    paragraphs: ["강도가 길을 막았다."],
    choices: [{
      actionToken: "fight",
      label: "맞서 싸운다",
      postChoiceNarrative: ["강도에게 맞서 움직인다."],
      outcomeHint: "명중 80% / +5분",
    }, ...sceneChoices(["talk", "flee"])],
  }, "opening");
  assert.equal(llmOwnedHint.draft, null);

  const exitChoice = validateSubwayEncounterDraftForTest({
    scenarioId: "test-scenario",
    turnNumber: 0,
    kind: "combat",
    phase: "opening",
    title: "강도 출현",
    paragraphs: ["강도가 길을 막았다."],
    choices: [
      {
        actionToken: "fight",
        label: "다음 층으로 내려간다",
        postChoiceNarrative: ["계단 쪽으로 움직인다."],
      },
      ...sceneChoices(["talk", "flee"]),
    ],
  }, "opening");
  assert.equal(exitChoice.draft, null);
  assert.match(exitChoice.errors.join(" "), /must not contain descent/);
});

test("기존 지하철 저장 데이터에는 encounter 기본값이 추가된다", () => {
  const legacy = structuredClone(createInitialGameState().subwayExpedition) as
    unknown as Record<string, unknown>;
  const progress = legacy.currentFloorProgress as Record<string, unknown>;
  delete progress.encounter;

  const parsed = SubwayExpeditionStateSchema.parse(legacy);
  assert.equal(parsed.currentFloorProgress.encounter, null);
});

test("LLM 생성 실패 시 판정을 되돌리고 귀환 가능한 실패 상태를 저장한다", async () => {
  const state = await stateWithBanditEncounter();
  const stored: GameSession = {
    id: "transaction-test",
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    state,
    world: {
      locationCards: {},
      personCards: {},
      itemCards: {},
      eventCards: {},
      sceneCards: {},
      protagonistCard: null,
    },
  };
  const before = structuredClone(stored);
  let saved: GameSession | null = null;
  const repository = {
    withGameLock: async <T>(_gameId: string, operation: () => Promise<T>) =>
      operation(),
    loadGame: async () => structuredClone(saved ?? stored),
    saveGame: async (session: GameSession) => {
      saved = structuredClone(session);
    },
    getTemplate: async () => undefined,
    saveTemplate: async () => undefined,
    saveProtagonistTemplate: async () => undefined,
    appendGenerationLog: async () => undefined,
    appendActionLog: async () => undefined,
  } as unknown as GameRepository;
  const service = new GameService(
    repository,
    undefined,
    undefined,
    async () => {
      throw new Error("LLM generation failed");
    },
  );

  await service.performAction(stored.id, {
    type: "subway_expedition",
    command: "encounter_choice",
    optionId: "talk",
    turnNumber: 0,
  });
  const savedSession = saved as GameSession | null;
  assert.ok(savedSession);
  assert.equal(savedSession.state.subwayExpedition.currentFloorProgress.phase, "generation_failed");
  assert.equal(savedSession.state.stats.hp, before.state.stats.hp);
  assert.equal(savedSession.state.worldElapsedMs, before.state.worldElapsedMs);
  assert.equal(
    buildSubwayExpeditionActions(savedSession.state).length,
    1,
  );
  assert.deepEqual(stored, before);
});
