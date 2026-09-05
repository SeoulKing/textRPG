const test = require('node:test');
const assert = require('node:assert/strict');
const { worldRegistry, validateRegistry } = require('../.server-dist/game/data/registry');
const { registerContentVersion, versionRegistry } = require('../.server-dist/game/content-versions');
const { buildRuntimeRegistry } = require('../.server-dist/game/runtime-registry');
const { normalizeGameSession } = require('../.server-dist/game/repository');
const { createInitialGameState, performAction } = require('../.server-dist/game/rules');
const { resolveStoryFrame } = require('../.server-dist/game/story-flow');
const { GameService } = require('../.server-dist/game/service');

function legacyFixture() {
  let registry = structuredClone(worldRegistry);
  for (const [id, name] of [['wildGreens', '산나물'], ['greensSoup', '나물국'], ['forestStew', '숲죽']]) {
    registry.items[id] = { ...structuredClone(registry.items.vegetables), id, name };
  }
  for (const id of ['wood', 'firewood', 'meat']) delete registry.items[id];
  for (const id of ['craft_wood_plank', 'craft_firewood']) delete registry.choices[id];
  for (const id of ['cook_at_shelter', 'cook_rice_porridge', 'cook_grilled_fish']) {
    registry.choices[id] = JSON.parse(JSON.stringify(registry.choices[id]).replaceAll('firewood', 'woodPlank').replaceAll('vegetables', 'wildGreens'));
  }
  for (const [id, itemId] of [['cook_greens_soup', 'greensSoup'], ['cook_forest_stew', 'forestStew']]) {
    registry.choices[id] = { ...structuredClone(registry.choices.cook_rice_porridge), id, label: registry.items[itemId].name, effects: [{ type: 'add_item', itemId, amount: 1 }] };
  }
  for (const scene of Object.values(registry.scenes)) {
    scene.choiceIds = scene.choiceIds.filter(id => !['craft_wood_plank', 'craft_firewood'].includes(id));
    if (scene.id.startsWith('shelter_cooking_menu')) scene.choiceIds = ['cook_at_shelter', 'cook_rice_porridge', 'cook_greens_soup', 'cook_forest_stew', 'leave_shelter_cooking'];
  }
  for (const id of ['chop_wood_at_forest', 'chop_wood_with_crude_axe']) {
    registry.actions[id] = JSON.parse(JSON.stringify(registry.actions[id]).replaceAll('"itemId":"wood"', '"itemId":"woodPlank"').replace(/\{\{item:wood(?=[|}])/g, '{{item:woodPlank'));
  }
  registry.actions.chop_wood_at_forest.effects.find(effect => effect.type === 'add_item').amount = 7;
  for (const location of Object.values(registry.locations)) {
    location.obtainableItemIds = location.obtainableItemIds.filter(id => !['wood', 'firewood', 'meat'].includes(id));
    location.interactionChoices = location.interactionChoices.map(action => registry.actions[action.id] ?? action);
  }
  registry = JSON.parse(JSON.stringify(registry).replace(/\{\{item:wood(?=[|}])/g, "{{item:woodPlank"));
  validateRegistry(registry);
  const version = registerContentVersion(registry);
  const state = createInitialGameState();
  state.contentVersionId = version;
  state.location = 'shelter';
  state.sceneId = 'shelter_cooking_menu_repeat';
  Object.assign(state.flags, { opening_seen:true, shelter_cooking_open:true, shelter_cooking_intro_seen:true, shelter_brazier:true });
  state.inventory = { vegetables:2, wildGreens:3, greensSoup:1, forestStew:1, woodPlank:2, riverFish:1 };
  state.skillProgress.collection.totalXp = 60;
  const session = normalizeGameSession({id:'legacy-cooking',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{}});
  return { registry, version, session };
}

test('archived cooking menus use the current dishes and fuel while preserving progress and the archive', () => {
  const { registry, version, session } = legacyFixture();
  const current = buildRuntimeRegistry(session.state);
  validateRegistry(current);
  assert.deepEqual(versionRegistry(version), registry);
  assert.equal(session.state.contentVersionId, version);
  assert.equal(session.state.skillProgress.collection.totalXp, 60);
  assert.equal(session.state.inventory.vegetables, 5);
  assert.equal(session.state.inventory.woodPlank, 2);
  for (const id of ['wildGreens', 'greensSoup', 'forestStew']) {
    assert.equal(current.items[id], undefined);
    assert.equal(session.state.inventory[id], undefined);
  }
  const service = new GameService({});
  for (const sceneId of ['shelter_cooking_menu', 'shelter_cooking_menu_repeat']) {
    session.state.sceneId = sceneId;
    const frame = resolveStoryFrame(session.state, current, { scene:current.scenes[sceneId] });
    const choices = service.buildAvailableActions(session, current.scenes[sceneId], frame.choices, current);
    assert.deepEqual(choices.map(choice => choice.id), ['cook_at_shelter', 'cook_rice_porridge', 'cook_grilled_fish', 'leave_shelter_cooking']);
    for (const choice of choices.filter(choice => choice.craftingRecipe)) {
      assert(choice.craftingRecipe.requirements.some(requirement => requirement.itemId === 'firewood'));
      assert(!choice.craftingRecipe.requirements.some(requirement => ['woodPlank', 'wildGreens'].includes(requirement.itemId)));
    }
  }
  assert.deepEqual(buildRuntimeRegistry(session.state), current);
});

test('retired cooking actions cannot execute even from a stale client or saved dynamic choices', () => {
  const { registry, session } = legacyFixture();
  for (const id of ['cook_greens_soup', 'cook_forest_stew']) {
    session.state.dynamicContent.choices[id] = registry.choices[id];
    assert.equal(buildRuntimeRegistry(session.state).choices[id], undefined);
    const before = structuredClone(session.state.inventory);
    assert.throws(() => performAction(session.state, {type:'content_choice', choiceId:id}));
    assert.deepEqual(session.state.inventory, before);
  }
});

test('an existing game can obtain wood, process fuel and cook with it, retaining its authored logging yield', () => {
  const { session } = legacyFixture();
  const state = session.state;
  state.location = 'forest';
  state.sceneId = 'forest_repeat_intro';
  performAction(state, {type:'content_action', actionId:'chop_wood_at_forest'}, {rng:()=>0});
  assert.equal(state.inventory.wood, 7);
  state.location = 'shelter';
  state.sceneId = 'shelter_crafting_menu_repeat';
  state.flags.shelter_crafting_open = true;
  performAction(state, {type:'content_choice', choiceId:'craft_firewood'});
  assert.equal(state.inventory.firewood, 4);
  assert.equal(state.inventory.wood, 6);
  state.sceneId = 'shelter_cooking_menu_repeat';
  state.flags.shelter_crafting_open = false;
  performAction(state, {type:'content_choice', choiceId:'cook_grilled_fish'});
  assert.equal(state.inventory.firewood, 3);
  assert.equal(state.inventory.woodPlank, 2);
  assert.equal(state.inventory.riverFish ?? 0, 0);
  assert.equal(state.inventory.grilledFish, 1);
});


test('a partially updated save with firewood items still corrects recipes using planks', () => {
  const registry = structuredClone(worldRegistry);
  registry.choices.cook_grilled_fish = JSON.parse(JSON.stringify(registry.choices.cook_grilled_fish).replaceAll('firewood', 'woodPlank'));
  const state = createInitialGameState();
  state.contentVersionId = registerContentVersion(registry);
  const updated = buildRuntimeRegistry(state);
  assert(updated.choices.cook_grilled_fish.conditions.some(condition => condition.itemId === 'firewood'));
  assert(!updated.choices.cook_grilled_fish.conditions.some(condition => condition.itemId === 'woodPlank'));
});
