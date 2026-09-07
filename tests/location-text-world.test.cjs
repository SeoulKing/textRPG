const test=require('node:test'),assert=require('node:assert/strict');
const {GameService}=require('../.server-dist/game/service');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {createInitialGameState,advanceGameMinutes}=require('../.server-dist/game/rules');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {registerContentVersion}=require('../.server-dist/game/content-versions');
const {worldRegistry,validateRegistry}=require('../.server-dist/game/data/registry');
const {ensureLocationWorld,locationWorldOptions,performLocationWorldAction}=require('../.server-dist/game/text-world/location-world');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {currentTextWorld,textWorldActions}=require('../.server-dist/game/text-world');
const {perceiveWorld}=require('../.server-dist/game/text-world/perception');
const {GAME_MINUTE_MS}=require('../.server-dist/game/base-data');
process.env.ENABLE_LLM_WORLD_PLANNER='false';process.env.ENABLE_LLM_BACKGROUND_GENERATION='false';
test.beforeEach(t=>t.mock.method(global,'fetch',async()=>{throw Error('External generation disabled in location world tests')}));
async function fixture(location='forest',setup=()=>{}){
 let state=createInitialGameState();state.flags.opening_seen=true;state.location=location;state.sceneId=location+'_repeat_intro';state.stats={hp:10,mind:10,energy:15};setup(state);
 const contexts=[],narrator=async c=>{contexts.push(c);return fallbackNarration(c)};
 const api={get state(){return state},contexts,get registry(){return buildRuntimeRegistry(state)},get world(){return currentTextWorld(state)},get options(){return locationWorldOptions(state,api.registry)},
 async ensure(){await ensureLocationWorld(state,api.registry,narrator,'location-test')},
 async choose(id){const o=api.options.find(o=>o.id===id);assert(o,'not offered '+id+'; '+api.options.map(o=>o.id));await api.raw({type:'text_world',command:'choose',optionId:id,revision:api.world.revision})},
 async raw(action){await performLocationWorldAction(state,action,api.registry,narrator,'location-test')},
 reload(){state=GameStateSchema.parse(JSON.parse(JSON.stringify(state)))} };
 await api.ensure();return api;
}

test('forest entry reveals geometry, stages gate work, and repeated reads reuse a single saved narration',async()=>{
 const f=await fixture();assert.equal(f.contexts.length,1);assert.equal(f.world.player.zone,'forest_edge');
 assert(f.options.length>=3&&f.options.length<=5);assert(!f.options.some(o=>o.contentActionId));
 const entry=JSON.stringify(f.contexts[0]);assert.match(entry,/왼쪽/);assert.match(entry,/오른쪽/);assert(!entry.includes('cannedFood'));assert(!entry.includes('forest_bushes'));
 const inventory=structuredClone(f.state.inventory);await f.choose('inspect:forest_timber');assert.deepEqual(f.state.inventory,inventory);
 assert.equal(f.world.player.focusEntityId,'forest_timber');assert(f.options.some(o=>o.id==='harvest:chop_wood_at_forest'));
 assert(f.contexts.at(-1).requiredFacts.some(f=>f.kind==='resource'&&f.data.missingTools.includes('손도끼')));
 const ids=f.options.map(o=>o.id),time=f.state.worldElapsedMs,calls=f.contexts.length;
 f.reload();await f.ensure();assert.deepEqual(f.options.map(o=>o.id),ids);assert.equal(f.contexts.length,calls);assert.equal(f.state.worldElapsedMs,time);
 assert(textWorldActions(f.state).every(o=>o.choiceThought&&!o.postChoiceNarrative));
});

test('tool and manual work preserve native yields, costs, tool wear and one narration per chosen intention',async()=>{
 const f=await fixture('forest',s=>{s.inventory.crudeAxe=1;s.toolDurability.crudeAxe=1});await f.choose('inspect:forest_timber');
 assert(f.options.some(o=>o.id==='harvest:chop_wood_at_forest'));assert(f.options.some(o=>o.id==='toolwork:chop_wood_with_crude_axe'));
 const start=f.state.worldElapsedMs,calls=f.contexts.length;
 await f.choose('toolwork:chop_wood_with_crude_axe');assert.equal(f.contexts.length,calls+1);assert.equal(f.state.inventory.wood,5);assert.equal(f.state.inventory.crudeAxe??0,0);
 assert.equal(f.state.worldElapsedMs-start,30*GAME_MINUTE_MS);assert.equal(f.state.resourceState.forest.fallen_wood.remaining,11);
 const work=f.contexts.at(-1).results.find(e=>e.type==='WORK');assert.equal(work.after.elapsedSeconds,1800);assert.equal(work.after.tools[0].after,0);assert(!work.after.empty);assert.match(f.world.lastParagraphs.join(' '),/더는 사용할 수 없다/);
 assert(!f.options.some(o=>o.id==='toolwork:chop_wood_with_crude_axe'));assert.equal(f.world.player.heldItemId,null);
 await f.choose('harvest:chop_wood_at_forest');assert.equal(f.state.inventory.wood,8);assert.equal(f.state.resourceState.forest.fallen_wood.remaining,10);
 const carried=Object.values(f.world.entities).filter(e=>e.components.position.zone==='player'&&e.components.portable?.itemId==='wood');assert.equal(carried.reduce((sum,e)=>sum+e.components.portable.amount,0),8);
});

test('revisions, forged work and finished sites cannot award a second result',async()=>{
 const f=await fixture('forest',s=>s.resourceState={forest:{fallen_wood:{remaining:1,updatedAtMinutes:0,recoveryProgressMinutes:0}}});
 const noAccess=JSON.stringify(f.state),calls=f.contexts.length;await assert.rejects(f.raw({type:'text_world',command:'choose',optionId:'harvest:chop_wood_at_forest',revision:f.world.revision}),/선택할 수 없는/);assert.equal(JSON.stringify(f.state),noAccess);assert.equal(f.contexts.length,calls);
 await f.choose('inspect:forest_timber');const action={type:'text_world',command:'choose',optionId:'harvest:chop_wood_at_forest',revision:f.world.revision};await f.raw(action);
 const snapshot=JSON.stringify(f.state),after=f.contexts.length;await assert.rejects(f.raw(action),/상황이 바뀌/);assert.equal(JSON.stringify(f.state),snapshot);assert.equal(f.contexts.length,after);
 assert(!f.options.some(o=>o.contentActionId));assert.match(f.world.lastParagraphs.join(' '),/남아 있지 않다/);assert(!f.world.lastParagraphs.join(' ').includes('손도끼가 필요하다'));
 f.state.location='shelter';await f.ensure();assert(!f.state.locationTextWorlds.forest.active);advanceGameMinutes(f.state,120);f.state.location='forest';await f.ensure();
 assert.equal(f.state.inventory.wood,3);assert.equal(f.state.resourceState.forest.fallen_wood.remaining,0);assert(!f.options.some(o=>o.id==='focus:forest_timber'));
});

test('an unsuccessful search is explicit and exposes no undiscovered loot table',async t=>{
 t.mock.method(Math,'random',()=>0);
 const f=await fixture();await f.choose('focus:forest_debris');await f.choose('inspect:forest_debris');assert.equal(f.world.player.posture,'crouching');
 const inventory=structuredClone(f.state.inventory);await f.choose('harvest:search_forest_resources');assert.deepEqual(f.state.inventory,inventory);
 const c=f.contexts.at(-1);assert(c.requiredFacts.some(f=>f.kind==='result'&&f.data.type==='WORK'&&f.data.after.empty));assert(!c.results.some(e=>e.type==='TAKE'));assert(!JSON.stringify(c).includes('cannedFood'));assert.match(f.world.lastParagraphs.join(' '),/찾지 못한다/);
 assert.equal(f.state.resourceState.forest.forest_debris.remaining,5);
});

test('zone movement changes visible targets and retains posture and the last three scenes',async()=>{
 const f=await fixture();await f.choose('focus:forest_debris');await f.choose('inspect:forest_debris');await f.choose('travel:forest_inner');
 assert.equal(f.world.player.posture,'standing');assert.equal(f.world.player.zone,'forest_inner');assert(!f.options.some(o=>/forest_timber|forest_debris/.test(o.id)));
 assert(f.options.some(o=>o.id==='inspect:forest_vines'));await f.choose('inspect:forest_vines');await f.choose('harvest:gather_cordage_at_forest');
 assert.equal(f.state.inventory.cordage,2);assert.equal(f.world.recentScenes.length,3);assert.equal(f.contexts.at(-1).recentScenes.length,3);
});

test('river driftwood discovery and collection remain separate, and the disappearing pile never respawns',async()=>{
 const f=await fixture('river');assert(!JSON.stringify(f.contexts[0]).includes('river_wood'));
 // The director can initially prefer the other information target; focus is an alternative intention.
 if(!f.options.some(o=>o.id==='explore:river_driftwood'))await f.choose('focus:river_driftwood');
 await f.choose('explore:river_driftwood');assert.equal(f.state.inventory.wood??0,0);assert(f.options.some(o=>o.id==='collect:river_driftwood'));
 await f.choose('collect:river_driftwood');assert.equal(f.state.inventory.wood,2);assert.equal(f.world.entities.river_driftwood.components.position.zone,'depleted');assert(!f.options.some(o=>o.id==='collect:river_driftwood'));
 f.reload();f.state.location='forest';await f.ensure();assert.equal(f.state.inventory.wood,2);assert(Object.values(f.world.entities).some(e=>e.origin?.entityId==='river_wood'));
 f.state.location='river';await f.ensure();assert.equal(f.world.entities.river_driftwood.components.position.zone,'depleted');assert.equal(f.state.inventory.wood,2);
 const layout=perceiveWorld(f.world).find(f=>f.kind==='layout').data.layout;assert(!layout.includes('가지 더미'));assert(!f.options.some(o=>o.id.endsWith('river_driftwood')));
});

test('recovering fishing pools becomes actionable on a later visit without generation during polls',async()=>{
 const f=await fixture('river',s=>s.resourceState={river:{fishing_pools:{remaining:0,updatedAtMinutes:0,recoveryProgressMinutes:0}}});
 if(!f.options.some(o=>o.id==='inspect:river_fishing'))await f.choose('focus:river_fishing');await f.choose('inspect:river_fishing');
 assert(!f.options.some(o=>o.id==='harvest:fish_at_river'));assert.match(f.world.lastParagraphs.join(' '),/잠시 쉬어/);
 const calls=f.contexts.length;await f.ensure();await f.ensure();assert.equal(f.contexts.length,calls);
 f.state.location='shelter';await f.ensure();advanceGameMinutes(f.state,360);f.state.location='river';await f.ensure();await f.choose('focus:river_fishing');assert(f.options.some(o=>o.id==='harvest:fish_at_river'));
});

test('interrupted work consumes one opportunity without inventing rewards or completing the work',async()=>{
 const f=await fixture();await f.choose('inspect:forest_timber');f.state.stats.hp=1;f.state.conditions.injury={level:1,damageProgress:.99};
 await f.choose('harvest:chop_wood_at_forest');assert(f.state.isGameOver);assert.equal(f.state.inventory.wood??0,0);assert.equal(f.state.resourceState.forest.fallen_wood.remaining,11);
 assert(f.contexts.at(-1).results.some(e=>e.type==='WORK'&&e.after.interrupted));assert(!f.contexts.at(-1).results.some(e=>e.type==='TAKE'));assert.deepEqual(f.options,[]);
});

test('authored room and resource IDs run on the same adapter and invalid bindings fail validation',async()=>{
 const registry=structuredClone(worldRegistry),room=registry.textRooms.find(r=>r.id==='forest_edge');
 room.id='forest_clearing';room.neighbors=[];room.entryText='빈터로 들어선다.';room.entities=room.entities.filter(e=>e.id==='forest_timber');room.entities[0].id='windfall';room.entities[0].components.position.zone=room.id;
 room.entities[0].components.resourceSite.siteId='small_windfall';registry.textRooms=registry.textRooms.filter(r=>r.locationId!=='forest').concat(room);
 registry.locations.forest.resourceSites=[{id:'small_windfall',name:'작은 나무 자리',capacity:2}];
 const action=registry.actions.chop_wood_at_forest;action.id='gather_windfall';action.resourceUse={siteId:'small_windfall',cost:1,effort:'마른 가지를 골라 모은다.'};
 for(const [id,a]of Object.entries(registry.actions))if(a.locationIds.includes('forest'))delete registry.actions[id];registry.actions[action.id]=action;registry.locations.forest.interactionChoices=[action];
 const f=await fixture('forest',s=>s.contentVersionId=registerContentVersion(registry));await f.choose('inspect:windfall');await f.choose('harvest:gather_windfall');assert.equal(f.state.inventory.wood,3);assert.equal(f.state.resourceState.forest.small_windfall.remaining,1);
 registry.textRooms.find(r=>r.id==='forest_clearing').entities[0].components.resourceSite.siteId='missing';assert.throws(()=>validateRegistry(registry),/unavailable resource site/);
});

test('the service rejects legacy action bypass and concurrent replay while preserving map travel',async()=>{
 const f=await fixture();let stored={id:'location-service',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state:f.state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}};
 const repo={withGameLock:async(_id,fn)=>fn(),loadGame:async()=>structuredClone(stored),saveGame:async s=>{stored=structuredClone(s)},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendActionLog:async()=>{},appendGenerationLog:async()=>{}};
 const service=new GameService(repo,undefined,undefined,undefined,undefined,async c=>fallbackNarration(c));let snap=await service.getState(stored.id);
 await assert.rejects(service.performAction(stored.id,{type:'content_action',actionId:'chop_wood_at_forest'}),/표시된 선택지/);
 snap=await service.performAction(stored.id,snap.availableActions.find(a=>a.action.optionId==='inspect:forest_timber').action);
 const action=snap.availableActions.find(a=>a.action.optionId==='harvest:chop_wood_at_forest').action,results=await Promise.allSettled([service.performAction(stored.id,action),service.performAction(stored.id,action)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(stored.state.inventory.wood,3);
 snap=await service.performAction(stored.id,{type:'travel',targetId:'shelter'});assert.equal(snap.state.location,'shelter');assert(!stored.state.locationTextWorlds.forest.active);
});
