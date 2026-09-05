const test = require('node:test');
const assert = require('node:assert/strict');
const { baseItems, worldRegistry, getEffectiveContentStudioDocument, buildWorldRegistryFromStudio, validateContent } = require('../.server-dist/game/data/registry');
const { inspectStudio } = require('../.server-dist/game/studio-validation');
const { createInitialGameState } = require('../.server-dist/game/rules');
const { normalizeGameSession } = require('../.server-dist/game/repository');
const { registerContentVersion } = require('../.server-dist/game/content-versions');

function oldItem(id, name) {
  return { ...structuredClone(baseItems.vegetables), id, name };
}
function session(inventory, contentVersionId) {
  const now = new Date().toISOString();
  const state = createInitialGameState();
  state.inventory = inventory;
  state.contentVersionId = contentVersionId;
  return { id: 'item-catalog-save', createdAt: now, updatedAt: now, state, world: {} };
}

test('the current catalog and cooking menus contain no retired food', () => {
  validateContent();
  const document = getEffectiveContentStudioDocument();
  assert.deepEqual(inspectStudio(document).issues, []);
  assert.equal(baseItems.meat.name, '고기');
  for (const id of ['wildGreens', 'greensSoup', 'forestStew']) assert.equal(worldRegistry.items[id], undefined);
  for (const id of ['cook_greens_soup', 'cook_forest_stew']) assert.equal(worldRegistry.choices[id], undefined);
  assert(worldRegistry.locations.forest.obtainableItemIds.includes('vegetables'));
});

test('stored Studio content migrates rewards, text, item pools and embedded recipes without losing edits', () => {
  const stored = getEffectiveContentStudioDocument();
  stored.items.find(item => item.id === 'vegetables').price = 777;
  stored.items.push(oldItem('wildGreens', '산나물'), oldItem('greensSoup', '나물국'), oldItem('forestStew', '숲죽'), oldItem('customFood', '작가 식재료'));
  const forest = stored.stories.find(story => story.id === 'native_region_forest');
  forest.actions = JSON.parse(JSON.stringify(forest.actions).replaceAll('vegetables', 'wildGreens'));
  forest.scenes[0].title = '산나물';
  stored.locations.find(location => location.id === 'forest').obtainableItemIds.push('wildGreens', 'greensSoup', 'forestStew');
  const cooking = stored.stories.flatMap(story => story.scenes).find(scene => scene.id === 'shelter_cooking_menu');
  for (const [id, itemId] of [['cook_greens_soup', 'greensSoup'], ['cook_forest_stew', 'forestStew']]) {
    const recipe = { ...structuredClone(stored.recipes.find(row => row.id === 'cook_rice_porridge')), id, label: `{{item:${itemId}}}`, effects: [{ type: 'add_item', itemId, amount: 1 }] };
    stored.recipes.push(recipe);
    cooking.choices.push(recipe);
  }
  const original = structuredClone(stored);
  const migrated = getEffectiveContentStudioDocument(stored);
  assert.deepEqual(stored, original);
  assert.deepEqual(getEffectiveContentStudioDocument(migrated), migrated);
  assert.equal(migrated.items.find(item => item.id === 'vegetables').price, 777);
  assert(migrated.items.some(item => item.id === 'customFood'));
  assert.doesNotMatch(JSON.stringify(migrated), /wildGreens|greensSoup|forestStew|cook_greens_soup|cook_forest_stew|산나물/);
  assert.deepEqual(inspectStudio(migrated).issues, []);
  const registry = buildWorldRegistryFromStudio(stored);
  assert.equal(registry.locations.forest.obtainableItemIds.filter(id => id === 'vegetables').length, 1);
});

test('current-catalog saves combine ingredient quantities and discard deleted dishes', () => {
  const version = registerContentVersion(worldRegistry);
  const saved = session({ vegetables: 3, wildGreens: 2, greensSoup: 1, forestStew: 2, waterBottle: 1 }, version);
  const restored = normalizeGameSession(saved);
  assert.deepEqual(restored.state.inventory, { vegetables: 5, waterBottle: 1 });
  assert.deepEqual(normalizeGameSession(restored).state.inventory, restored.state.inventory);
  saved.state.inventory = { wildGreens: -2, vegetables: 3 };
  assert.deepEqual(normalizeGameSession(saved).state.inventory, { vegetables: 3 });
});

test('archived saves adopt the explicit ingredient merge without changing their version', () => {
  const archived = structuredClone(worldRegistry);
  archived.items.wildGreens = oldItem('wildGreens', '산나물');
  const version = registerContentVersion(archived);
  const restored = normalizeGameSession(session({ vegetables: 3, wildGreens: 2 }, version));
  assert.deepEqual(restored.state.inventory, { vegetables: 5 });
  assert.equal(restored.state.contentVersionId, version);
});
