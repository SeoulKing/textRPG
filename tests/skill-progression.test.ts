import assert from "node:assert/strict";
import test from "node:test";

import { GAME_MINUTE_MS, SAVE_VERSION } from "../src/game/base-data";
import { worldRegistry } from "../src/game/data/registry";
import { formatOutcomeHint } from "../src/game/outcome-hint";
import { normalizeGameSession } from "../src/game/repository";
import { createInitialGameState, performAction } from "../src/game/rules";
import {
  MAX_SKILL_XP,
  SKILL_LEVEL_THRESHOLDS,
  buildSkillProgressCards,
  createEmptySkillProgress,
  getExplorationOutcomeProbabilities,
  getFishingOutcomeProbabilities,
  getSkillLevel,
  getSkillXpForMinutes,
  resolveSkillAdjustedMinutes,
  selectRandomOutcome,
} from "../src/game/skill-progression";
import { evaluateCondition, getStockMoneyKey, getStockStateKey } from "../src/game/state-utils";
import { resolveStoryFrame } from "../src/game/story-flow";
import { syncItemCardWithRuntimeDefinition } from "../src/game/service";
import type { ContentRegistry, GameState, ItemCard, SkillId } from "../src/game/schemas";

function stateAt(location: string, sceneId: string) {
  const state = createInitialGameState();
  state.location = location;
  state.sceneId = sceneId;
  state.activeEventId = null;
  state.flags[`known_${location}`] = true;
  state.flags[`visited_${location}`] = true;
  return state;
}

function progressAt(skillId: SkillId, totalXp: number) {
  const progress = createEmptySkillProgress();
  progress[skillId].totalXp = totalXp;
  return progress;
}

test("inventory cards follow the latest runtime item definition", () => {
  const storedCard: ItemCard = {
    id: "studioMeal",
    name: "Stored meal",
    description: "Stored description",
    kind: "food",
    rarity: "common",
    price: 100,
    tags: ["stored"],
    effects: { hp: 0, mind: 1, energy: 4, exhaustionRelief: 0 },
    source: "llm",
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
  const registry: ContentRegistry = {
    ...worldRegistry,
    items: {
      ...worldRegistry.items,
      studioMeal: {
        id: "studioMeal",
        name: "Studio meal",
        description: "Studio description",
        kind: "food",
        rarity: "uncommon",
        price: 600,
        tags: ["studio"],
        effects: { hp: 0, mind: 1, energy: 6, exhaustionRelief: 3 },
        useMinutes: 15,
      },
    },
  };

  const synced = syncItemCardWithRuntimeDefinition(storedCard, "studioMeal", registry);

  assert.deepEqual(synced, {
    id: "studioMeal",
    name: "Studio meal",
    description: "Studio description",
    kind: "food",
    rarity: "uncommon",
    price: 600,
    tags: ["studio"],
    effects: { hp: 0, mind: 1, energy: 6, exhaustionRelief: 3, injuryRelief: 0, infectionRelief: 0 },
    useMinutes: 15,
    source: "llm",
    generatedAt: "2026-01-01T00:00:00.000Z",
  });
});

test("level thresholds, XP gains, and collection time reductions follow the table", () => {
  assert.deepEqual(SKILL_LEVEL_THRESHOLDS, [0, 50, 120, 210, 320]);
  assert.equal(MAX_SKILL_XP, 320);

  const levelCases = [
    [0, 1],
    [49, 1],
    [50, 2],
    [119, 2],
    [120, 3],
    [209, 3],
    [210, 4],
    [319, 4],
    [320, 5],
  ] as const;
  levelCases.forEach(([xp, level]) => assert.equal(getSkillLevel(xp), level));

  assert.deepEqual(
    [5, 15, 30, 35].map(getSkillXpForMinutes),
    [1, 3, 6, 7],
  );
  assert.deepEqual(
    SKILL_LEVEL_THRESHOLDS.map((xp) =>
      resolveSkillAdjustedMinutes(
        30,
        { skillId: "collection" },
        progressAt("collection", xp),
      )),
    [30, 27, 24, 21, 18],
  );
  assert.equal(
    resolveSkillAdjustedMinutes(
      1,
      { skillId: "collection" },
      progressAt("collection", 320),
    ),
    1,
  );
});

test("exploration success probability grows while outcome ratios stay intact", () => {
  const outcomes = [
    { weight: 50, result: "failure" as const, id: "failure" },
    { weight: 10, result: "success" as const, id: "success-a" },
    { weight: 20, result: "success" as const, id: "success-b" },
    { weight: 20, result: "success" as const, id: "success-c" },
  ];
  const levelOne = getExplorationOutcomeProbabilities(outcomes, 1);
  const levelFive = getExplorationOutcomeProbabilities(outcomes, 5);
  assert.deepEqual(levelOne, [0.5, 0.1, 0.2, 0.2]);
  assert.ok(Math.abs(levelFive[0] - 0.1) < 1e-12);
  assert.ok(Math.abs(levelFive[1] - 0.18) < 1e-12);
  assert.ok(Math.abs(levelFive[2] - 0.36) < 1e-12);
  assert.ok(Math.abs(levelFive[3] - 0.36) < 1e-12);
  assert.ok(Math.abs((levelFive[2] / levelFive[1]) - 2) < 1e-12);

  const progress = progressAt("exploration", 320);
  assert.equal(
    selectRandomOutcome(outcomes, {
      skillUse: { skillId: "exploration" },
      progress,
      rng: () => 0.099999,
    })?.id,
    "failure",
  );
  assert.equal(
    selectRandomOutcome(outcomes, {
      skillUse: { skillId: "exploration" },
      progress,
      rng: () => 0.1,
    })?.id,
    "success-a",
  );
});

test("save normalization adds missing progress and clamps malformed XP", () => {
  const initial = createInitialGameState();
  const rawWithoutProgress = structuredClone(initial) as GameState & {
    skillProgress?: GameState["skillProgress"];
  };
  Reflect.deleteProperty(rawWithoutProgress, "skillProgress");
  const world = {
    locationCards: {},
    personCards: {},
    itemCards: {},
    eventCards: {},
    sceneCards: {},
    protagonistCard: null,
  };
  const normalizedMissing = normalizeGameSession({
    id: "missing-progress",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    state: rawWithoutProgress,
    world,
  });
  assert.equal(normalizedMissing.state.saveVersion, SAVE_VERSION);
  assert.deepEqual(normalizedMissing.state.skillProgress, createEmptySkillProgress());

  const malformed = structuredClone(initial) as unknown as Record<string, unknown>;
  malformed.skillProgress = {
    collection: { totalXp: 999.9 },
    exploration: { totalXp: "210" },
  };
  const normalizedMalformed = normalizeGameSession({
    id: "malformed-progress",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    state: malformed,
    world,
  });
  assert.deepEqual(normalizedMalformed.state.skillProgress, {
    collection: { totalXp: 320 },
    exploration: { totalXp: 0 },
    fishing: { totalXp: 0 },
  });
});

test("fishing starts at level 1 with 50 percent success and reaches 90 percent", () => {
  const outcomes = [
    { weight: 100, result: "failure" as const, id: "failure" },
    { weight: 75, result: "success" as const, id: "one-fish" },
    { weight: 25, result: "success" as const, id: "two-fish" },
  ];
  const levelOne = getFishingOutcomeProbabilities(outcomes, 1);
  const levelFive = getFishingOutcomeProbabilities(outcomes, 5);
  assert.deepEqual(levelOne, [0.5, 0.375, 0.125]);
  assert.ok(Math.abs(levelFive[0] - 0.1) < 1e-12);
  assert.ok(Math.abs(levelFive[1] - 0.675) < 1e-12);
  assert.ok(Math.abs(levelFive[2] - 0.225) < 1e-12);

  const failed = stateAt("river", "river_first_intro");
  performAction(
    failed,
    { type: "content_action", actionId: "fish_at_river" },
    { rng: () => 0.49 },
  );
  assert.equal(failed.inventory.riverFish ?? 0, 0);
  assert.equal(failed.skillProgress.fishing.totalXp, 6);

  const succeeded = stateAt("river", "river_first_intro");
  succeeded.skillProgress.fishing.totalXp = 320;
  performAction(
    succeeded,
    { type: "content_action", actionId: "fish_at_river" },
    { rng: () => 0.49 },
  );
  assert.equal(succeeded.inventory.riverFish, 1);
});

test("grilled fish recipe consumes the catch and restores exactly 3 energy", () => {
  const state = stateAt("shelter", "shelter_cooking_menu");
  state.flags.shelter_brazier = true;
  state.flags.shelter_cooking_open = true;
  state.inventory.riverFish = 1;
  state.inventory.woodPlank = 1;

  performAction(state, {
    type: "content_choice",
    choiceId: "cook_grilled_fish",
  });
  assert.equal(state.inventory.riverFish ?? 0, 0);
  assert.equal(state.inventory.woodPlank ?? 0, 0);
  assert.equal(state.inventory.grilledFish, 1);

  const beforeEnergy = state.stats.energy;
  performAction(state, { type: "use_item", itemId: "grilledFish" });
  assert.equal(state.stats.energy, beforeEnergy + 3);
  assert.equal(state.inventory.grilledFish ?? 0, 0);
});

test("skill_gte reads progression levels and treats owned legacy traits as level 1", () => {
  const state = createInitialGameState();
  state.skillProgress.collection.totalXp = 120;
  state.skills.push("keenEye");
  assert.equal(
    evaluateCondition({ type: "skill_gte", skillId: "collection", value: 3 }, state),
    true,
  );
  assert.equal(
    evaluateCondition({ type: "skill_gte", skillId: "collection", value: 4 }, state),
    false,
  );
  assert.equal(
    evaluateCondition({ type: "skill_gte", skillId: "keenEye", value: 1 }, state),
    true,
  );
  assert.equal(
    evaluateCondition({ type: "skill_gte", skillId: "keenEye", value: 2 }, state),
    false,
  );
});

test("actual stock collection awards XP only when inventory increases", () => {
  const state = stateAt("convenience", "convenience_food_crate_full");
  state.activeStockNodeId = "convenience_food_crate";
  state.discoveredStockNodeIds.push("convenience_food_crate");
  const beforeElapsed = state.worldElapsedMs;
  const beforeBread = state.inventory.staleBread ?? 0;

  performAction(state, {
    type: "content_choice",
    choiceId: "collect_stale_bread_from_food_crate",
  });

  assert.equal(state.inventory.staleBread, beforeBread + 2);
  assert.equal(
    state.stockState[
      getStockStateKey(
        "convenience",
        "convenience_food_crate",
        "staleBread",
      )
    ],
    0,
  );
  assert.equal(state.skillProgress.collection.totalXp, 1);
  assert.equal(state.worldElapsedMs - beforeElapsed, GAME_MINUTE_MS * 5);
  assert.equal(state.systemNote.includes("숙련도"), false);
  assert.equal(state.log.some((entry) => entry.message.includes("숙련도가")), false);

  assert.throws(() =>
    performAction(state, {
      type: "content_choice",
      choiceId: "collect_stale_bread_from_food_crate",
    }));
  assert.equal(state.skillProgress.collection.totalXp, 1);
});

test("unannotated actions do not advance progression skills", () => {
  const state = createInitialGameState();
  performAction(state, {
    type: "content_action",
    actionId: "rest_light_at_shelter",
  });
  assert.deepEqual(state.skillProgress, createEmptySkillProgress());
});

test("max collection level shortens actual time and the presented hint identically", () => {
  const state = stateAt("convenience", "convenience_register_full");
  state.activeStockNodeId = "convenience_register";
  state.discoveredStockNodeIds.push("convenience_register");
  state.skillProgress.collection.totalXp = 320;

  const frame = resolveStoryFrame(state, worldRegistry);
  const presented = frame.choices.find((choice) => choice.id === "collect_cash_from_register");
  assert.ok(presented);
  assert.match(presented.outcomeHint, /\+3분$/);

  const definition = worldRegistry.choices.collect_cash_from_register;
  assert.equal(
    formatOutcomeHint(definition.effects, state, definition.skillUse),
    presented.outcomeHint,
  );

  const beforeElapsed = state.worldElapsedMs;
  const beforeMoney = state.money;
  performAction(state, {
    type: "content_choice",
    choiceId: "collect_cash_from_register",
  });
  assert.equal(state.money, beforeMoney + 1800);
  assert.equal(
    state.stockState[getStockMoneyKey("convenience", "convenience_register")],
    0,
  );
  assert.equal(state.worldElapsedMs - beforeElapsed, GAME_MINUTE_MS * 3);
  assert.equal(state.skillProgress.collection.totalXp, 320);
});

test("level 2 collection keeps authored-time XP while shortening the actual clock", () => {
  const state = stateAt("forest", "forest_first_intro");
  state.skillProgress.collection.totalXp = 50;
  const definition = worldRegistry.actions.gather_cordage_at_forest;

  assert.match(
    formatOutcomeHint(definition.effects, state, definition.skillUse),
    /\+27분/,
  );

  const beforeElapsed = state.worldElapsedMs;
  const beforeCordage = state.inventory.cordage ?? 0;
  performAction(state, {
    type: "content_action",
    actionId: "gather_cordage_at_forest",
  });

  assert.equal(state.worldElapsedMs - beforeElapsed, GAME_MINUTE_MS * 27);
  assert.equal(state.inventory.cordage, beforeCordage + 2);
  assert.equal(state.skillProgress.collection.totalXp, 56);
});

test("actual exploration failure still awards XP, and level 5 changes the result boundary", () => {
  const failed = stateAt("forest", "forest_first_intro");
  const failedElapsed = failed.worldElapsedMs;
  performAction(
    failed,
    { type: "content_action", actionId: "search_forest_resources" },
    { rng: () => 0 },
  );
  assert.equal(failed.skillProgress.exploration.totalXp, 6);
  assert.equal(failed.worldElapsedMs - failedElapsed, GAME_MINUTE_MS * 30);
  assert.equal(failed.inventory.cannedFood ?? 0, 0);

  const succeeded = stateAt("forest", "forest_first_intro");
  succeeded.skillProgress.exploration.totalXp = 320;
  performAction(
    succeeded,
    { type: "content_action", actionId: "search_forest_resources" },
    { rng: () => 0.11 },
  );
  assert.equal(succeeded.inventory.cannedFood, 1);
  assert.equal(succeeded.skillProgress.exploration.totalXp, 320);
});

test("condition failure path awards no XP or time", () => {
  const state = stateAt("forest", "forest_first_intro");
  const beforeElapsed = state.worldElapsedMs;
  assert.throws(() => performAction(state, {
    type: "content_action",
    actionId: "chop_wood_with_crude_axe",
  }));
  assert.equal(state.skillProgress.collection.totalXp, 0);
  assert.equal(state.worldElapsedMs, beforeElapsed);
  assert.equal(state.inventory.woodPlank ?? 0, 0);
});

test("level crossing adds one Korean log and one system-note token", () => {
  const state = stateAt("forest", "forest_first_intro");
  state.skillProgress.exploration.totalXp = 49;
  performAction(
    state,
    { type: "content_action", actionId: "search_forest_resources" },
    { rng: () => 0 },
  );
  assert.equal(state.skillProgress.exploration.totalXp, 55);
  assert.match(state.systemNote, /탐색 숙련도 Lv\.2 달성/);
  assert.equal(
    state.log.filter((entry) => entry.message === "탐색 숙련도가 Lv.2로 올랐습니다.").length,
    1,
  );
});

test("snapshot cards expose interval XP, effects, and MAX state", () => {
  const cards = buildSkillProgressCards({
    collection: { totalXp: 80 },
    exploration: { totalXp: 320 },
    fishing: { totalXp: 0 },
  });
  assert.deepEqual(cards[0], {
    id: "collection",
    name: "수집",
    description: "숙련도가 오를수록 물자를 수집하는 시간이 줄어듭니다.",
    level: 2,
    maxLevel: 5,
    totalXp: 80,
    xpIntoLevel: 30,
    xpForNextLevel: 70,
    progressPercent: (30 / 70) * 100,
    effectPercent: 10,
    isMaxLevel: false,
  });
  assert.equal(cards[1].level, 5);
  assert.equal(cards[1].xpForNextLevel, null);
  assert.equal(cards[1].progressPercent, 100);
  assert.equal(cards[1].effectPercent, 40);
  assert.equal(cards[1].isMaxLevel, true);
  assert.equal(cards[2].level, 1);
  assert.equal(cards[2].effectPercent, 0);
  assert.equal(buildSkillProgressCards({
    collection: { totalXp: 0 },
    exploration: { totalXp: 0 },
    fishing: { totalXp: 320 },
  })[2].effectPercent, 40);
});
