import assert from "node:assert/strict";
import test from "node:test";

import {
  GAME_HOUR_MS,
  REAL_DAY_MS,
} from "../src/game/base-data";
import {
  createInitialGameState,
  performAction,
} from "../src/game/rules";

test("취침으로 흐르는 시간은 기력을 평소의 절반만 소모한다", () => {
  const state = createInitialGameState();
  state.worldElapsedMs = GAME_HOUR_MS * 12;
  state.stats.energy = 15;
  state.autoEnergyElapsedMs = 0;

  performAction(state, {
    type: "content_action",
    actionId: "sleep_at_shelter",
  });

  assert.equal(state.worldElapsedMs, REAL_DAY_MS);
  assert.equal(state.stats.energy, 9);
});
