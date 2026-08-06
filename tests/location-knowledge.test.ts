import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialGameState,
  performAction,
  refreshLocationKnowledge,
  syncScene,
} from "../src/game/rules";

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

test("returning to the shelter after travel closes its crafting and cooking submenus", () => {
  const state = createInitialGameState();
  Object.assign(state.flags, {
    opening_seen: true,
    prologue_old_woman_seen: true,
    intro_seen_shelter: true,
    first_canned_food_started: true,
    shelter_crafting_intro_seen: true,
    shelter_crafting_open: true,
    shelter_cooking_open: true,
  });
  syncScene(state);

  assert.equal(state.sceneId, "shelter_crafting_menu_repeat");

  performAction(state, { type: "travel", targetId: "convenience" });
  performAction(state, { type: "travel", targetId: "shelter" });

  assert.equal(state.flags.shelter_crafting_open, undefined);
  assert.equal(state.flags.shelter_cooking_open, undefined);
  assert.equal(state.sceneId, "shelter_repeat_postquest");
});
