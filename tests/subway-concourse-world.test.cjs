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
 const state=createInitialGameState();Object.assign(state,{location:'subway',sceneId:'subway_repeat_intro'});state.flags.opening_seen=true;state.stats={hp:9,mind:8,energy:15};setup(state);
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
test('station arrival offers one connected scene with grounded directions, then dialogue returns to the same position',async()=>{
 const f=await fixture();assert.equal(f.world.player.zone,'concourse');assert(f.world.active);assert(f.snap.exploration);assert.match(f.snap.currentScene.paragraphs.join(' '),/개찰구/);assert.match(f.snap.currentScene.paragraphs.join(' '),/역무실/);assert(f.snap.availableActions.length>=3&&f.snap.availableActions.length<=5);
 assert.equal(f.rows.find(r=>r.action.optionId==='travel:office').outcomeHint,'구역 이동');assert(!f.rows.some(r=>r.action.type==='npc_dialogue'));assert(!f.rows.some(r=>r.action.optionId==='journey:start_subway_expedition'));
 const rows=f.rows.map(r=>r.id),renders=f.renders;await f.poll();assert.deepEqual(f.rows.map(r=>r.id),rows);assert.equal(f.renders,renders);
 await f.choose('focus:shumi_presence');const player=structuredClone(f.world.player);await f.choose('start');assert.equal(f.snap.exploration,null);await f.choose('leave');assert.deepEqual(f.world.player,player);assert(f.snap.exploration);assert.equal(f.npc,1);
});
test('office return is real movement, preserving moved objects and knowledge across regional travel',async()=>{
 const f=await fixture();await f.choose('travel:office');assert.equal(f.world.player.position,'entrance');assert.equal(f.world.player.facing,'far-door');assert.match(f.snap.currentScene.paragraphs[0],/대합실에서 역무실 입구/);assert(!f.snap.currentScene.paragraphs[0].includes('철문 안쪽'));await f.choose('explore:crate');await f.choose('push:crate:door:beside');const crate=structuredClone(f.world.entities.crate),observed=structuredClone(f.world.observations.crate);
 const before=f.world.elapsedSeconds;await f.choose('leave');assert(f.world.active);assert.equal(f.world.player.zone,'concourse');assert(f.world.elapsedSeconds>before);assert(!f.rows.some(r=>r.action.type==='npc_dialogue'));
 await f.raw({type:'travel',targetId:'kitchen'});assert(!f.world.active);await f.raw({type:'travel',targetId:'subway'});assert.equal(f.world.player.zone,'concourse');await f.choose('travel:office');assert.deepEqual(f.world.entities.crate,crate);assert.deepEqual(f.world.observations.crate,observed);
});
test('the regional map uses the open local exit route and rejects a closed or blocked route without moving',async()=>{
 const f=await fixture(s=>{s.textWorld=createSubwayTextWorld();s.textWorld.player.zone='corridor';s.textWorld.visitedZones=['office','concourse','corridor'];s.textWorld.entities.door.components.openable={isOpen:false,locked:false,keyId:'doorKey'};});
 assert.equal(worldDeparturePlan(f.state),null);assert(!f.snap.mapEntries.find(e=>e.locationId==='kitchen').isReachable);assert.match(f.snap.mapEntries.find(e=>e.locationId==='kitchen').reason,/통로/);
 const before=JSON.stringify(f.state);await assert.rejects(f.raw({type:'travel',targetId:'kitchen'}),/통로/);assert.equal(JSON.stringify(f.state),before);
 const travel=f.rows.find(r=>r.action.optionId==='travel:office');assert(travel);await f.raw(travel.action);assert(f.snap.mapEntries.find(e=>e.locationId==='kitchen').isReachable);assert.equal(f.world.player.position,'far-door');assert.match(f.snap.currentScene.paragraphs[0],/정비 복도에서 철문을 지나/);
 const seconds=f.world.elapsedSeconds;await f.raw({type:'travel',targetId:'kitchen'});assert.equal(f.world.player.zone,'concourse');assert(f.world.elapsedSeconds>=seconds+5);assert(!f.world.active);
});
test('a current stair intent starts the existing expedition once, then an offered retreat returns to the same station',async t=>{
 t.mock.method(Math,'random',()=>0);const f=await fixture();await assert.rejects(f.raw({type:'content_action',actionId:'start_subway_expedition'}),/선택지/);
 await f.choose('focus:subway_depth_stairs');const row=f.rows.find(r=>r.action.optionId==='journey:start_subway_expedition');assert(row);assert.equal(f.snap.availableActions[0].action.optionId,row.action.optionId);
 await assert.rejects(f.raw({...row.action,revision:row.action.revision-1}),/바뀌/);const before=f.state.worldElapsedMs,renders=f.renders;
 const request=await f.raw(row.action);assert(f.state.subwayExpedition.active);assert(!f.world.active);assert.equal(f.snap.exploration,null);assert.equal(f.state.worldElapsedMs,before+10*GAME_MINUTE_MS);assert.equal(f.encounters,1);assert.equal(f.renders,renders);
 const after=JSON.stringify(f.state);await f.service.performAction('concourse-test',request.action,{requestId:request.requestId});assert.equal(JSON.stringify(f.state),after);assert.equal(f.encounters,1);assert(await f.service.recoverAction('concourse-test',request.requestId));
 let returned=false;for(let i=0;i<6;i++){
  const home=f.rows.find(r=>r.action.command==='return');if(home){await f.raw(home.action);returned=true;break;}
  const ack=f.rows.find(r=>r.action.command==='acknowledge_encounter');if(ack){await f.raw(ack.action);continue;}
  const choices=f.state.subwayExpedition.currentFloorProgress.encounter?.currentScene?.choices??[];const retreat=choices.find(c=>c.intent.primary==='retreat');assert(retreat,'template must offer retreat');const row=f.rows.find(r=>r.action.optionId===retreat.id);assert(row);await f.raw(row.action);
 }
 assert(returned);assert(!f.state.subwayExpedition.active);assert(f.world.active);assert.equal(f.world.player.zone,'concourse');assert(f.snap.exploration);assert.match(f.snap.currentScene.paragraphs.join(' '),/귀환/);assert.equal(f.renders,renders);
 const count=f.encounters;await f.poll();assert.equal(f.encounters,count);assert.equal(f.renders,renders);
});
test('legacy inactive office saves resume in the concourse without resetting objects or actor placement',async()=>{
 const f=await fixture(s=>{s.textWorld=createSubwayTextWorld();s.textWorld.active=false;s.textWorld.rooms.concourse.outsideExploration=true;delete s.textWorld.rooms.concourse.regionalExit;s.textWorld.entities.shumi_presence.components.position.zone='office';s.textWorld.entities.crate.components.openable.isOpen=true;s.textWorld.entities.water.components.position.zone='player';s.textWorld.entities.water.inventoryRegistered=true;s.inventory.waterBottle=1;});
 assert(f.world.active);assert.equal(f.world.player.zone,'concourse');assert(!f.world.rooms.concourse.outsideExploration);assert(f.world.rooms.concourse.regionalExit);assert(f.world.entities.crate.components.openable.isOpen);assert.equal(f.world.entities.shumi_presence.components.position.zone,'office');assert.equal(f.state.inventory.waterBottle,1);
});

test('authored arrival data controls the actual viewpoint and narration, and rejects disconnected origins',async()=>{
 const f=await fixture(s=>{s.textWorld=createSubwayTextWorld();s.textWorld.active=false;s.textWorld.rooms.office.arrivals={concourse:{position:'authored-entry',facing:'left-wall',text:'대합실에서 들어와 왼쪽 벽으로 시선을 옮긴다.'}};});
 await f.choose('travel:office');assert.equal(f.world.player.position,'authored-entry');assert.equal(f.world.player.facing,'left-wall');assert.match(f.snap.currentScene.paragraphs[0],/왼쪽 벽으로 시선/);
 const {defaultTextRooms}=require('../.server-dist/game/text-world/definitions'),{textRoomIssues}=require('../.server-dist/game/text-world/validation');const rooms=defaultTextRooms();rooms.find(r=>r.id==='office').arrivals.storage={position:'invented'};
 assert(textRoomIssues(rooms,new Set(['waterBottle','scrapMetal','flashlight','ironDoorKey','cannedFood'])).some(i=>i.message.includes('도착 위치')));
});
