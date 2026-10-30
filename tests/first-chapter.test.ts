import assert from "node:assert/strict";
import test from "node:test";

import { GAME_HOUR_MS, REAL_DAY_MS } from "../src/game/base-data";
import { createInitialGameState, performAction } from "../src/game/rules";
import { normalizeGameSession } from "../src/game/repository";
import { getStockQuantity } from "../src/game/state-utils";

test("탐험 재료로 만든 음식이 다음 탐험에 한 번 적용된다", () => {
  const state = createInitialGameState();
  state.location = "forest";
  state.flags.shelter_brazier = true;
  state.inventory.dentedPot = 1;
  performAction(state, { type: "content_action", actionId: "chop_wood_at_forest" });
  performAction(state, { type: "content_action", actionId: "forage_forest_food" }, { rng: () => 0.6 });
  assert.equal(state.inventory.wildGreens, 1);
  performAction(state, { type: "travel", targetId: "shelter" });
  performAction(state, { type: "content_choice", choiceId: "cook_greens_soup" });
  assert.equal(state.inventory.greensSoup, 1);
  performAction(state, { type: "use_item", itemId: "greensSoup" });
  assert.equal(state.preparedMeal, "greensSoup");
  performAction(state, { type: "travel", targetId: "forest" });
  performAction(state, { type: "content_action", actionId: "search_forest_resources" }, { rng: () => 0.45 });
  assert.equal(state.preparedMeal, null);
  assert.equal(state.inventory.cannedFood, 1);
});

test("숲죽은 채집 시간만 한 번 줄인다", () => {
  const state = createInitialGameState();
  state.location = "forest";
  state.inventory.forestStew = 1;
  performAction(state, { type: "use_item", itemId: "forestStew" });
  const before = state.worldElapsedMs;
  performAction(state, { type: "content_action", actionId: "chop_wood_at_forest" });
  assert.equal(Math.round((state.worldElapsedMs - before) / GAME_HOUR_MS * 60), 72);
  assert.equal(state.preparedMeal, null);
});

test("닳은 손도끼를 재료와 시간으로 수리한다", () => {
  const state = createInitialGameState();
  state.flags.shelter_crafting_open = true;
  state.inventory.crudeAxe = 1;
  state.inventory.scrapMetal = 1;
  state.inventory.woodPlank = 1;
  state.toolDurability.crudeAxe = 2;
  const before = state.worldElapsedMs;
  performAction(state, { type: "content_choice", choiceId: "repair_crude_axe" });
  assert.equal(state.toolDurability.crudeAxe, 8);
  assert.equal(state.inventory.scrapMetal ?? 0, 0);
  assert.equal(state.inventory.woodPlank ?? 0, 0);
  assert.equal(Math.round((state.worldElapsedMs - before) / GAME_HOUR_MS * 60), 45);
});

test("10일차 성공과 실패 모두 이후 날짜로 이어진다", () => {
  for (const signalReady of [false, true]) {
    const state = createInitialGameState();
    state.worldElapsedMs = REAL_DAY_MS * 8 + GAME_HOUR_MS * 12;
    state.day = 9;
    state.flags.rescue_signal_ready = signalReady;
    performAction(state, { type: "content_action", actionId: "sleep_at_shelter" });
    assert.equal(state.day, 10);
    assert.equal(state.chapterOneResult, signalReady ? "signal" : "missed");
    assert.equal(state.isGameOver, false);
    state.worldElapsedMs = REAL_DAY_MS * 9 + GAME_HOUR_MS * 12;
    performAction(state, { type: "content_action", actionId: "sleep_at_shelter" });
    assert.equal(state.day, 11);
    assert.equal(state.chapterOneResult, signalReady ? "signal" : "missed");
  }
});

test("유한 재료와 배식소 품삯으로 10일 동안 식사를 확보할 수 있다", () => {
  const state = createInitialGameState();
  assert.equal(getStockQuantity(state, "convenience", "convenience_food_crate", "rawRice"), 3);
  assert.equal(getStockQuantity(state, "kitchen", "kitchen_ingredient_crate", "rawRice"), 5);
  assert.equal(getStockQuantity(state, "kitchen", "kitchen_ingredient_crate", "vegetables"), 5);
  for (let day = 1; day <= 10; day += 1) {
    performAction(state, { type: "travel", targetId: "kitchen" });
    performAction(state, { type: "content_action", actionId: "help_kitchen_queue" });
    performAction(state, {
      type: "content_action",
      actionId: day === 1 ? "buy_meal_at_kitchen" : "buy_crowded_meal_at_kitchen",
    });
    performAction(state, { type: "use_item", itemId: "hotMeal" });
    performAction(state, { type: "travel", targetId: "forest" });
    for (const actionId of [
      "chop_wood_at_forest",
      "gather_cordage_at_forest",
      "chop_wood_at_forest",
      "gather_cordage_at_forest",
    ]) {
      performAction(state, { type: "content_action", actionId });
    }
    while (state.worldElapsedMs - (day - 1) * REAL_DAY_MS < GAME_HOUR_MS * 9.25) {
      performAction(state, { type: "content_action", actionId: "chop_wood_at_forest" });
    }
    performAction(state, { type: "travel", targetId: "shelter" });
    performAction(state, { type: "content_action", actionId: "rest_light_at_shelter" });
    performAction(state, { type: "content_action", actionId: "rest_light_at_shelter" });
    assert.equal(state.day, day);
    assert.ok(state.worldElapsedMs - (day - 1) * REAL_DAY_MS >= GAME_HOUR_MS * 12);
    performAction(state, { type: "content_action", actionId: "sleep_at_shelter" });
    assert.equal(state.day, day + 1);
    assert.equal(state.isGameOver, false);
    assert.ok(state.money >= 0);
  }
});
test("기존 저장 데이터를 첫 장 결과와 음식 준비 효과로 정규화한다", () => {
  const base = createInitialGameState();
  const common = {
    id: "legacy",
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    world: {},
  };
  const legacyClear = normalizeGameSession({
    ...common,
    state: { ...base, stageClear: true, chapterOneResult: undefined, preparedMeal: undefined },
  });
  assert.equal(legacyClear.state.stageClear, false);
  assert.equal(legacyClear.state.chapterOneResult, "signal");
  assert.equal(legacyClear.state.preparedMeal, null);
  const prepared = normalizeGameSession({
    ...common,
    state: { ...base, preparedMeal: "greensSoup", chapterOneResult: "missed" },
  });
  assert.equal(prepared.state.preparedMeal, "greensSoup");
  assert.equal(prepared.state.chapterOneResult, "missed");
});