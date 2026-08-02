import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGameState, refreshLocationKnowledge } from "../src/game/rules";

test("the river becomes known after visiting one of its neighboring regions", () => {
  for (const location of ["convenience", "forest", "hospital"]) {
    const state = createInitialGameState();
    state.location = location;

    refreshLocationKnowledge(state);

    assert.equal(state.flags.known_river, true, `${location} should reveal the river`);
  }
});

test("the river stays hidden before a neighboring region is visited", () => {
  const state = createInitialGameState();

  refreshLocationKnowledge(state);

  assert.equal(state.flags.known_river, undefined);
});
