const test=require('node:test'),assert=require('node:assert/strict');
const {GameService}=require('../.server-dist/game/service');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {createNpcDialogueGenerator}=require('../.server-dist/game/npc-dialogue-pipeline');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {carriedByPlayer}=require('../.server-dist/game/text-world/spatial');
const rows=s=>[...s.availableActions,...(s.exploration?.generalActions??[]),...(s.exploration?.targets??[]).flatMap(t=>t.actions)];
function sorted(v){return Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,sorted(v[k])])):v;}

test('one fresh journey keeps NPC memory, traded stock, shelter materials and a crafted tool across region travel and JSONB-style restores',async t=>{
 t.mock.method(global,'fetch',async()=>{throw Error('External generation disabled for integrated journey')});
 let saved,steps=0,worldCalls=0,npcCalls=0;const npcInputs=[];
 const repo={withGameLock:async(_id,fn)=>fn(),loadGame:async()=>normalizeGameSession(sorted(structuredClone(saved))),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s))},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const npcFallback=createNpcDialogueGenerator(undefined,()=>false);
 const service=new GameService(repo,undefined,undefined,undefined,async input=>{npcCalls++;npcInputs.push(input);return npcFallback(input)},async c=>{worldCalls++;return fallbackNarration(c)});
 let snap=await service.createGame();
 async function choose(id){
  const row=rows(snap).find(r=>[r.id,r.action.optionId,r.action.actionId,r.action.choiceId].includes(id));
  const action=row?.action??(id.startsWith('travel:')?{type:'travel',targetId:id.slice(7)}:undefined);
  assert(action,'Not offered '+id+'; '+rows(snap).map(r=>r.action.optionId||r.id));
  if(row)assert(row.isAvailable);
  const requestId='journey-'+(++steps);snap=await service.performAction(saved.id,action,{requestId});
  assert(!snap.state.isGameOver,'Survival ended at '+id);
  if(snap.exploration)assert(snap.availableActions.length<=5);
  return {action,requestId};
 }
 async function social(command){const row=snap.availableActions.find(r=>r.action.command===command);assert(row,command);return choose(row.id);}
 for(const id of ['opening_commit','travel:convenience','explore:convenience_supply_pile','collect:convenience_supply_pile','explore:convenience_shelf','collect:convenience_shelf','travel:subway','travel:office','explore:crate','collect:crate','push:crate:door:beside','leave','focus:shumi_presence','npc-dialogue:shumi:start'])await choose(id);
 assert(npcInputs[0].memory.observations.some(o=>o.sense==='heard'&&!o.actorKnown));
 await social('give');await social('give');await social('trade');await social('leave');
 assert.equal(saved.state.npcDialogue.conversations.shumi.inventory.radioBattery,0);assert.equal(snap.state.inventory.radioBattery,1);
 const memoryAfterTrade=structuredClone(saved.state.npcDialogue.conversations.shumi.observations);
 for(const id of ['travel:shelter','text-world:shelter:enter','focus:shelter_workbench','repair:shelter_workbench','explore:shelter_storage'])await choose(id);
 const storedBefore={};
 for(const itemId of ['scrapMetal','clothScrap','cordage']){
  const world=saved.state.locationTextWorlds.shelter,entity=Object.values(world.entities).find(e=>e.components.portable?.itemId===itemId&&carriedByPlayer(world,e));assert(entity);
  storedBefore[itemId]=snap.state.inventory[itemId];await choose('hold:'+entity.id);
  const put=rows(snap).find(r=>r.action.optionId?.startsWith('put:')&&r.action.optionId.includes('shelter_storage'));assert(put);await choose(put.action.optionId);
 }
 await choose('leave');await choose('open_shelter_crafting');
 const craft=await choose('craft_utility_knife');assert.equal(snap.state.lastActivity.plannedMinutes,16);
 const paid={...snap.state.lastActivity.storedConsumedItems};assert.deepEqual(paid,{scrapMetal:1,clothScrap:1,cordage:1});
 await assert.rejects(()=>service.performAction(saved.id,craft.action,{requestId:'old-work'}),/바뀌|작업 상황|지난/);
 await choose('leave_shelter_crafting');await choose('travel:forest');
 const registry=buildRuntimeRegistry(saved.state),method=registry.actions.cut_vines_with_utility_knife;
 const site=Object.values(saved.state.locationTextWorlds.forest.entities).find(e=>e.components.resourceSite?.siteId===method.resourceUse.siteId);assert(site);
 if(saved.state.locationTextWorlds.forest.player.zone!==site.components.position.zone)await choose('travel:'+site.components.position.zone);
 if(!rows(snap).some(r=>r.action.optionId?.endsWith(method.id)))await choose('inspect:'+site.id);
 const cut=rows(snap).find(r=>r.action.optionId?.endsWith(method.id));assert(cut);await choose(cut.action.optionId);
 assert.equal(snap.state.toolDurability.utilityKnife,9);assert(snap.state.inventory.cordage>=4);
 await choose('travel:shelter');await choose('text-world:shelter:enter');
 const shelf=saved.state.locationTextWorlds.shelter,knife=Object.values(shelf.entities).find(e=>e.components.portable?.itemId==='utilityKnife'&&carriedByPlayer(shelf,e));assert.equal(knife.toolDurability,9);
 await choose('hold:'+knife.id);const putKnife=rows(snap).find(r=>r.action.optionId?.startsWith('put:')&&r.action.optionId.includes('shelter_storage'));assert(putKnife);await choose(putKnife.action.optionId);
 assert.equal(saved.state.locationTextWorlds.shelter.entities[knife.id].toolDurability,9);assert.equal(snap.state.inventory.utilityKnife??0,0);assert(!snap.state.systemNote.includes('파손'));
 await choose('leave');await choose('travel:subway');await choose('focus:shumi_presence');await choose('npc-dialogue:shumi:start');
 assert.deepEqual(saved.state.npcDialogue.conversations.shumi.observations,memoryAfterTrade);assert.equal(saved.state.npcDialogue.conversations.shumi.inventory.radioBattery,0);
 assert(!snap.availableActions.some(r=>r.action.command==='trade'));await social('leave');
 await choose('travel:shelter');await choose('text-world:shelter:enter');
 const cupboard=saved.state.locationTextWorlds.shelter;
 for(const itemId of Object.keys(storedBefore))assert.equal(Object.values(cupboard.entities).filter(e=>e.components.portable?.itemId===itemId&&e.components.position.zone==='shelter_storage').reduce((n,e)=>n+e.components.portable.amount,0),storedBefore[itemId]-paid[itemId]);
 await choose('collect:shelter_storage');assert.equal(snap.state.inventory.utilityKnife,1);assert.equal(snap.state.toolDurability.utilityKnife,9);assert.equal(snap.state.inventory.radioBattery,1);
 const stable=structuredClone({inventory:snap.state.inventory,clock:snap.state.worldElapsedMs}),calls={worldCalls,npcCalls};
 snap=await service.getState(saved.id);assert.deepEqual({inventory:snap.state.inventory,clock:snap.state.worldElapsedMs},stable);assert.deepEqual({worldCalls,npcCalls},calls);
 assert.deepEqual(saved.state.textWorld.entities.crate.components.position,{zone:'office',relativeTo:'door',relation:'beside'});
 t.diagnostic('Completed '+steps+' offered actions; no injected resources/time, '+npcCalls+' mocked NPC renders, polling generated no new text.');
});
