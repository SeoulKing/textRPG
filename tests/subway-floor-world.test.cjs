const test=require('node:test'),assert=require('node:assert/strict');
const {GameService}=require('../.server-dist/game/service');
const {createInitialGameState,performAction}=require('../.server-dist/game/rules');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {createNpcDialogueGenerator}=require('../.server-dist/game/npc-dialogue-pipeline');
const {createSubwayTextWorld}=require('../.server-dist/game/text-world/world');
const {worldDeparturePlan}=require('../.server-dist/game/text-world/departure');
const {GAME_MINUTE_MS}=require('../.server-dist/game/base-data');
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,sorted(v[k])])):v;
test.beforeEach(t=>{t.mock.method(global,'fetch',async()=>{throw Error('External requests disabled in concourse verification')});process.env.ENABLE_LLM_WORLD_PLANNER='false';process.env.ENABLE_LLM_BACKGROUND_GENERATION='false';});
async function fixture(setup=()=>{}){
 const state=createInitialGameState();Object.assign(state,{location:'subway',sceneId:'subway_repeat_intro'});state.flags.opening_seen=true;state.stats={hp:9,mind:8,energy:15};await setup(state);
 let saved={id:'concourse-test',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}},snap,renders=0,encounters=0,npc=0,seq=0;
 const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>normalizeGameSession(sorted(structuredClone(saved))),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s))},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const fallback=createNpcDialogueGenerator(undefined,()=>false);
 const service=new GameService(repo,undefined,undefined,async()=>{encounters++;throw Error('Template encounter')},async c=>{npc++;return fallback(c)},async c=>{renders++;return fallbackNarration(c)});
 const f={service,get state(){return saved.state},get world(){return saved.state.textWorld},get snap(){return snap},get renders(){return renders},get encounters(){return encounters},get npc(){return npc},
 get rows(){return [...snap.availableActions,...(snap.exploration?.generalActions??[]),...(snap.exploration?.targets??[]).flatMap(t=>t.actions)]},
 async poll(){snap=await service.getState(saved.id);return snap},
 async raw(action,requestId='concourse-'+(++seq)){snap=await service.performAction(saved.id,action,{requestId});return {action,requestId}},
 async choose(id){const row=f.rows.find(r=>r.action.optionId===id||r.action.command===id||r.id===id);assert(row,'not offered '+id+'; '+f.rows.map(r=>r.action.optionId||r.action.command));return f.raw(row.action)}};
 await f.poll();return f;
}

const {startSubwayExpedition}=require('../.server-dist/game/subway-expedition');
const {expeditionFloorIds}=require('../.server-dist/game/text-world/expedition-floor-state');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {reconcileWorldInventory,transferInventoryOwnership}=require('../.server-dist/game/text-world/inventory-state');
const {carriedByPlayer}=require('../.server-dist/game/text-world/spatial');
async function safeFloor(setup=()=>{}){return fixture(async s=>{await startSubwayExpedition(s,'floor-test');Object.assign(s.subwayExpedition.currentFloorProgress,{eventResolved:true,phase:'complete'});setup(s);});}
async function peacefulResolution(f){
 for(let i=0;i<8&&!f.snap.exploration;i++){
  const command=f.rows.find(r=>r.action.command==='acknowledge_encounter'||r.action.command==='choose_upgrade');
  if(command){await f.raw(command.action);continue;}
  const choice=f.state.subwayExpedition.currentFloorProgress.encounter?.currentScene?.choices.find(c=>c.intent.primary==='persuade');assert(choice,'persuasion must be offered');await f.choose(choice.id);
 }
 assert(f.snap.exploration,'resolved encounter must hand back to spatial exploration');
}
test('actual stairs and peaceful encounter lead to separate discovery and collection; polls and duplicate requests cost no extra call',async t=>{
 t.mock.method(Math,'random',()=>0);const f=await fixture();await f.choose('focus:subway_depth_stairs');await f.choose('journey:start_subway_expedition');await peacefulResolution(f);
 const ids=expeditionFloorIds(f.state),host=ids.prefix+'_cache0';assert.equal(f.world.player.zone,ids.room);assert.deepEqual(f.state.subwayExpedition.carriedLoot,{});assert(f.snap.availableActions.length>=3&&f.snap.availableActions.length<=5);
 assert(!f.snap.exploration.targets.some(t=>t.name==='캔 음식'));assert(f.snap.state.subwayExpedition.currentFloor.lootSpots.every(s=>s.contents.length===0));assert.deepEqual(f.snap.state.subwayExpedition.exploredFloors,{});
 const before=f.state.worldElapsedMs;await f.choose('explore:'+host);assert(f.world.entities[host].components.openable.isOpen);assert(f.state.worldElapsedMs>=before+15*GAME_MINUTE_MS);assert.deepEqual(f.state.subwayExpedition.carriedLoot,{});
 assert(f.rows.some(r=>r.action.optionId==='collect:'+host));const request=await f.choose('collect:'+host),renders=f.renders;assert.equal(f.state.subwayExpedition.carriedLoot.cannedFood,1);assert.equal(f.state.inventory.cannedFood??0,0);
 await f.service.performAction('concourse-test',request.action,{requestId:request.requestId});await f.poll();assert.equal(f.renders,renders);assert.equal(f.state.subwayExpedition.carriedLoot.cannedFood,1);assert(!f.rows.some(r=>r.action.optionId==='collect:'+host));
});
test('physical route obstruction, floor revisit and return preserve dropped and carried objects without a second encounter',async t=>{
 t.mock.method(Math,'random',()=>0);const f=await safeFloor(),ids=expeditionFloorIds(f.state),box=ids.prefix+'_cache1';
 await f.choose('explore:'+box);await f.choose('collect:'+box);const loot=Object.values(f.world.entities).find(e=>e.expeditionLoot&&e.components.portable?.itemId==='painRelief');assert(loot);
 await f.choose('push:'+box+':'+ids.door+':blocking');assert(!f.rows.some(r=>r.action.optionId==='travel:'+ids.landing));await assert.rejects(f.raw({type:'subway_expedition',command:'descend'}),/현재 위치/);await assert.rejects(f.raw({type:'text_world',command:'choose',optionId:'journey:descend',revision:f.world.revision}),/선택할 수 없/);
 await f.choose('push:'+box+':'+ids.door+':beside');await f.choose('travel:'+ids.landing);await f.choose('focus:'+ids.prefix+'_down');await f.choose('journey:descend');await peacefulResolution(f);assert.equal(f.state.subwayExpedition.depth,2);
 const next=expeditionFloorIds(f.state),calls=f.encounters;await f.choose('focus:'+next.prefix+'_up');await f.choose('journey:ascend');assert.equal(f.state.subwayExpedition.depth,1);assert.equal(f.encounters,calls);assert.equal(f.world.entities[box].components.position.relation,'beside');assert.equal(f.state.subwayExpedition.carriedLoot.painRelief,1);
 await f.choose('travel:'+ids.landing);await f.choose('focus:'+ids.prefix+'_down');await f.choose('journey:descend');assert.equal(f.state.subwayExpedition.depth,2);assert.equal(f.encounters,calls);
 await f.choose('focus:'+next.prefix+'_up');await f.choose('journey:ascend');await f.choose('focus:'+ids.prefix+'_up');await f.choose('journey:return');assert(!f.state.subwayExpedition.active);assert.equal(f.world.player.zone,'concourse');assert.equal(f.state.inventory.painRelief,1);assert(!f.world.entities[loot.id].expeditionLoot);assert(carriedByPlayer(f.world,f.world.entities[loot.id]));
});
test('old paid victory migrates to empty caches, with its provisional award preserved once',async()=>{
 const f=await safeFloor(s=>{s.subwayExpedition.spatialMode=false;s.subwayExpedition.carriedLoot={cannedFood:1};const {createSubwaySituation}=require('../.server-dist/game/subway-encounter');s.subwayExpedition.currentFloorProgress.encounter=createSubwaySituation(s);Object.assign(s.subwayExpedition.currentFloorProgress.encounter,{resolution:'victory',rewardGranted:true});});
 assert.equal(f.state.subwayExpedition.carriedLoot.cannedFood,1);assert(Object.values(f.world.entities).filter(e=>e.components.expeditionCache).every(e=>e.components.container.items.length===0));const project=()=>sorted(Object.fromEntries(Object.values(f.world.entities).map(e=>[e.id,{position:e.components.position,item:e.components.portable,provisional:e.expeditionLoot}])));const before=project();await f.poll();assert.deepEqual(project(),before);
});
test('an open shelf never records an unsearched hidden compartment as empty',async()=>{
 const f=await safeFloor(),ids=expeditionFloorIds(f.state),host=ids.prefix+'_cache2';await f.choose('focus:'+host);assert(!f.world.observations[host]?.stages.includes('interior'));assert(f.rows.some(r=>r.action.optionId==='explore:'+host));
 const before=f.state.worldElapsedMs;await f.choose('explore:'+host);assert(f.state.worldElapsedMs>=before+15*GAME_MINUTE_MS);assert(f.world.observations[host].inspected);assert(!f.rows.some(r=>r.action.optionId==='explore:'+host));
});

test('putting provisional loot down debits it once and a saved revisit can collect that same object once',async()=>{
 const f=await safeFloor(),ids=expeditionFloorIds(f.state),host=ids.prefix+'_cache0';await f.choose('explore:'+host);await f.choose('collect:'+host);
 const loot=Object.values(f.world.entities).find(e=>e.expeditionLoot&&e.inventoryRegistered&&e.components.portable?.itemId==='cannedFood');assert(loot);await f.choose('drop:'+loot.id);assert.equal(f.state.subwayExpedition.carriedLoot.cannedFood??0,0);assert.equal(f.state.subwayExpedition.currentFloorProgress.floorLoot.cannedFood,1);
 await f.choose('travel:'+ids.landing);await f.poll();await f.choose('travel:'+ids.room);const offered=f.rows.find(r=>r.action.optionId==='take:'+loot.id);assert(offered);await f.raw(offered.action);assert.equal(f.state.subwayExpedition.carriedLoot.cannedFood,1);assert.equal(f.state.subwayExpedition.currentFloorProgress.floorLoot.cannedFood,1);assert.equal(f.world.entities[loot.id].components.position.zone,'player');
});
test('container ownership separates owned and provisional stacks of the same item across drop, restore and native consumption',async()=>{
 const f=await safeFloor(s=>{s.inventory.cannedFood=2;s.subwayExpedition.carriedLoot.cannedFood=1;}),s=structuredClone(f.state),w=s.textWorld;
 const owned=Object.values(w.entities).find(e=>!e.expeditionLoot&&e.inventoryRegistered&&e.components.portable?.itemId==='cannedFood');const loot=Object.values(w.entities).find(e=>e.expeditionLoot&&e.inventoryRegistered&&e.components.portable?.itemId==='cannedFood');
 const bag={id:'test-bag',name:'가방',description:'가방',inventoryRegistered:true,components:{position:{zone:'player'},portable:{itemId:null,amount:1},container:{items:[owned.id,loot.id]}}};w.entities[bag.id]=bag;owned.components.position={zone:bag.id,relation:'inside'};loot.components.position={zone:bag.id,relation:'inside'};
 transferInventoryOwnership(w,s,bag,{zone:w.player.zone});assert.equal(s.inventory.cannedFood,0);assert.equal(s.subwayExpedition.carriedLoot.cannedFood??0,0);reconcileWorldInventory(s);assert.equal(loot.components.position.zone,bag.id);
 transferInventoryOwnership(w,s,bag,{zone:'player'},true);assert.equal(s.inventory.cannedFood,2);assert.equal(s.subwayExpedition.carriedLoot.cannedFood,1);delete s.subwayExpedition.carriedLoot.cannedFood;reconcileWorldInventory(s);assert.equal(loot.components.position.zone,'consumed');assert.equal(owned.components.position.zone,bag.id);assert.equal(owned.components.portable.amount,2);
});
test('provisional tool wear consumes the selected physical tool, preserving permanent spares',async()=>{
 const f=await safeFloor(s=>{s.inventory.crudeAxe=1;s.subwayExpedition.carriedLoot.crudeAxe=1;}),s=structuredClone(f.state),w=s.textWorld;
 const loot=Object.values(w.entities).find(e=>e.expeditionLoot&&e.components.portable?.itemId==='crudeAxe');const permanent=Object.values(w.entities).find(e=>!e.expeditionLoot&&e.inventoryRegistered&&e.components.portable?.itemId==='crudeAxe');loot.toolDurability=2;permanent.toolDurability=8;w.player.heldItemId=loot.id;
 const {applyEffect}=require('../.server-dist/game/state-utils');applyEffect({type:'damage_tool',itemId:'crudeAxe',amount:1},s);assert.equal(loot.toolDurability,1);assert.equal(s.subwayExpedition.carriedLoot.crudeAxe,1);
 applyEffect({type:'damage_tool',itemId:'crudeAxe',amount:1},s);reconcileWorldInventory(s);assert.equal(loot.components.position.zone,'consumed');assert.equal(s.inventory.crudeAxe,1);assert.equal(s.subwayExpedition.carriedLoot.crudeAxe??0,0);assert.equal(permanent.toolDurability,8);
});
test('failed return loses provisional goods without consuming permanent gear',async()=>{
 const f=await safeFloor(s=>{s.inventory.crudeAxe=1;s.subwayExpedition.carriedLoot.cannedFood=1;}),s=structuredClone(f.state),w=s.textWorld;const loot=Object.values(w.entities).find(e=>e.expeditionLoot&&e.inventoryRegistered&&e.components.portable?.itemId==='cannedFood');
 s.isGameOver=true;s.gameOverReason='귀환 중 쓰러졌다.';s.stats.hp=0;require('../.server-dist/game/subway-expedition').returnFromSubwayExpedition(s);reconcileWorldInventory(s);
 assert.deepEqual(s.subwayExpedition.carriedLoot,{});assert.equal(s.inventory.cannedFood??0,0);assert.equal(s.inventory.crudeAxe,1);assert.equal(loot.components.position.zone,'consumed');
});

test('first floor suggestions survive normalized reload with identical IDs, costs and thoughts',async()=>{
 const f=await safeFloor();const rows=structuredClone(f.snap.availableActions);assert(rows.some(r=>r.outcomeHint.includes('+15분')));const player=structuredClone(f.world.player),calls=f.renders;
 await f.poll();assert.deepEqual(f.snap.availableActions,rows);assert.deepEqual(f.world.player,player);assert.equal(f.renders,calls);
});

test('provisional food appears in the item API and using it consumes only that ledger with one chip and no narration call',async()=>{
 const f=await safeFloor(),ids=expeditionFloorIds(f.state);await f.choose('explore:'+ids.prefix+'_cache0');await f.choose('collect:'+ids.prefix+'_cache0');
 const cards=await f.service.getInventory('concourse-test');assert(cards.inventoryCards.some(c=>c.id==='cannedFood'));
 const calls=f.renders;await f.raw({type:'use_item',itemId:'cannedFood'});assert.equal(f.state.subwayExpedition.carriedLoot.cannedFood??0,0);assert.equal(f.state.inventory.cannedFood??0,0);assert.equal(f.renders,calls);
 assert.equal(f.state.systemNoteEntries.filter(e=>e.type==='delta'&&e.subject==='item'&&e.itemId==='cannedFood'&&e.amount===-1).length,1);
 const id=ids.prefix+'_cache0_cannedFood';assert.equal(f.world.entities[id].components.position.zone,'consumed');assert(!f.rows.some(r=>r.action.optionId==='hold:'+id));
});

test('return at the upper stairs retains the native depth cost and respects a previously blocked floor',async t=>{
 t.mock.method(Math,'random',()=>0);const f=await safeFloor(),ids=expeditionFloorIds(f.state);await f.choose('travel:'+ids.landing);await f.choose('focus:'+ids.prefix+'_down');await f.choose('journey:descend');await peacefulResolution(f);
 const current=expeditionFloorIds(f.state);await f.choose('focus:'+current.prefix+'_up');const home=f.rows.find(r=>r.action.optionId==='journey:return');assert(home);assert.equal(home.outcomeHint,'+10분');assert(f.rows.some(r=>r.action.optionId==='journey:ascend'));
 const state=structuredClone(f.state);state.textWorld.entities[ids.door].components.openable.isOpen=false;const {expeditionRouteOptions}=require('../.server-dist/game/text-world/expedition-floor-state');assert(!expeditionRouteOptions(state).some(o=>o.subwayCommand==='return'));assert(expeditionRouteOptions(state).some(o=>o.subwayCommand==='ascend'));
 const before=f.state.worldElapsedMs;await f.raw(home.action);assert.equal(f.state.worldElapsedMs-before,10*GAME_MINUTE_MS);assert.equal(f.world.player.zone,'concourse');
});
