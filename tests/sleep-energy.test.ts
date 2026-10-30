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

test("취침은 다음 날 기력을 기본치까지 회복하고 남은 기력은 보존한다", () => {
  const state = createInitialGameState();
  state.worldElapsedMs = GAME_HOUR_MS * 12;
  state.stats.energy = 15;
  state.autoEnergyElapsedMs = 0;

  performAction(state, {
    type: "content_action",
    actionId: "sleep_at_shelter",
  });

  assert.equal(state.worldElapsedMs, REAL_DAY_MS);
  assert.equal(state.stats.energy, 15);

  const tired = createInitialGameState();
  tired.worldElapsedMs = GAME_HOUR_MS * 12;
  tired.stats.energy = 2;
  performAction(tired, { type: "content_action", actionId: "sleep_at_shelter" });
  assert.equal(tired.stats.energy, 7);
});
