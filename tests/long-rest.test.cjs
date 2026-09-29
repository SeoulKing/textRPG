const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState,performAction}=require('../.server-dist/game/rules');
const {GAME_MINUTE_MS}=require('../.server-dist/game/base-data');
const {worldRegistry,validateRegistry,getEffectiveContentStudioDocument,buildWorldRegistryFromStudio}=require('../.server-dist/game/data/registry');
const {registerContentVersion}=require('../.server-dist/game/content-versions');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {planActivity}=require('../.server-dist/game/activity');
const {plannedRestMinutes}=require('../.server-dist/game/rest');
const {actionConditionsMet}=require('../.server-dist/game/content-engine');
const {GameService}=require('../.server-dist/game/service');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {createSubwayTextWorld}=require('../.server-dist/game/text-world/world');
const id='rest_until_evening_at_shelter';
process.env.ENABLE_LLM_WORLD_PLANNER='false';process.env.ENABLE_LLM_BACKGROUND_GENERATION='false';
test.beforeEach(t=>t.mock.method(global,'fetch',async()=>{throw Error('No external generation in rest tests')}));
function fresh(hour=12){const s=createInitialGameState();s.worldElapsedMs=(hour-6)*60*GAME_MINUTE_MS;Object.assign(s.flags,{opening_seen:true,prologue_old_woman_seen:true,intro_seen_shelter:true,first_canned_food_started:true});s.sceneId='shelter_repeat_intro';s.stats={hp:6,mind:6,energy:15};return s}
const rest=s=>performAction(s,{type:'content_action',actionId:id});
const close=(a,b)=>assert(Math.abs(a-b)<.002,`${a} != ${b}`);
const session=s=>({id:'rest-test',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state:s,world:{}});

test('one choice reaches evening, recovers only completed intervals and advances absent worlds',()=>{
 const s=fresh(17+40/60),before=s.worldElapsedMs;s.textWorld=createSubwayTextWorld();s.textWorld.active=false;
 rest(s);close(s.worldElapsedMs-before,20*GAME_MINUTE_MS);assert.equal(s.stats.hp,7);assert.equal(s.stats.mind,7);close(s.textWorld.elapsedSeconds,1200);
 assert.equal(s.lastActivity.status,'completed');assert.equal(s.lastActivity.kind,'rest');assert.equal(s.activityRevision,1);assert(s.lastActivity.paragraphs.join(' ').includes('18:00'));assert(!actionConditionsMet(buildRuntimeRegistry(s).actions[id],s));GameStateSchema.parse(s);
 const short=fresh(17+55/60);rest(short);assert.equal(short.stats.hp,6);close(short.lastActivity.elapsedMinutes,5);
});
test('empty energy interrupts at the actual event, without claiming arrival at evening',()=>{
 const s=fresh();s.stats.energy=2;s.autoEnergyElapsedMs=56.5*GAME_MINUTE_MS;rest(s);
 close(s.lastActivity.elapsedMinutes,63.5);assert.equal(s.stats.energy,0);assert.equal(s.lastActivity.status,'interrupted');assert.match(s.lastActivity.reason,/기력이 바닥/);assert.doesNotMatch(s.lastActivity.paragraphs.join(' '),/18:00/);assert.equal(s.stats.hp,10);
});
test('infection worsening and accumulated exhaustion interrupt before subsequent recovery',()=>{
 const sick=fresh();sick.conditions.infection={level:1,damageProgress:0,worseningElapsedMinutes:359};rest(sick);close(sick.lastActivity.elapsedMinutes,1);assert.equal(sick.conditions.infection.level,2);assert.equal(sick.stats.hp,6);assert.match(sick.lastActivity.reason,/감염/);
 const hungry=fresh();hungry.stats.energy=0;hungry.exhaustionElapsedMs=719*GAME_MINUTE_MS;rest(hungry);close(hungry.lastActivity.elapsedMinutes,1);assert.equal(hungry.exhaustionLevel,1);assert.match(hungry.lastActivity.reason,/탈진/);
});
test('critical HP interrupts on its damage boundary and unsafe or out-of-window rest cannot start',()=>{
 const s=fresh();s.stats.hp=4;s.conditions.injury={level:1,damageProgress:1-1/60};rest(s);close(s.lastActivity.elapsedMinutes,1);assert.equal(s.stats.hp,3);assert(!s.isGameOver);assert(!actionConditionsMet(buildRuntimeRegistry(s).actions[id],s));
 for(const state of [s,fresh(18),fresh(27)]){const before=state.worldElapsedMs;assert.throws(()=>rest(state));assert.equal(state.worldElapsedMs,before)}
});
test('a different location and action ID use their authored clock and recovery without engine ID cases',()=>{
 const s=fresh(),registry=structuredClone(worldRegistry),custom={...registry.actions[id],id:'quiet_midday_break',label:'한낮까지 쉰다',locationIds:['kitchen'],conditions:[{type:'location',locationId:'kitchen'}],activity:{kind:'rest',startsAtHour:6,untilHour:14,recovery:{intervalMinutes:30,hp:2,mind:0}}};
 registry.actions[custom.id]=custom;registry.locations.kitchen.interactionChoices.push(custom);validateRegistry(registry);s.contentVersionId=registerContentVersion(registry);s.location='kitchen';performAction(s,{type:'content_action',actionId:custom.id});assert.equal(s.lastActivity.elapsedMinutes,120);assert.equal(s.stats.hp,10);assert.equal(s.stats.mind,6);assert.match(s.lastActivity.paragraphs.join(' '),/14:00/);
 assert.throws(()=>planActivity({...custom,effects:[{type:'advance_time',minutes:999}]}),/rest activity/);
 assert.throws(()=>planActivity({...custom,activity:{...custom.activity,untilHour:1}}));
});
test('old registries and Studio documents gain the new action while explicit overrides remain intact',()=>{
 const registry=structuredClone(worldRegistry);delete registry.actions[id];registry.locations.shelter.interactionChoices=registry.locations.shelter.interactionChoices.filter(a=>a.id!==id);
 const s=fresh();s.contentVersionId=registerContentVersion(registry);const live=buildRuntimeRegistry(s);assert.equal(live.actions[id].activity.kind,'rest');assert.equal(live.locations.shelter.interactionChoices.filter(a=>a.id===id).length,1);
 const doc=getEffectiveContentStudioDocument();for(const location of doc.locations)location.interactionChoices=location.interactionChoices.filter(a=>a.id!==id);for(const story of doc.stories)story.actions=story.actions.filter(a=>a.id!==id);
 const updated=getEffectiveContentStudioDocument(doc),restored=buildWorldRegistryFromStudio(updated);assert.equal(restored.actions[id].activity.kind,'rest');
 const custom=structuredClone(worldRegistry);custom.actions[id].activity=null;custom.locations.shelter.interactionChoices=custom.locations.shelter.interactionChoices.map(a=>a.id===id?custom.actions[id]:a);s.contentVersionId=registerContentVersion(custom);assert.equal(buildRuntimeRegistry(s).actions[id].activity,null);
});
test('service returns one persistent result scene, rejects replay and keeps it for item use but clears it when entering another scene',async()=>{
 let stored=normalizeGameSession(session(fresh(17))),calls=0;const repo={withGameLock:async(_id,fn)=>fn(),loadGame:async()=>structuredClone(stored),saveGame:async s=>{stored=normalizeGameSession(JSON.parse(JSON.stringify(s)))},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendActionLog:async()=>{},appendGenerationLog:async()=>{}};
 const service=new GameService(repo,undefined,undefined,undefined,undefined,async c=>{calls++;return fallbackNarration(c)});let snapshot=await service.getState(stored.id);
 const choice=snapshot.availableActions.find(a=>a.id===id);assert(choice?.isAvailable);assert(choice.choiceThought);assert.equal(choice.loading.durationMs,500);assert(!choice.craftingRecipe);assert(!choice.postChoiceNarrative);
 const before=snapshot.state.worldElapsedMs,attempts=await Promise.allSettled([service.performAction(stored.id,choice.action),service.performAction(stored.id,choice.action)]);assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
 snapshot=await service.getState(stored.id);close(snapshot.state.worldElapsedMs-before,60*GAME_MINUTE_MS);assert.match(snapshot.currentScene.id,/^activity:/);assert.equal(snapshot.currentScene.source,'template');assert.equal(snapshot.state.activityRevision,1);assert.equal(calls,0);
 const stable=JSON.stringify(snapshot.currentScene);snapshot=await service.getState(stored.id);assert.equal(JSON.stringify(snapshot.currentScene),stable);
 const restId=snapshot.currentScene.id,restText=structuredClone(snapshot.currentScene.paragraphs);
 snapshot=await service.performAction(stored.id,{type:'use_item',itemId:'emergencySnack'});assert.equal(snapshot.currentScene.id,restId);assert.deepEqual(snapshot.currentScene.paragraphs,restText);
 const open=snapshot.availableActions.find(a=>a.action.actionId==='open_shelter_crafting');snapshot=await service.performAction(stored.id,open.action);assert(!snapshot.currentScene.id.startsWith('activity:'));assert.equal(snapshot.state.lastActivity.paragraphs,undefined);
});
