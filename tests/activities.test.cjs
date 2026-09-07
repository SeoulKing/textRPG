const test=require('node:test'),assert=require('node:assert/strict');
const {GameService}=require('../.server-dist/game/service');
const {worldRegistry,validateRegistry,getEffectiveContentStudioDocument,buildWorldRegistryFromStudio}=require('../.server-dist/game/data/registry');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {registerContentVersion,versionRegistry}=require('../.server-dist/game/content-versions');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {createInitialGameState,performAction}=require('../.server-dist/game/rules');
const {GameStateSchema,GameActionSchema}=require('../.server-dist/game/schemas');
const {planActivity,activityInputsAvailable}=require('../.server-dist/game/activity');
const {resolveStoryFrame}=require('../.server-dist/game/story-flow');
const {createSubwayTextWorld}=require('../.server-dist/game/text-world/world');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {GAME_MINUTE_MS,REAL_DAY_MS}=require('../.server-dist/game/base-data');
process.env.ENABLE_LLM_WORLD_PLANNER='false';process.env.ENABLE_LLM_BACKGROUND_GENERATION='false';
test.beforeEach(t=>t.mock.method(global,'fetch',async()=>{throw Error('External generation disabled in activity tests')}));
function start(){const s=createInitialGameState();Object.assign(s.flags,{opening_seen:true,shelter_crafting_open:true,shelter_crafting_intro_seen:true});s.sceneId='shelter_crafting_menu_repeat';s.stats={hp:10,mind:10,energy:15};s.inventory={};return s}
function prepare(id){const s=start(),d=buildRuntimeRegistry(s).choices[id];for(const c of d.conditions){if(c.type==='has_item')s.inventory[c.itemId]=c.amount;if(c.type==='flag')s.flags[c.flag]=true;if(c.type==='quest_state')s.quests[c.questId]=c.status;}return s}
const choose=(s,id,options={})=>performAction(s,{type:'content_choice',choiceId:id},options);
function session(state,id='activity-test'){return{id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}}}

test('all shipped recipes opt into completion-after-work while keeping authored costs and rewards',()=>{
 const recipes=Object.values(buildRuntimeRegistry(start()).choices).filter(d=>d.activity);assert.equal(recipes.length,12);
 for(const d of recipes){const s=prepare(d.id),plan=planActivity(d);choose(s,d.id);assert(!s.isGameOver,d.id);assert.equal(s.lastActivity.status,'completed',d.id);assert.equal(s.lastActivity.plannedMinutes,plan.minutes,d.id);assert.equal(s.worldElapsedMs,plan.minutes*GAME_MINUTE_MS,d.id);assert.equal(s.activityRevision,1);
 for(const e of plan.completion){if(e.type==='add_item')assert.equal(s.inventory[e.itemId],e.amount,d.id);if(e.type==='set_flag')assert(s.flags[e.flag],d.id);if(e.type==='set_tool_durability')assert.equal(s.toolDurability[e.itemId],e.value,d.id)}
 assert.deepEqual(s.lastActivity.consumedItems,plan.itemCosts);}
});

test('materials leave inventory before time advances and results are absent at intermediate clock events',()=>{
 const s=prepare('craft_firewood');s.conditions.injury={level:1,damageProgress:.99};let observations=0;
 s.textWorld=createSubwayTextWorld();s.textWorld.active=false;s.textWorld.entities.material={id:'material',name:'목재',description:'목재',components:{position:{zone:'player'},portable:{itemId:'wood',amount:1}}};
 choose(s,'craft_firewood',{onConditionDamage:()=>{observations++;assert.equal(s.inventory.wood??0,0);assert.equal(s.inventory.firewood??0,0);assert.notEqual(s.textWorld.entities.material.components.position.zone,'player');}});
 assert(observations>0);assert.equal(s.inventory.firewood,4);assert.equal(s.lastActivity.status,'completed');assert.deepEqual(s.lastActivity.producedItems,{firewood:4});assert.equal(s.textWorld.elapsedSeconds,600);
});

test('interrupted cooking consumes the started attempt, but awards no meal or completion prose',()=>{
 const s=prepare('cook_rice_porridge');s.stats.hp=1;s.conditions.injury={level:1,damageProgress:.99};s.toolDurability.dentedPot=1;
 choose(s,'cook_rice_porridge');assert(s.isGameOver);assert.equal(s.inventory.ricePorridge??0,0);assert.equal(s.inventory.dentedPot??0,0);
 for(const id of ['rawRice','waterBottle','firewood'])assert.equal(s.inventory[id]??0,0);
 assert(s.lastActivity.elapsedMinutes<20);assert.equal(s.lastActivity.status,'interrupted');assert.deepEqual(s.lastActivity.producedItems,{});assert(!s.log.some(e=>e.message.includes('거친 속을 달래기엔 충분하다')));
 const saved=normalizeGameSession(JSON.parse(JSON.stringify(session(s))));assert.deepEqual(saved.state.lastActivity,s.lastActivity);assert.equal(saved.state.activityRevision,1);
 const before=JSON.stringify(saved.state);assert.throws(()=>choose(saved.state,'cook_rice_porridge'));assert.equal(JSON.stringify(saved.state),before);
});

test('a build that crosses the rescue deadline cannot count as an already completed radio',()=>{
 const s=prepare('assemble_rescue_radio');s.worldElapsedMs=9*REAL_DAY_MS-7*GAME_MINUTE_MS;s.day=9;s.phaseIndex=3;
 choose(s,'assemble_rescue_radio');assert(s.isGameOver);assert(!s.stageClear);assert(!s.flags.rescue_signal_ready);assert.match(s.gameOverReason,/장비가 완성되지 않아/);assert.equal(s.lastActivity.status,'interrupted');assert(Math.abs(s.lastActivity.elapsedMinutes-7)<.001);
});

test('an arbitrary recipe ID sums repeated inputs and exposes that same requirement to the player',()=>{
 const s=start(),registry=structuredClone(worldRegistry);const recipe={...registry.choices.craft_firewood,id:'warm_kindling',label:'불쏘시개 묶기',activity:{kind:'craft'},conditions:[{type:'has_item',itemId:'wood',amount:1}],effects:[{type:'add_item',itemId:'firewood',amount:6},{type:'remove_item',itemId:'wood',amount:1},{type:'advance_time',minutes:7},{type:'remove_item',itemId:'wood',amount:1}],nextSceneId:'shelter_crafting_menu_repeat'};
 registry.choices[recipe.id]=recipe;registry.scenes.shelter_crafting_menu_repeat.choiceIds.push(recipe.id);s.contentVersionId=registerContentVersion(registry);s.inventory.wood=1;assert(!activityInputsAvailable(recipe,s));
 let frame=resolveStoryFrame(s,buildRuntimeRegistry(s)),service=new GameService({});let row=service.buildAvailableActions(session(s),frame.scene,frame.choices,buildRuntimeRegistry(s)).find(c=>c.id===recipe.id);
 assert(!row.isAvailable);assert.equal(row.craftingRecipe.requirements.find(r=>r.itemId==='wood').requiredAmount,2);
 const before=s.worldElapsedMs;choose(s,recipe.id);assert.equal(s.worldElapsedMs,before);assert.equal(s.inventory.wood,1);assert.equal(s.activityRevision,0);
 s.inventory.wood=2;choose(s,recipe.id);assert.equal(s.inventory.wood??0,0);assert.equal(s.inventory.firewood,6);assert.equal(s.lastActivity.plannedMinutes,7);assert.equal(s.lastActivity.definitionId,'warm_kindling');
});

test('costs are reserved together and hidden random costs cannot bypass preflight',()=>{
 const s=start();s.inventory.wood=2;s.money=5;
 const recipe={...worldRegistry.choices.craft_firewood,id:'paid_kindling',activity:{kind:'craft'},effects:[{type:'remove_item',itemId:'wood',amount:2},{type:'change_money',amount:-3},{type:'change_money',amount:-3},{type:'advance_time',minutes:10},{type:'add_item',itemId:'firewood',amount:4}]};
 assert(!activityInputsAvailable(recipe,s));s.money=6;assert(activityInputsAvailable(recipe,s));
 for(const effects of [[{type:'add_item',itemId:'firewood',amount:1}],[{type:'advance_to_daybreak'}],[{type:'advance_time',minutes:10},{type:'random_outcome',outcomes:[{weight:1,effects:[{type:'remove_item',itemId:'wood',amount:4}]}]}],[{type:'advance_time',minutes:10},{type:'travel',locationId:'forest'}]])assert.throws(()=>planActivity({...recipe,effects}),/activity/);
});

test('legacy metadata is upgraded without replacing authored yields, costs, durations or archives',()=>{
 const archived=structuredClone(worldRegistry);for(const d of [...Object.values(archived.choices),...Object.values(archived.actions)])delete d.activity;
 const recipe=archived.choices.craft_firewood;recipe.effects.find(e=>e.type==='add_item').amount=9;recipe.effects.find(e=>e.type==='advance_time').minutes=13;
 const version=registerContentVersion(archived),s=start();s.contentVersionId=version;s.inventory.wood=1;delete s.activityRevision;delete s.lastActivity;
 const restored=normalizeGameSession(JSON.parse(JSON.stringify(session(s))));assert.equal(restored.state.activityRevision,0);assert.equal(restored.state.lastActivity,null);assert(buildRuntimeRegistry(restored.state).choices.craft_firewood.activity);
 choose(restored.state,'craft_firewood');assert.equal(restored.state.inventory.firewood,9);assert.equal(restored.state.worldElapsedMs,13*GAME_MINUTE_MS);assert.deepEqual(versionRegistry(version),archived);
});

test('Studio preserves activity metadata and explicit opt-outs instead of silently rewriting authored effects',()=>{
 const doc=getEffectiveContentStudioDocument();const recipe=doc.recipes.find(r=>r.id==='craft_firewood');assert(recipe.activity);recipe.activity=null;const before=structuredClone(recipe.effects);
 const registry=buildWorldRegistryFromStudio(doc);assert.equal(registry.choices.craft_firewood.activity,null);assert.deepEqual(registry.choices.craft_firewood.effects,before);validateRegistry(registry);
 const bad=structuredClone(registry);bad.choices.craft_firewood.activity={kind:'craft'};bad.choices.craft_firewood.effects=bad.choices.craft_firewood.effects.filter(e=>e.type!=='advance_time');assert.throws(()=>validateRegistry(bad),/requires.*minutes/);
});

test('only opted-in work is reordered; instant rest keeps its existing recovery behavior',()=>{
 const s=start();s.stats.hp=5;const before=s.worldElapsedMs;performAction(s,{type:'content_action',actionId:'rest_light_at_shelter'});assert.equal(s.stats.hp,6);assert.equal(s.worldElapsedMs-before,15*GAME_MINUTE_MS);assert.equal(s.activityRevision,0);assert.equal(s.lastActivity,null);
});

test('the service consumes one revision per job, rejecting concurrent replay and allowing a fresh second job',async()=>{
 let stored=session(start(),'activity-service');stored.state.inventory.wood=4;
 const repo={withGameLock:async(_id,fn)=>fn(),loadGame:async()=>structuredClone(stored),saveGame:async s=>{stored=normalizeGameSession(JSON.parse(JSON.stringify(s)))},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendActionLog:async()=>{},appendGenerationLog:async()=>{}};
 const service=new GameService(repo,undefined,undefined,undefined,undefined,async c=>fallbackNarration(c));let snap=await service.getState(stored.id);
 const first=GameActionSchema.parse(snap.availableActions.find(c=>c.id==='craft_firewood').action);assert.equal(first.activityRevision,0);
 await assert.rejects(service.performAction(stored.id,{type:'content_choice',choiceId:'craft_firewood'}),/작업 상황/);
 const results=await Promise.allSettled([service.performAction(stored.id,first),service.performAction(stored.id,first)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(stored.state.inventory.firewood,4);assert.equal(stored.state.inventory.wood,3);assert.equal(stored.state.activityRevision,1);
 snap=await service.getState(stored.id);const second=snap.availableActions.find(c=>c.id==='craft_firewood').action;assert.equal(second.activityRevision,1);await service.performAction(stored.id,second);assert.equal(stored.state.inventory.firewood,8);assert.equal(stored.state.inventory.wood,2);
 const snapshot=JSON.stringify(stored.state);await assert.rejects(service.performAction(stored.id,first),/작업 상황/);assert.equal(JSON.stringify(stored.state),snapshot);
});


test('legacy custom effect shapes are preserved instead of gaining an incompatible activity contract',()=>{
 const registry=structuredClone(worldRegistry);const recipe=registry.choices.craft_firewood;delete recipe.activity;recipe.effects.push({type:'travel',locationId:'forest'});
 const state=start();state.contentVersionId=registerContentVersion(registry);const effective=buildRuntimeRegistry(state);
 assert.equal(effective.choices.craft_firewood.activity,undefined);assert.deepEqual(effective.choices.craft_firewood.effects,recipe.effects);validateRegistry(effective);
});
