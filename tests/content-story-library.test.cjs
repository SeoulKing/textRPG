const test = require('node:test');
const assert = require('node:assert/strict');
const { getEffectiveContentStudioDocument } = require('../.server-dist/game/data/registry');
const { studioLibraryGroups, studioStoryPeople, studioStorySearchText, studioContentLinks } = require('../content-story-library');

test('library includes every legacy scene exactly once without changing executable content', () => {
  const document = getEffectiveContentStudioDocument();
  const before = JSON.stringify(document);
  const groups = studioLibraryGroups(document);
  assert.deepEqual(groups.flatMap(group=>group.scenes.map(scene=>scene.id)).sort(), document.stories.flatMap(story=>story.scenes.map(scene=>scene.id)).sort());
  assert(groups.some(group=>group.title==='프롤로그' && group.scenes.length===3));
  assert(groups.some(group=>group.title==='진열대' && group.scenes.length===3));
  const subway=document.stories.find(story=>story.id==='native_region_subway');
  assert(studioStoryPeople(subway,document.people).some(person=>person.id==='shumi'));
  const kitchen=document.stories.find(story=>story.id==='native_region_kitchen');
  assert(studioStorySearchText(kitchen,document).includes('캔 음식'));
  assert.equal(JSON.stringify(document),before);
});

test('legacy flow includes actions, cross-region travel, stock variants and random results', () => {
  const document = getEffectiveContentStudioDocument();
  const links = studioContentLinks(document);
  assert(links.some(link=>link.from==='prologue_opening' && link.to==='prologue_old_woman_visit' && !link.conditional));
  assert(links.some(link=>link.from==='enter_magic_city_portal_first' && link.to==='arcana_plaza_first_intro' && link.action));
  assert(links.some(link=>link.from==='fish_at_river' && link.to==='river_fishing_catch_1' && link.conditional));
  assert(links.some(link=>link.from==='go_to_kitchen_ingredient_crate' && link.to==='kitchen_ingredient_crate_full' && link.conditional));
});

test('region action cards use saved overrides and keep fishing outcomes when editing', () => {
  const { studioRegionActions, studioSyncAction } = require('../content-story-library');
  const { buildWorldRegistryFromStudio } = require('../.server-dist/game/data/registry');
  const document=getEffectiveContentStudioDocument();
  const river=document.stories.find(story=>story.id==='native_region_river');
  const outcomes=structuredClone(river.actions[0].effects);
  river.actions[0].label='여울에서 낚시한다';
  const entries=studioRegionActions(document,'river');
  assert.equal(entries.length,1);assert.equal(entries[0].action.label,'여울에서 낚시한다');
  entries[0].action.outcomeHint='물결을 살피고 낚싯줄을 드리운다.';
  studioSyncAction(document,entries[0].action);
  const saved=JSON.parse(JSON.stringify(document));
  assert.equal(saved.locations.find(location=>location.id==='river').interactionChoices[0].label,'여울에서 낚시한다');
  const registry=buildWorldRegistryFromStudio(saved);
  assert.equal(registry.actions.fish_at_river.outcomeHint,'물결을 살피고 낚싯줄을 드리운다.');
  assert.deepEqual(registry.actions.fish_at_river.effects,outcomes);
});
