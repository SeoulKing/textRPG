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
async function fixture(setup=()=>{},narrator=fallbackNarration){
 const state=createInitialGameState();Object.assign(state,{location:'subway',sceneId:'subway_repeat_intro'});state.flags.opening_seen=true;state.stats={hp:9,mind:8,energy:15};await setup(state);
 let saved={id:'concourse-test',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}},snap,renders=0,encounters=0,npc=0,seq=0;
 const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>normalizeGameSession(sorted(structuredClone(saved))),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s))},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const fallback=createNpcDialogueGenerator(undefined,()=>false);
 const service=new GameService(repo,undefined,undefined,async()=>{encounters++;throw Error('Template encounter')},async c=>{npc++;return fallback(c)},async c=>{renders++;return narrator(c)});
 const f={service,get state(){return saved.state},get world(){return saved.state.textWorld},get snap(){return snap},get renders(){return renders},get encounters(){return encounters},get npc(){return npc},
 get rows(){return [...snap.availableActions,...(snap.exploration?.generalActions??[]),...(snap.exploration?.targets??[]).flatMap(t=>t.actions)]},
 async poll(){snap=await service.getState(saved.id);return snap},
 async raw(action,requestId='concourse-'+(++seq)){snap=await service.performAction(saved.id,action,{requestId});return {action,requestId}},
 async choose(id){const row=f.rows.find(r=>r.action.optionId===id||r.action.command===id||r.id===id);assert(row,'not offered '+id+'; '+f.rows.map(r=>r.action.optionId||r.action.command));return f.raw(row.action)}};
 await f.poll();return f;
}

const {startSubwayExpedition,descendSubwayFloor}=require('../.server-dist/game/subway-expedition');
const {beginSubwaySituation}=require('../.server-dist/game/subway-encounter');
const {expeditionFloorIds}=require('../.server-dist/game/text-world/expedition-floor-state');
const {combatGeometry,advanceCombatOpponent}=require('../.server-dist/game/text-world/combat-space');
const {interactionContext}=require('../.server-dist/game/text-world/interaction-context');
const {directNarrative}=require('../.server-dist/game/text-world/perception');
const {buildNarrationPrompt}=require('../.server-dist/game/text-world/narration-prompt');
async function battle(setup=()=>{}){const f=await fixture(setup);await f.choose('focus:subway_depth_stairs');await f.choose('journey:start_subway_expedition');return f;}
function combatRow(f,primary){const choices=f.state.subwayExpedition.currentFloorProgress.encounter.currentScene.choices;return f.rows.find(r=>choices.some(c=>c.intent.primary===primary&&r.action.optionId==='combat:'+c.id));}
test('combat enters the same visible world with threat-directed choices, one renderer call and stable JSONB receipts',async t=>{
 t.mock.method(Math,'random',()=>.7);const f=await fixture();await f.choose('focus:subway_depth_stairs');const renders=f.renders;
 const request=await f.choose('journey:start_subway_expedition');assert(f.world.active);assert(f.snap.exploration);assert.equal(f.encounters,0);assert.equal(f.renders,renders+1);assert.equal(interactionContext(f.world).threat.kind,'hostile');
 assert(f.snap.availableActions.length>=3&&f.snap.availableActions.length<=5);assert(f.snap.availableActions.some(r=>r.action.optionId.startsWith('combat:')));assert.match(f.snap.currentScene.paragraphs.join(' '),/공격할 태세/);assert(!f.rows.some(r=>r.action.optionId?.startsWith('hide:')&&r.action.optionId.endsWith('_cache0')));
 const frame=JSON.stringify(f.snap.availableActions);await f.poll();assert.equal(JSON.stringify(f.snap.availableActions),frame);assert.equal(f.renders,renders+1);
 await f.service.performAction('concourse-test',request.action,{requestId:request.requestId});assert.equal(f.renders,renders+1);assert(await f.service.recoverAction('concourse-test',request.requestId));
 const encounter=f.state.subwayExpedition.currentFloorProgress.encounter;await assert.rejects(f.raw({type:'subway_expedition',command:'encounter_choice',optionId:encounter.currentScene.choices[0].id,turnNumber:encounter.turnNumber}),/현재 위치/);
});
test('cover changes real retaliation odds and standing to attack removes its protection',async t=>{
 t.mock.method(Math,'random',()=>.4);const f=await battle(),ids=expeditionFloorIds(f.state),hp=f.state.stats.hp;await f.choose('hide:'+ids.prefix+'_cache1');
 assert.equal(combatGeometry(f.state).counterPenalty,30);assert.equal(f.state.stats.hp,hp);assert.equal(f.world.player.posture,'crouching');
 const attack=combatRow(f,'attack');assert(attack);const before=f.renders;await f.raw(attack.action);assert.equal(f.renders,before+1);assert.equal(f.world.player.posture,'standing');assert.equal(combatGeometry(f.state).counterPenalty,0);assert(f.state.stats.hp<hp);
 const result=f.state.subwayExpedition.currentFloorProgress.encounter.history.at(-1).result;assert(result.damageDealt>0);assert(result.damageTaken>0);
});
test('crossing and closing a real door makes the opponent spend its response opening it, then pursuit spends another response',async t=>{
 t.mock.method(Math,'random',()=>0);const f=await battle(),ids=expeditionFloorIds(f.state),hp=f.state.stats.hp;
 await f.choose('separate:'+ids.landing);assert.equal(f.world.player.zone,ids.landing);assert.equal(f.state.stats.hp,hp);
 const close=f.world.events.find(e=>e.type==='CLOSE'),open=f.world.events.find(e=>e.type==='OPEN'&&e.origin==='simulation');assert(close&&open);assert(close.at<=open.at);assert.equal(combatGeometry(f.state).reachable,false);assert(!combatRow(f,'attack'));
 const candidate=f.rows.find(r=>r.action.optionId?.startsWith('focus:'));assert(candidate);await f.raw(candidate.action);assert(f.world.events.some(e=>e.type==='ACTOR_MOVE'));assert.equal(f.state.stats.hp,hp);assert.equal(combatGeometry(f.state).reachable,true);
});
test('combat search stops at discovery, collection is separate and duplicated requests cannot duplicate provisional loot',async t=>{
 t.mock.method(Math,'random',()=>.99);const f=await battle(),ids=expeditionFloorIds(f.state),host=ids.prefix+'_cache0';await f.choose('explore:'+host);
 assert.deepEqual(f.state.subwayExpedition.carriedLoot,{});assert(f.world.entities[host].components.openable.isOpen);assert(f.state.subwayExpedition.currentFloorProgress.searchedLootSpotIds.length);
 const before=f.renders,request=await f.choose('collect:'+host);assert.equal(f.state.subwayExpedition.carriedLoot.cannedFood,1);assert.equal(f.state.subwayExpedition.currentFloorProgress.floorLoot.cannedFood,1);assert.equal(f.renders,before+1);
 await f.service.performAction('concourse-test',request.action,{requestId:request.requestId});await f.poll();assert.equal(f.state.subwayExpedition.carriedLoot.cannedFood,1);assert.equal(f.renders,before+1);
});
test('inventory consumption during combat pays its authored time once and gives the opponent a response',async t=>{
 t.mock.method(Math,'random',()=>0);const f=await battle(s=>{s.inventory.cannedFood=1;}),before=f.state.worldElapsedMs,turn=f.state.subwayExpedition.currentFloorProgress.encounter.turnNumber,renders=f.renders;
 await f.raw({type:'use_item',itemId:'cannedFood'});assert.equal(f.state.inventory.cannedFood??0,0);assert.equal(f.state.worldElapsedMs-before,10*GAME_MINUTE_MS);assert.equal(f.renders,renders+1);
 assert.equal(f.state.subwayExpedition.currentFloorProgress.encounter.turnNumber,turn+1);assert(f.world.events.some(e=>e.type==='ITEM_USE'));assert(f.world.events.some(e=>e.type==='COMBAT'&&e.after.damageTaken>0));
});
test('passive recovery of a saved encounter creates the matching room and threat without provider calls',async()=>{
 const f=await fixture(async s=>{await startSubwayExpedition(s,'restore');beginSubwaySituation(s);});const ids=expeditionFloorIds(f.state);
 assert.equal(f.world.player.zone,ids.room);assert(f.world.active);assert.equal(f.renders,0);assert.equal(f.encounters,0);assert.match(f.snap.currentScene.paragraphs.join(' '),/공격할 태세/);assert(f.snap.availableActions.length>=3);
});
test('peaceful resolution removes hostility and preserves searched objects, while escape exposes only a return route',async t=>{
 t.mock.method(Math,'random',()=>0);const f=await battle(),ids=expeditionFloorIds(f.state);await f.raw(combatRow(f,'persuade').action);
 assert(f.world.active);assert.equal(f.world.player.zone,ids.room);assert.equal(f.state.subwayExpedition.currentFloorProgress.encounter.resolution,'talked_down');assert.equal(interactionContext(f.world).threat,null);assert(f.snap.exploration);
 const escaped=await battle();await escaped.raw(combatRow(escaped,'retreat').action);assert.equal(escaped.state.subwayExpedition.currentFloorProgress.encounter.resolution,'escaped');assert.deepEqual(escaped.snap.availableActions.map(r=>r.action.command),['return']);
 await assert.rejects(descendSubwayFloor(structuredClone(escaped.state),'bypass'),/핵심 상황/);await escaped.choose('return');assert.equal(escaped.world.player.zone,'concourse');assert(!escaped.state.subwayExpedition.active);
});
test('victory and an offered upgrade return to the same searchable floor without auto-awarding loot',async t=>{
 t.mock.method(Math,'random',()=>.7);const f=await battle(),ids=expeditionFloorIds(f.state);let attacks=0;
 while(f.state.subwayExpedition.currentFloorProgress.phase==='encounter'&&attacks++<5){const row=combatRow(f,'attack');assert(row);await f.raw(row.action);}
 assert.equal(f.state.subwayExpedition.currentFloorProgress.encounter.resolution,'victory');assert.equal(f.state.subwayExpedition.currentFloorProgress.phase,'upgrade');assert.equal(f.snap.exploration,null);
 assert(f.snap.availableActions.every(r=>r.action.command==='choose_upgrade'));await f.raw(f.snap.availableActions[0].action);assert(f.snap.exploration);assert.equal(f.world.player.zone,ids.room);assert.deepEqual(f.state.subwayExpedition.carriedLoot,{});assert(!f.world.entities[ids.prefix+'_opponent'].components.combatant.hostile);
});
test('the held weapon spends its own last durability without consuming a spare or creating an item',async t=>{
 t.mock.method(Math,'random',()=>.7);const f=await battle(s=>{s.inventory.utilityKnife=2;s.toolDurability.utilityKnife=1;});const knife=Object.values(f.world.entities).find(e=>e.components.portable?.itemId==='utilityKnife'&&e.toolDurability===1);assert(knife);
 await f.choose('hold:'+knife.id);const weapon=f.rows.find(r=>r.action.optionId==='combat:tool-utilityKnife');assert(weapon);assert(f.snap.availableActions.some(r=>r.action.optionId===weapon.action.optionId));await f.raw(weapon.action);
 assert.equal(f.state.inventory.utilityKnife,1);assert(f.world.entities[knife.id].components.position.zone==='consumed');assert(f.state.subwayExpedition.currentFloorProgress.encounter.history.at(-1).result.damageDealt>0);
});
test('inventory flashlight toggles react once, and a matching-state repeat does not spend time or call the renderer',async t=>{
 t.mock.method(Math,'random',()=>.99);const f=await battle(s=>{s.inventory.flashlight=1;});const control=f.snap.inventoryLights.find(c=>c.itemId==='flashlight');assert(control);
 const action={type:'item_light',worldId:control.worldId,entityId:control.entityId,on:true,revision:control.revision},renders=f.renders,turn=f.state.subwayExpedition.currentFloorProgress.encounter.turnNumber;
 await f.raw(action);assert.equal(f.renders,renders+1);assert.equal(f.state.subwayExpedition.currentFloorProgress.encounter.turnNumber,turn+1);assert(f.world.events.some(e=>e.type==='LIGHT'));assert(f.world.events.some(e=>e.type==='COMBAT'));
 const updated=f.snap.inventoryLights.find(c=>c.entityId===control.entityId),before=f.state.worldElapsedMs;await f.raw({...action,revision:updated.revision});assert.equal(f.state.worldElapsedMs,before);assert.equal(f.renders,renders+1);
});
test('an automatic door closure interrupts a compound intention without applying unperformed combat actions',async t=>{
 t.mock.method(Math,'random',()=>.99);const f=await battle(),ids=expeditionFloorIds(f.state);Object.assign(f.world.entities[ids.door].components.openable,{autoCloseSeconds:1,remainingOpenSeconds:1});await f.poll();
 const hp=f.state.subwayExpedition.currentFloorProgress.encounter.enemy.hp;await f.choose('separate:'+ids.landing);assert(f.world.events.some(e=>e.type==='STOPPED'));assert.equal(f.state.subwayExpedition.currentFloorProgress.encounter.enemy.hp,hp);assert.equal(f.world.player.zone,ids.landing);
});
test('a failed renderer preserves combat adjudication, one call and a recoverable next decision',async t=>{
 t.mock.method(Math,'random',()=>.7);const f=await fixture(()=>{},()=>{throw Error('Generation unavailable')});await f.choose('focus:subway_depth_stairs');await f.choose('journey:start_subway_expedition');const attack=combatRow(f,'attack'),hp=f.state.subwayExpedition.currentFloorProgress.encounter.enemy.hp,calls=f.renders;
 const request=await f.raw(attack.action);assert.equal(f.renders,calls+1);assert.equal(f.snap.currentScene.source,'template');assert(f.state.subwayExpedition.currentFloorProgress.encounter.enemy.hp<hp);assert(combatRow(f,'attack'));
 await f.service.performAction('concourse-test',request.action,{requestId:request.requestId});assert.equal(f.renders,calls+1);assert(f.snap.currentScene.paragraphs.length>=2);
});
test('fixed wall furniture and destroyed cover cannot be used to hide; NPC door events do not invent player touch',async t=>{
 t.mock.method(Math,'random',()=>.7);const f=await battle(),ids=expeditionFloorIds(f.state),world=structuredClone(f.world);
 const {canProvideCover}=require('../.server-dist/game/text-world/spatial');assert(!canProvideCover(world,world.entities[ids.prefix+'_cache0']));assert(canProvideCover(world,world.entities[ids.prefix+'_cache1']));world.entities[ids.prefix+'_cache1'].components.structure.integrity=0;assert(!canProvideCover(world,world.entities[ids.prefix+'_cache1']));
 await f.choose('separate:'+ids.landing);const copy=structuredClone(f.world);copy.entities[ids.door].details.touch='손끝으로 차가운 금속이 전해진다.';copy.events=copy.events.filter(e=>e.origin==='simulation');const context=directNarrative(copy);assert(![...context.requiredFacts,...context.optionalFacts].some(f=>f.id==='touch:'+ids.door));assert.match(buildNarrationPrompt(context),/상대의 행동/);
});
