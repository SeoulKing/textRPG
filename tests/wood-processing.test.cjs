const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_MINUTE_MS } = require('../.server-dist/game/base-data');
const { worldRegistry, getEffectiveContentStudioDocument, buildWorldRegistryFromStudio, validateContent, validateRegistry } = require('../.server-dist/game/data/registry');
const { inspectStudio } = require('../.server-dist/game/studio-validation');
const { createInitialGameState, performAction } = require('../.server-dist/game/rules');

function stateAt(location, sceneId, inventory = {}) {
  const state = createInitialGameState();
  state.location = location;
  state.sceneId = sceneId;
  state.activeEventId = null;
  state.inventory = { ...inventory };
  state.flags.opening_seen = true;
  state.flags.shelter_crafting_open = true;
  state.flags.shelter_cooking_open = true;
  state.flags.shelter_brazier = true;
  return state;
}
const choose = (state, choiceId) => performAction(state, { type: 'content_choice', choiceId }, { rng: () => 0 });

for (const [actionId, amount, inventory] of [
  ['chop_wood_at_forest', 3, {}],
  ['chop_wood_with_crude_axe', 5, { crudeAxe: 1 }],
]) {
  test(`${actionId} yields unprocessed wood`, () => {
    const state = stateAt('forest', 'forest_repeat_intro', inventory);
    performAction(state, { type: 'content_action', actionId }, { rng: () => 0 });
    assert.equal(state.inventory.wood, amount);
    assert.equal(state.inventory.woodPlank ?? 0, 0);
  });
}

test('wood can be processed repeatedly into boards or four firewood, without requiring a crafted tool', () => {
  const state = stateAt('shelter', 'shelter_crafting_menu', { wood: 3 });
  const start = state.worldElapsedMs;
  choose(state, 'craft_wood_plank');
  assert.deepEqual(state.inventory, { wood: 2, woodPlank: 1 });
  choose(state, 'craft_firewood');
  assert.deepEqual(state.inventory, { wood: 1, woodPlank: 1, firewood: 4 });
  choose(state, 'craft_firewood');
  assert.equal(state.inventory.wood ?? 0, 0);
  assert.equal(state.inventory.firewood, 8);
  assert.equal(state.worldElapsedMs - start, 30 * GAME_MINUTE_MS);
  const before = structuredClone(state.inventory), elapsed = state.worldElapsedMs;
  for (const id of ['craft_firewood', 'craft_wood_plank']) choose(state, id);
  assert.deepEqual(state.inventory, before);
  assert.equal(state.worldElapsedMs, elapsed);
  for (const sceneId of ['shelter_crafting_menu', 'shelter_crafting_menu_repeat']) {
    for (const id of ['craft_wood_plank', 'craft_firewood']) assert(worldRegistry.scenes[sceneId].choiceIds.includes(id));
  }
});

for (const [recipeId, output, ingredients] of [
  ['cook_at_shelter', 'hotMeal', { rawRice: 1, vegetables: 1, waterBottle: 1, dentedPot: 1 }],
  ['cook_rice_porridge', 'ricePorridge', { rawRice: 1, waterBottle: 1, dentedPot: 1 }],
  ['cook_grilled_fish', 'grilledFish', { riverFish: 1 }],
]) {
  test(`${recipeId} consumes one firewood and cannot substitute wood or boards`, () => {
    const inventory = { ...ingredients, wood: 2, woodPlank: 3 };
    const blocked = stateAt('shelter', 'shelter_cooking_menu', inventory);
    const before = blocked.worldElapsedMs;
    choose(blocked, recipeId);
    assert.deepEqual(blocked.inventory, inventory);
    assert.equal(blocked.worldElapsedMs, before);
    const state = stateAt('shelter', 'shelter_cooking_menu', { ...inventory, firewood: 2 });
    choose(state, recipeId);
    assert.equal(state.inventory[output], 1);
    assert.equal(state.inventory.firewood, 1);
    assert.equal(state.inventory.wood, 2);
    assert.equal(state.inventory.woodPlank, 3);
    for (const itemId of Object.keys(ingredients).filter(id => id !== 'dentedPot')) assert.equal(state.inventory[itemId] ?? 0, 0);
  });
}

test('stored Studio logging and cooking migrate without overwriting authored quantities or construction costs', () => {
  const stored = getEffectiveContentStudioDocument();
  const forest = stored.stories.find(story => story.id === 'native_region_forest');
  const logging = forest.actions.find(action => action.id === 'chop_wood_at_forest');
  logging.effects.find(effect => effect.type === 'add_item').amount = 7;
  forest.actions = JSON.parse(JSON.stringify(forest.actions).replaceAll('"itemId":"wood"', '"itemId":"woodPlank"').replace(/\{\{item:wood(?=[|}])/g, '{{item:woodPlank'));
  for (const recipe of stored.recipes.filter(recipe => recipe.menu === 'cooking')) {
    Object.assign(recipe, JSON.parse(JSON.stringify(recipe).replaceAll('firewood', 'woodPlank')));
  }
  const recipe = stored.recipes.find(recipe => recipe.id === 'cook_at_shelter');
  recipe.effects.find(effect => effect.type === 'advance_time').minutes = 17;
  for (const scene of stored.stories.flatMap(story => story.scenes)) {
    scene.choices = scene.choices.map(choice => choice.id === recipe.id ? structuredClone(recipe) : choice);
  }
  stored.items.find(item => item.id === 'woodPlank').price = 777;
  stored.items = stored.items.filter(item => !['wood', 'firewood'].includes(item.id));
  stored.recipes = stored.recipes.filter(recipe => !['craft_wood_plank', 'craft_firewood'].includes(recipe.id));
  const original = structuredClone(stored);
  const migrated = getEffectiveContentStudioDocument(stored);
  assert.deepEqual(stored, original);
  assert.deepEqual(getEffectiveContentStudioDocument(migrated), migrated);
  assert.equal(migrated.items.find(item => item.id === 'woodPlank').price, 777);
  const registry = buildWorldRegistryFromStudio(migrated);
  validateRegistry(registry);
  assert.deepEqual(inspectStudio(migrated).issues, []);
  const reward = registry.actions.chop_wood_at_forest.effects.find(effect => effect.type === 'add_item');
  assert.deepEqual(reward, { type: 'add_item', itemId: 'wood', amount: 7 });
  assert.equal(registry.choices.cook_at_shelter.effects.find(effect => effect.type === 'advance_time').minutes, 17);
  for (const id of ['cook_at_shelter', 'cook_rice_porridge', 'cook_grilled_fish']) {
    assert(registry.choices[id].effects.some(effect => effect.type === 'remove_item' && effect.itemId === 'firewood'));
    assert(!registry.choices[id].conditions.some(condition => condition.itemId === 'woodPlank'));
  }
  for (const id of ['craft_shelter_wall_patch', 'craft_shelter_brazier', 'craft_crude_axe']) {
    assert(registry.choices[id].effects.some(effect => effect.type === 'remove_item' && effect.itemId === 'woodPlank'));
  }
});

test('wood catalog and recipe content validate', () => {
  validateContent();
  assert.equal(worldRegistry.items.wood.name, '목재');
  assert.equal(worldRegistry.items.firewood.name, '땔감');
});
