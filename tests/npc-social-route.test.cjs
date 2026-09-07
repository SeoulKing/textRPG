const test=require('node:test'),assert=require('node:assert/strict');
const {GameService}=require('../.server-dist/game/service');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {createNpcDialogueGenerator}=require('../.server-dist/game/npc-dialogue-pipeline');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {npcSocialActions}=require('../.server-dist/game/npc-social');
function sorted(v){return Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,sorted(v[k])])):v;}
const rows=snap=>[...snap.availableActions,...(snap.exploration?.generalActions??[]),...(snap.exploration?.targets??[]).flatMap(t=>t.actions)];

test('a fresh survivor makes audible changes, talks, gives real goods and unlocks a finite trade without duplicate transfers',async t=>{
 const flags=['ENABLE_LLM_WORLD_PLANNER','ENABLE_LLM_BACKGROUND_GENERATION'],previous=flags.map(key=>process.env[key]);flags.forEach(key=>process.env[key]='false');
 t.after(()=>flags.forEach((key,i)=>previous[i]===undefined?delete process.env[key]:process.env[key]=previous[i]));
 t.mock.method(global,'fetch',async()=>{throw Error('No external calls in the social route')});
 let saved,request=0;const requests=[];
 const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>normalizeGameSession(sorted(structuredClone(saved))),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s));},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const npcGenerator=createNpcDialogueGenerator(async req=>{requests.push(req);throw Error('Use the deterministic reply after one simulated failure')},()=>true);
 const service=new GameService(repo,undefined,undefined,undefined,npcGenerator,async c=>fallbackNarration(c));
 let snap=await service.createGame();
 async function choose(id) {
  const selected=rows(snap).find(row=>row.id===id||row.action.optionId===id||row.action.choiceId===id||row.action.actionId===id);
  const action=id.startsWith('travel:')?{type:'travel',targetId:id.slice(7)}:selected?.action;
  assert(action,'Not offered: '+id+'; '+rows(snap).map(row=>row.action.optionId||row.id));
  return perform(action);
 }
 async function perform(action) {
  const requestId='social-route-'+(++request);snap=await service.performAction(saved.id,action,{requestId});
  assert(!snap.state.isGameOver);assert(snap.availableActions.length<=5);return {action,requestId};
 }
 for(const id of ['opening_commit','travel:convenience','explore:convenience_food_crate','collect:convenience_food_crate','explore:convenience_supply_pile','collect:convenience_supply_pile','travel:subway','text-world:enter','explore:crate','collect:crate','push:crate:door:beside','leave','npc-dialogue:shumi:start'])await choose(id);
 assert.match(snap.currentScene.paragraphs.join(' '),/소리가 들린/);
 assert(requests[0].payload.worldExperience.observations.every(o=>o.sense==='heard'&&!o.actorKnown));
 assert.deepEqual(requests[0].payload.worldContext.player.recentLog,[]);assert.equal(requests[0].payload.worldContext.player.condition,undefined);
 assert.deepEqual(snap.state.npcDialogue.conversations,{});assert(!snap.availableActions.some(row=>row.action.command==='trade'));
 const gift=await perform(snap.availableActions.find(row=>row.action.command==='give').action);
 assert.equal(requests.length,2);assert.equal(snap.currentScene.paragraphs.length,3);assert.match(snap.currentScene.paragraphs[0],/건네자/);
 const stock=structuredClone(saved.state.npcDialogue.conversations.shumi.inventory),inventory={...saved.state.inventory},time=saved.state.worldElapsedMs;
 const duplicate=await service.performAction(saved.id,gift.action,{requestId:gift.requestId});assert.equal(requests.length,2);assert.deepEqual(duplicate.state.inventory,inventory);
 assert.deepEqual(saved.state.npcDialogue.conversations.shumi.inventory,stock);assert.equal(saved.state.worldElapsedMs,time);
 assert(await service.recoverAction(saved.id,gift.requestId));
 await assert.rejects(()=>service.performAction(saved.id,gift.action,{requestId:'stale-gift'}),/이미 지난/);
 await perform(snap.availableActions.find(row=>row.action.command==='give').action);assert.equal(requests.length,3);
 const trade=snap.availableActions.find(row=>row.action.command==='trade');assert(trade,'an actual relationship change makes the trade available');
 const beforeTrade={...snap.state.inventory};await perform(trade.action);assert.equal(requests.length,4);
 assert.equal(snap.state.inventory.radioBattery,(beforeTrade.radioBattery??0)+1);assert.equal(snap.state.inventory.scrapMetal,beforeTrade.scrapMetal-2);
 assert.equal(saved.state.npcDialogue.conversations.shumi.inventory.radioBattery,0);
 assert(!npcSocialActions(saved.state,buildRuntimeRegistry(saved.state)).some(row=>row.action.command==='trade'));
 const afterTrade={...snap.state.inventory};await perform({type:'npc_dialogue',command:'leave',npcId:'shumi'});await choose('npc-dialogue:shumi:start');
 assert.deepEqual(snap.state.inventory,afterTrade);assert.equal(saved.state.npcDialogue.conversations.shumi.inventory.radioBattery,0);
 assert(saved.state.npcDialogue.conversations.shumi.observations.some(o=>o.sense==='exchange'));
 assert(!snap.availableActions.some(row=>row.action.command==='trade'));
 t.diagnostic('Completed '+request+' game actions with '+requests.length+' simulated dialogue requests; no resources or time injected.');
});
test('an authored resident can be approached and spoken to inside exploration, then return without losing world state',async t=>{
 t.mock.method(global,'fetch',async()=>{throw Error('No provider calls')});
 const {createInitialGameState}=require('../.server-dist/game/rules');
 const {createSubwayTextWorld}=require('../.server-dist/game/text-world/world');
 const state=createInitialGameState();state.location='subway';state.sceneId='subway_repeat_intro';state.flags.opening_seen=true;state.textWorld=createSubwayTextWorld();
 state.textWorld.entities.shumi_presence.components.position.zone='office';state.textWorld.player.focusEntityId=null;
 let saved={id:'resident-talk',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}},calls=0;
 const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>normalizeGameSession(sorted(structuredClone(saved))),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s));},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const fallback=createNpcDialogueGenerator(undefined,()=>false);
 const service=new GameService(repo,undefined,undefined,undefined,async input=>{calls++;return fallback(input)},async c=>fallbackNarration(c));
 let snap=await service.getState(saved.id);
 assert(!rows(snap).some(row=>row.action.type==='npc_dialogue'));
 await assert.rejects(()=>service.performAction(saved.id,{type:'npc_dialogue',command:'start',npcId:'shumi'}),/현재 위치|대합실/);
 const approach=rows(snap).find(row=>row.action.optionId==='focus:shumi_presence');assert(approach);
 snap=await service.performAction(saved.id,approach.action);
 const talk=snap.availableActions.find(row=>row.action.type==='npc_dialogue'&&row.action.command==='start');assert(talk);
 const before=saved.state.textWorld.entities.crate.components.openable.isOpen,revision=saved.state.textWorld.revision;
 snap=await service.performAction(saved.id,talk.action);assert.equal(calls,1);assert.match(snap.currentScene.id,/npc-dialogue/);assert.equal(snap.exploration,null);
 snap=await service.performAction(saved.id,{type:'npc_dialogue',command:'leave',npcId:'shumi'});
 assert.equal(calls,1);assert(snap.exploration);assert.equal(saved.state.textWorld.player.zone,'office');assert.equal(saved.state.textWorld.entities.crate.components.openable.isOpen,before);
 assert(saved.state.textWorld.revision>revision);assert.match(snap.currentScene.paragraphs.join(' '),/대화|말|인사|관심|주변/);
 const leave=rows(snap).find(row=>row.action.optionId==='leave');assert(leave);
 snap=await service.performAction(saved.id,leave.action);
 assert(!snap.availableActions.some(row=>row.action.type==='npc_dialogue'),'the resident inside the office cannot also appear in the concourse');
 await assert.rejects(()=>service.performAction(saved.id,{type:'npc_dialogue',command:'start',npcId:'shumi'}),/현재 위치/);
 assert.equal(calls,1);
});