const test = require('node:test');
const assert = require('node:assert/strict');
const { worldRegistry } = require('../.server-dist/game/data/registry');
const { registerContentVersion } = require('../.server-dist/game/content-versions');
const { buildRuntimeRegistry } = require('../.server-dist/game/runtime-registry');
const { resolveStoryFrame } = require('../.server-dist/game/story-flow');
const { createInitialGameState, performAction } = require('../.server-dist/game/rules');

// Older Studio archives can put the shelter overview before the submenu scenes.
const archived = structuredClone(worldRegistry);
archived.scenes = { shelter_repeat_postquest:archived.scenes.shelter_repeat_postquest, ...archived.scenes };
const version = registerContentVersion(archived);
function atShelter(inventory, seen = false) {
  const state = createInitialGameState();
  state.contentVersionId = version;
  state.sceneId = 'shelter_repeat_postquest';
  state.inventory = {...inventory};
  Object.assign(state.flags, {
    opening_seen:true, prologue_seen:true, prologue_old_woman_seen:true,
    intro_seen_shelter:true, first_canned_food_started:true, shelter_brazier:true,
    shelter_cooking_intro_seen:seen, shelter_crafting_intro_seen:seen,
  });
  return state;
}
const choose = (state, choiceId) => performAction(state, {type:'content_choice', choiceId});
const open = (state, actionId) => performAction(state, {type:'content_action', actionId});

for (const [recipeId, output, ingredients] of [
  ['cook_at_shelter', 'hotMeal', {rawRice:2, vegetables:2, waterBottle:2, dentedPot:1}],
  ['cook_rice_porridge', 'ricePorridge', {rawRice:2, waterBottle:2, dentedPot:1}],
  ['cook_grilled_fish', 'grilledFish', {riverFish:2}],
]) {
  for (const seen of [false, true]) {
    test(`${recipeId} stays open after repeated cooking and missing ingredients (intro seen: ${seen})`, () => {
      const state = atShelter({...ingredients, firewood:2, woodPlank:3}, seen);
      open(state, seen ? 'open_shelter_cooking_repeat' : 'open_shelter_cooking');
      for (let count = 1; count <= 2; count++) {
        choose(state, recipeId);
        assert.equal(state.sceneId, 'shelter_cooking_menu_repeat');
        assert.equal(state.inventory[output], count);
        assert.equal(state.inventory.firewood ?? 0, 2-count);
        assert.equal(state.inventory.woodPlank, 3);
        assert.equal(state.flags.shelter_cooking_open, true);
        const frame = resolveStoryFrame(state, buildRuntimeRegistry(state));
        assert(frame.choices.some(choice => choice.id === recipeId));
      }
      const before = state.worldElapsedMs;
      choose(state, recipeId);
      assert.equal(state.sceneId, 'shelter_cooking_menu_repeat');
      assert.equal(state.inventory[output], 2);
      assert.equal(state.worldElapsedMs, before);
      choose(state, 'leave_shelter_cooking');
      assert.equal(state.sceneId, 'shelter_repeat_postquest');
      assert(!state.flags.shelter_cooking_open);
    });
  }
}

test('firewood crafting stays in the crafting menu and is available again immediately', () => {
  const state = atShelter({wood:2});
  open(state, 'open_shelter_crafting');
  for (let count = 1; count <= 2; count++) {
    choose(state, 'craft_firewood');
    assert.equal(state.sceneId, 'shelter_crafting_menu_repeat');
    assert.equal(state.inventory.firewood, 4*count);
    assert.equal(state.inventory.wood ?? 0, 2-count);
  }
});

test('partially updated saves regain firewood crafting even when the fuel catalog is already current', () => {
  const partial = structuredClone(worldRegistry);
  delete partial.choices.craft_firewood;
  for (const id of ['shelter_crafting_menu', 'shelter_crafting_menu_repeat']) {
    partial.scenes[id].choiceIds = partial.scenes[id].choiceIds.filter(id => id !== 'craft_firewood');
  }
  const state = atShelter({wood:1});
  state.contentVersionId = registerContentVersion(partial);
  open(state, 'open_shelter_crafting');
  const registry = buildRuntimeRegistry(state);
  assert(registry.choices.craft_firewood);
  assert(resolveStoryFrame(state, registry).choices.some(choice => choice.id === 'craft_firewood'));
  choose(state, 'craft_firewood');
  assert.equal(state.inventory.firewood, 4);
});
