import assert from "node:assert/strict";
import test from "node:test";

import { GAME_MINUTE_MS } from "../src/game/base-data";
import { createInitialGameState } from "../src/game/rules";
import { startSubwayExpedition } from "../src/game/subway-expedition";

test("지하 1층 진입은 기력을 소모하지 않고 10분만 흐른다", async () => {
  const state = createInitialGameState();
  state.location = "subway";
  state.stats.energy = 0;
  const startedAt = state.worldElapsedMs;

  await startSubwayExpedition(state, "subway-entry-test");

  assert.equal(state.stats.energy, 0);
  assert.equal(state.worldElapsedMs, startedAt + GAME_MINUTE_MS * 10);
  assert.equal(state.systemNote, "지하 1층 진입 / +10분");
});
