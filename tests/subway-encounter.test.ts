import assert from "node:assert/strict";
import test from "node:test";

import { GAME_MINUTE_MS } from "../src/game/base-data";
import { createInitialGameState } from "../src/game/rules";
import { GameService } from "../src/game/service";
import {
  beginSubwayBanditEncounter,
  beginSubwaySituation,
  resolveSubwayBanditChoice,
  setSubwayEncounterGeneration,
  setSubwayEncounterScene,
} from "../src/game/subway-encounter";
import {
  compileSubwayEncounterDraftForTest,
  createSubwayEncounterSceneGenerator,
} from "../src/game/subway-encounter-generator";
import {
  generateSubwayRoleJson,
  type SubwayGenerationRole,
  type SubwayRoleClient,
  type SubwayRoleRequest,
} from "../src/game/subway-role-pipeline";
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
  type SubwayChoiceIntent,
  type SubwayEncounterActionId,
} from "../src/game/schemas";
import type { GameRepository } from "../src/game/repository";

function legacyChoiceIntent(
  actionToken: SubwayEncounterActionId,
): SubwayChoiceIntent {
  if (actionToken.startsWith("use_item:")) {
    return {
      primary: "use_item",
      style: "careful",
      target: "self",
      itemId: actionToken.slice("use_item:".length),
    };
  }
  switch (actionToken) {
    case "fight":
    case "close_attack":
      return { primary: "attack", style: "forceful", target: "enemy" };
    case "throw_improvised":
      return { primary: "attack", style: "quick", target: "enemy" };
    case "guard":
      return { primary: "defend", style: "careful", target: "self" };
    case "talk":
      return { primary: "persuade", style: "empathetic", target: "actor" };
    case "flee":
      return { primary: "retreat", style: "quick", target: "exit" };
    case "force":
      return { primary: "interact", style: "forceful", target: "environment" };
    case "careful":
      return { primary: "interact", style: "careful", target: "environment" };
    default:
      return { primary: "observe", style: "careful", target: "environment" };
  }
}

function sceneChoices(actionIds: SubwayEncounterActionId[]) {
  return actionIds.map((actionToken) => ({
    id: `legacy:${actionToken}`,
    label: actionToken === "fight" ? "기습한다" : `선택: ${actionToken}`,
    effectDescription: "",
    postChoiceNarrative: [`${actionToken} 행동을 시작한다.`],
    intent: legacyChoiceIntent(actionToken),
    legacyActionToken: actionToken,
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

test("장면 선택지는 짧은 행동과 선택후 서사만 표시 데이터로 제공한다", async () => {
  const state = await stateWithBanditEncounter();

  const actions = buildSubwayExpeditionActions(state);
  const attack = actions.find((action) =>
    action.action.type === "subway_expedition" &&
    action.action.optionId === "legacy:fight"
  );
  assert.equal(attack?.label, "기습한다");
  assert.equal(
    attack?.outcomeHint,
    "",
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
  state.inventory.waterBottle = 1;
  const generation = compileSubwayEncounterDraftForTest({
    title: "손에 잡힌 간이 칼",
    narrative: [
      "가방 옆주머니의 간이 칼이 손에 닿는다.",
      "생수병도 손을 뻗으면 닿을 거리에 남아 있다.",
    ],
  }, { gameId: "server-item-choices", state });
  setSubwayEncounterGeneration(state, generation);
  assert.ok(
    generation.scene.choices.some((choice) =>
      choice.legacyActionToken === "use_item:utilityKnife"
    ),
  );
  assert.ok(
    generation.scene.choices.some((choice) =>
      choice.legacyActionToken === "use_item:waterBottle"
    ),
  );

  const action = buildSubwayExpeditionActions(state).find((entry) => {
    if (entry.action.type !== "subway_expedition") return false;
    const optionId = entry.action.optionId;
    return generation.scene.choices.some((choice) =>
      choice.id === optionId &&
      choice.legacyActionToken === "use_item:utilityKnife"
    );
  });
  assert.equal(action?.outcomeHint, "");
  const result = resolveSubwayBanditChoice(
    state,
    action!.id,
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

test("깊은 층도 전투로 고정하고 서버가 확정한 층 전리품을 승리 시 자동 지급한다", async () => {
  const state = await stateWithBanditEncounter();
  state.subwayExpedition.depth = 2;
  state.subwayExpedition.currentFloor!.depth = 2;
  state.subwayExpedition.currentFloor!.situationKind = "hazard";
  state.subwayExpedition.currentFloor!.lootSpots[0]!.contents = [
    { itemId: "scrapMetal", amount: 2 },
  ];
  state.subwayExpedition.currentFloor!.lootSpots[1]!.contents = [
    { itemId: "scrapMetal", amount: 1 },
    { itemId: "waterBottle", amount: 1 },
  ];
  state.subwayExpedition.currentFloor!.lootSpots[2]!.contents = [];
  state.subwayExpedition.currentFloorProgress.encounter = null;
  state.subwayExpedition.currentFloorProgress.phase = "event";
  const situation = beginSubwaySituation(state);

  assert.equal(situation.kind, "combat");
  assert.deepEqual(situation.eventLikelihoods, {
    combat: 100,
    social: 0,
    hazard: 0,
  });
  assert.deepEqual(situation.rewardItems, [
    { itemId: "scrapMetal", amount: 3 },
    { itemId: "waterBottle", amount: 1 },
  ]);

  const opening = compileSubwayEncounterDraftForTest({
    title: "약탈자가 지키는 승강장",
    narrative: [
      "무장한 약탈자가 승강장 진입로를 막아섰다.",
      "쇠막대 끝이 비상등 아래에서 둔하게 번뜩였다.",
    ],
  }, { gameId: "deep-combat", state });
  setSubwayEncounterGeneration(state, opening);
  const first = resolveSubwayBanditChoice(
    state,
    opening.scene.choices[0]!.id,
    0,
    sequenceRng([0, 0.99]),
  );
  assert.equal(first.resolution, null);

  const active = compileSubwayEncounterDraftForTest({
    title: "비틀거리는 약탈자",
    narrative: [
      "약탈자가 개찰구에 부딪친 뒤 다시 자세를 세웠다.",
      "거친 숨과 쇠막대가 바닥을 긁는 소리가 가까워졌다.",
    ],
  }, { gameId: "deep-combat", state, latestServerResult: first });
  setSubwayEncounterGeneration(state, active);
  const second = resolveSubwayBanditChoice(
    state,
    active.scene.choices[0]!.id,
    1,
    sequenceRng([0]),
  );
  assert.equal(second.resolution, "victory");
  assert.deepEqual(
    state.subwayExpedition.carriedLoot,
    { scrapMetal: 3, waterBottle: 1 },
  );
  assert.deepEqual(state.subwayExpedition.currentFloorProgress.floorLoot, {
    scrapMetal: 3,
    waterBottle: 1,
  });
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

test("역할 응답은 Gemini 구조화 출력과 Zod 계약을 모두 통과해야 한다", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "gemini-test";
  const receivedBodies: Record<string, unknown>[] = [];
  globalThis.fetch = async (_input, init) => {
    receivedBodies.push(
      JSON.parse(String(init?.body)) as Record<string, unknown>,
    );
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              title: "코드 파이프라인 장면",
              narrative: [
                "역할 계약을 통과한 첫 문단이다.",
                "두 번째 문단도 구조화 출력에 포함된다.",
              ],
            }),
          }],
        },
      }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await generateSubwayRoleJson<{
      title: string;
      narrative: string[];
    }>({
      gameId: "role-schema-test",
      role: "opening_scene",
      target: "opening_scene:test",
      payload: { background: "지하철 1층의 강도" },
    });

    const generationConfig = receivedBodies[0]?.generationConfig as
      | Record<string, unknown>
      | undefined;
    assert.equal(generationConfig?.responseMimeType, "application/json");
    assert.equal(
      (generationConfig?.responseJsonSchema as Record<string, unknown>)?.type,
      "object",
    );
    assert.equal(result.title, "코드 파이프라인 장면");

    globalThis.fetch = async () =>
      new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                title: "문단이 부족한 장면",
                narrative: ["한 문단뿐이다."],
              }),
            }],
          },
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    await assert.rejects(
      () => generateSubwayRoleJson({
        gameId: "role-schema-test",
        role: "opening_scene",
        target: "opening_scene:invalid",
        payload: { background: "지하철 1층의 강도" },
      }),
      /narrative/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousKey;
    }
    if (previousModel === undefined) {
      delete process.env.GEMINI_MODEL;
    } else {
      process.env.GEMINI_MODEL = previousModel;
    }
  }
});

test("지하철 opening은 묘사 역할 한 번만 호출하고 서버 선택지를 붙인다", async () => {
  const state = await stateWithBanditEncounter();
  const roles: SubwayGenerationRole[] = [];
  const roleClient: SubwayRoleClient = async <T>(
    request: SubwayRoleRequest,
  ) => {
    roles.push(request.role);
    if (request.role === "opening_scene") {
      return {
        title: "푸른 유도등 아래",
        narrative: [
          "비상 유도등 아래에서 쇠막대를 든 강도가 통로를 가로막았다.",
          "그의 신발 끝이 깨진 타일을 밀어내며 한 걸음 다가왔다.",
        ],
        eventKind: "hazard",
        actor: { name: "서버에 없는 인물" },
      } as T;
    }
    throw new Error(`Unexpected role: ${request.role}`);
  };
  const generator = createSubwayEncounterSceneGenerator(
    roleClient,
    () => true,
  );

  const generation = await generator({ gameId: "role-opening", state });

  assert.deepEqual(roles, ["opening_scene"]);
  assert.equal(generation.eventKind, "combat");
  assert.equal(generation.actor?.name, "강도");
  assert.equal(generation.scene.title, "푸른 유도등 아래");
  assert.equal(generation.scene.choices.length, 3);
  assert.deepEqual(
    generation.scene.choices.map((choice) => choice.intent.primary),
    ["attack", "persuade", "retreat"],
  );
  assert.deepEqual(
    generation.scene.choices.map((choice) => choice.label),
    [
      "빈틈을 노려 먼저 공격한다",
      "무기를 내리라고 설득한다",
      "계단 쪽으로 물러난다",
    ],
  );
  assert.ok(
    generation.scene.choices.every((choice) =>
      choice.postChoiceNarrative.length === 2
    ),
  );
  assert.equal(generation.scene.source, "mixed");
});

test("서버 판정 뒤에는 결과 서사 역할 한 번만 호출하고 전체 판정값을 전달한다", async () => {
  const state = await stateWithBanditEncounter();
  const serverResult = resolveSubwayBanditChoice(
    state,
    "fight",
    0,
    sequenceRng([0, 0.99]),
  );
  const roles: SubwayGenerationRole[] = [];
  const roleClient: SubwayRoleClient = async <T>(
    request: SubwayRoleRequest,
  ) => {
    roles.push(request.role);
    if (request.role === "result_scene") {
      const authoritative = request.payload.authoritativeResult as {
        damageDealt: number;
        damageTaken: number;
        rolls: { action: number | null; counter: number | null };
        playerHpBefore: number;
        playerHpAfter: number;
        enemyHpBefore: number;
        enemyHpAfter: number;
        minutes: number;
        summary: string;
      };
      assert.equal(authoritative.damageDealt, 2);
      assert.equal(authoritative.damageTaken, 0);
      assert.deepEqual(authoritative.rolls, { action: 1, counter: null });
      assert.equal(authoritative.playerHpBefore, 8);
      assert.equal(authoritative.playerHpAfter, 8);
      assert.equal(authoritative.enemyHpBefore, 4);
      assert.equal(authoritative.enemyHpAfter, 2);
      assert.equal(authoritative.minutes, 5);
      return {
        title: "밀려난 강도",
        narrative: [
          authoritative.summary,
          "강도는 개찰구에 어깨를 부딪친 뒤 다시 쇠막대를 고쳐 쥔다.",
        ],
      } as T;
    }
    throw new Error(`Unexpected role: ${request.role}`);
  };
  const generator = createSubwayEncounterSceneGenerator(
    roleClient,
    () => true,
  );

  const generation = await generator({
    gameId: "role-result",
    state,
    latestServerResult: serverResult,
  });

  assert.deepEqual(roles, ["result_scene"]);
  assert.equal(generation.scene.title, "밀려난 강도");
  assert.deepEqual(
    generation.scene.choices.slice(0, 5).map((choice) =>
      choice.legacyActionToken
    ),
    ["close_attack", "throw_improvised", "guard", "talk", "flee"],
  );
});

test("서버가 조우 종료를 확정하면 결과 서사만 만들고 선택지 역할은 중단한다", async () => {
  const state = await stateWithBanditEncounter();
  const serverResult = resolveSubwayBanditChoice(
    state,
    "talk",
    0,
    sequenceRng([0.49]),
  );
  const roles: SubwayGenerationRole[] = [];
  const roleClient: SubwayRoleClient = async <T>(
    request: SubwayRoleRequest,
  ) => {
    roles.push(request.role);
    assert.equal(request.role, "result_scene");
    return {
      title: "내려간 쇠막대",
      narrative: [
        "강도는 잠시 침묵한 끝에 쇠막대를 바닥으로 내렸다.",
        "막혀 있던 승강장 안쪽 길이 조용히 드러났다.",
      ],
      storyHooks: ["강도는 싸움을 포기했다."],
    } as T;
  };
  const generator = createSubwayEncounterSceneGenerator(
    roleClient,
    () => true,
  );

  const generation = await generator({
    gameId: "role-resolved",
    state,
    latestServerResult: serverResult,
  });

  assert.deepEqual(roles, ["result_scene"]);
  assert.equal(generation.scene.phase, "resolved");
  assert.deepEqual(generation.scene.choices, []);
});

test("LLM 초안의 사건·인물·선택지는 무시하고 서버 전투 상태만 사용한다", async () => {
  const state = await stateWithBanditEncounter();
  const generation = compileSubwayEncounterDraftForTest({
    title: "유리의 매복",
    narrative: [
      "유리가 기둥 뒤에서 쇠막대를 들어 올린다.",
      "붉은 목도리 끝이 터널 바람을 받아 작게 떨린다.",
    ],
    eventKind: "hazard",
    actor: {
      name: "유리",
      appearance: "붉은 목도리와 낡은 방한복을 걸쳤다.",
      personality: "도발적이지만 겁이 많다.",
      motive: "통로의 식량을 독차지하려 한다.",
    },
    nextSceneHook: "유리가 쇠막대를 어깨 높이로 세우고 달려들 자세를 잡는다.",
    choices: [
      {
        label: "맞서 달려든다",
        effect: {
          type: "attack",
          description: "허를 찔러 먼저 주도권을 잡는다.",
          approach: "cunning",
        },
        postChoiceScene: [
          "나는 발을 굴러 거리를 좁히기 시작했다.",
          "유리의 시선이 내 어깨에서 발끝으로 급히 떨어졌다.",
        ],
      },
      {
        label: "쇠막대를 든 팔을 노린다",
        effect: {
          type: "attack",
          description: "무기를 놓치게 만들어 위협을 낮춘다.",
          approach: "careful",
        },
        postChoiceScene: ["나는 무기가 움직이는 궤적에 시선을 고정했다."],
      },
      {
        label: "없는 도끼를 휘두른다",
        effect: {
          type: "use_item",
          description: "도끼로 상대를 위협한다.",
          itemId: "crudeAxe",
        },
        postChoiceScene: ["나는 가방에서 도끼를 찾았다."],
      },
      {
        label: "숨죽여 주변을 살핀다",
      },
    ],
  }, { gameId: "compiler-test", state });

  assert.equal(generation.actor?.name, "강도");
  assert.equal(generation.eventKind, "combat");
  assert.equal(generation.scene.choices.length, 3);
  assert.equal(
    generation.scene.choices[0]?.label,
    "빈틈을 노려 먼저 공격한다",
  );
  assert.equal(
    generation.scene.choices[0]?.effectDescription,
    "명중 80%: 적 2피해 / 반격 60%: 나 1피해 / +5분",
  );
  assert.equal(
    generation.scene.choices[1]?.label,
    "무기를 내리라고 설득한다",
  );
  assert.equal(generation.scene.choices[2]?.intent.primary, "retreat");
  assert.equal(generation.scene.choices[2]?.postChoiceNarrative.length, 2);
  assert.equal(generation.diagnostics.droppedChoiceCount, 0);

  setSubwayEncounterGeneration(state, generation);
  const encounter = state.subwayExpedition.currentFloorProgress.encounter!;
  assert.equal(encounter.enemy?.name, "강도");
  assert.equal(encounter.enemy?.maxHp, 4);
  assert.equal(encounter.enemy?.attack, 1);
});

test("예고된 공격은 장면 생성 때 피해를 주지 않고 다음 choiceId 판정에서만 적용된다", async () => {
  const state = await stateWithBanditEncounter();
  const hpBefore = state.stats.hp;
  const generation = compileSubwayEncounterDraftForTest({
    title: "들어 올린 쇠막대",
    narrative: ["강도가 다음 빈틈을 노리며 몸을 낮춘다."],
    eventKind: "combat",
    actor: {
      name: "강도",
      appearance: "해진 패딩을 입었다.",
      personality: "성급하다.",
      motive: "통로를 지키려 한다.",
    },
    nextSceneHook: "강도가 쇠막대를 휘두르기 위해 팔을 뒤로 뺀다.",
    choices: [{
      label: "공격한다",
      effect: {
        type: "attack",
        description: "먼저 파고들어 공격 흐름을 끊는다.",
      },
      postChoiceScene: ["나는 먼저 거리를 좁혔다."],
    }, {
      label: "막는다",
      effect: {
        type: "defend",
        description: "공격을 받아 내고 다음 틈을 기다린다.",
      },
      postChoiceScene: ["나는 팔을 들어 머리를 가렸다."],
    }],
  }, { gameId: "threat-test", state });
  setSubwayEncounterGeneration(state, generation);

  assert.equal(state.stats.hp, hpBefore);
  const attackChoiceId = generation.scene.choices[0]!.id;
  const result = resolveSubwayBanditChoice(
    state,
    attackChoiceId,
    0,
    sequenceRng([0, 0]),
  );
  assert.equal(result.damageDealt, 2);
  assert.equal(result.damageTaken, 1);
  assert.equal(state.stats.hp, hpBefore - 1);
  assert.equal(
    state.subwayExpedition.currentFloorProgress.encounter?.pendingThreat,
    null,
  );
});

test("기존 지하철 저장 데이터에는 encounter 기본값이 추가된다", () => {
  const legacy = structuredClone(createInitialGameState().subwayExpedition) as
    unknown as Record<string, unknown>;
  const progress = legacy.currentFloorProgress as Record<string, unknown>;
  delete progress.encounter;

  const parsed = SubwayExpeditionStateSchema.parse(legacy);
  assert.equal(parsed.currentFloorProgress.encounter, null);
});

test("LLM 생성 실패 후에도 ST 판정과 시간을 보존하고 fallback 선택지로 계속한다", async () => {
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
  const generationLogs: Array<Record<string, unknown>> = [];
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
    appendGenerationLog: async (entry: Record<string, unknown>) => {
      generationLogs.push(entry);
    },
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
    optionId: "legacy:fight",
    turnNumber: 0,
  });
  const savedSession = saved as GameSession | null;
  assert.ok(savedSession);
  assert.equal(savedSession.state.subwayExpedition.currentFloorProgress.phase, "encounter");
  assert.equal(
    savedSession.state.subwayExpedition.currentFloorProgress.encounter?.turnNumber,
    1,
  );
  assert.equal(savedSession.state.stats.hp, before.state.stats.hp);
  assert.equal(
    savedSession.state.worldElapsedMs,
    before.state.worldElapsedMs + GAME_MINUTE_MS * 5,
  );
  assert.equal(
    savedSession.state.subwayExpedition.currentFloorProgress.encounter
      ?.currentScene?.source,
    "template",
  );
  assert.ok(buildSubwayExpeditionActions(savedSession.state).length >= 2);
  assert.equal(
    generationLogs.find((entry) => entry.kind === "subwayEncounterNarrative")
      ?.fallback,
    true,
  );
  assert.deepEqual(stored, before);
});
