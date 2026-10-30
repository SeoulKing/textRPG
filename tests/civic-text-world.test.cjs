const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState,performAction}=require('../.server-dist/game/rules');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {getStockStateKey}=require('../.server-dist/game/state-utils');
const {ensureLocationWorld,availableLocationWorldOptions,locationWorldOptions,performLocationWorldAction}=require('../.server-dist/game/text-world/location-world');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {withDefaultCivicRooms,withCivicDocumentDefaults}=require('../.server-dist/game/text-world/civic-definitions');
const {worldRegistry,validateRegistry}=require('../.server-dist/game/data/registry');
test.beforeEach(t=>t.mock.method(global,'fetch',async()=>{throw Error('External requests disabled in civic tests')}));
async function fixture(location,setup=()=>{}){
 let state=createInitialGameState();state.location=location;state.sceneId=location+'_repeat_intro';state.flags.opening_seen=true;state.stats={hp:9,mind:8,energy:15};state.money=7000;setup(state);
 const contexts=[],n=async c=>{contexts.push(c);return fallbackNarration(c)};
 const f={get state(){return state},contexts,get registry(){return buildRuntimeRegistry(state)},get world(){return state.locationTextWorlds[location]},
 get options(){return availableLocationWorldOptions(state,f.registry)},get recommended(){return locationWorldOptions(state,f.registry)},
 async ensure(){await ensureLocationWorld(state,f.registry,n,'civic-test')},
 async choose(id){assert(f.options.some(o=>o.id===id),'missing '+id+'; '+f.options.map(o=>o.id));const a={type:'text_world',command:'choose',optionId:id,revision:f.world.revision};await f.raw(a);return a;},
 async raw(action){await performLocationWorldAction(state,action,f.registry,n,'civic-test')},
 reload(){state=GameStateSchema.parse(JSON.parse(JSON.stringify(state)))}};await f.ensure();return f;
}
for(const location of ['kitchen','checkpoint'])test(location+' entry is spatial, hides stock, and uses ordinary direct intentions',async()=>{
 const f=await fixture(location),c=JSON.stringify(f.contexts[0]);assert(f.recommended.length>=3&&f.recommended.length<=5);assert.match(c,/정면/);
 for(const node of f.registry.locations[location].stockNodes)for(const item of node.items)assert(!c.includes('"'+item.itemId+'"'),'entry leaked '+item.itemId);
 assert(!f.options.some(o=>o.stockChoiceIds));if(location!=='kitchen')assert(!f.options.some(o=>o.contentActionId));
 if(location==='kitchen')assert(f.recommended.some(o=>o.targetId==='kitchen_serving_counter'),'the main food counter must be a visible entry choice');
 const host=location==='kitchen'?'kitchen_ingredient_crate':'checkpoint_radio_truck',inventory=structuredClone(f.state.inventory);
 await f.choose('explore:'+host);assert.deepEqual(f.state.inventory,inventory);assert(f.options.some(o=>o.id==='collect:'+host));assert(f.contexts.at(-1).requiredFacts.some(f=>f.kind==='contents'));
 assert.equal(f.contexts.length,2);
});
for(const [location,host]of [['kitchen','kitchen_scrap_heap'],['kitchen','kitchen_ingredient_crate'],['checkpoint','checkpoint_radio_truck']])test(host+' batch preserves native costs, partial saved stocks and one narration',async()=>{
 const f=await fixture(location);await f.choose('explore:'+host);const option=f.options.find(o=>o.id==='collect:'+host),reference=structuredClone(f.state);
 reference.activeStockNodeId=host;for(const id of option.stockChoiceIds)performAction(reference,{type:'content_choice',choiceId:id});
 const beforeCalls=f.contexts.length,action=await f.choose(option.id);assert.deepEqual(f.state.inventory,reference.inventory);assert.deepEqual(f.state.stockState,reference.stockState);assert.deepEqual(f.state.stats,reference.stats);assert.deepEqual(f.state.skillProgress,reference.skillProgress);assert.equal(f.state.worldElapsedMs,reference.worldElapsedMs);assert.equal(f.contexts.length,beforeCalls+1);
 const after=JSON.stringify(f.state);await assert.rejects(f.raw(action),/바뀌/);assert.equal(JSON.stringify(f.state),after);f.reload();await f.ensure();assert.deepEqual(f.state,JSON.parse(after));assert(!f.options.some(o=>o.id===option.id));
 assert.equal(f.world.entities[host].components.position.zone,host==='kitchen_scrap_heap'?'depleted':f.world.player.zone);
});

test('food purchase, ration exchange and wages use native payment rules, with one trade family shown',async()=>{
 const f=await fixture('kitchen',s=>s.inventory.rationTicket=1);await f.choose('inspect:kitchen_serving_counter');
 assert(f.options.some(o=>o.id==='trade:buy_meal_at_kitchen'));assert(!f.options.some(o=>o.id==='trade:buy_crowded_meal_at_kitchen'));assert.equal(f.recommended.filter(o=>o.family==='TRADE').length,1);
 for(const id of ['exchange_ration_ticket_at_kitchen','buy_meal_at_kitchen','help_kitchen_queue']){
  const reference=structuredClone(f.state);performAction(reference,{type:'content_action',actionId:id});await f.choose((id==='help_kitchen_queue'?'work:':'trade:')+id);
  assert.deepEqual(f.state.inventory,reference.inventory);assert.equal(f.state.money,reference.money);assert.equal(f.state.worldElapsedMs,reference.worldElapsedMs);
 }
 assert(!f.options.some(o=>o.id==='trade:exchange_ration_ticket_at_kitchen'));f.state.money=0;assert(!f.options.some(o=>o.id.startsWith('trade:')));
 f.state.day=2;f.state.money=6000;assert(f.options.some(o=>o.id==='trade:buy_crowded_meal_at_kitchen'));assert(!f.options.some(o=>o.id==='trade:buy_meal_at_kitchen'));
});

test('delivering three cans preserves the existing quest reward and cannot repeat',async()=>{
 const f=await fixture('kitchen',s=>{s.inventory.cannedFood=3;s.quests.first_canned_food='active';});await f.choose('inspect:kitchen_old_cook');
 const reference=structuredClone(f.state);performAction(reference,{type:'content_action',actionId:'deliver_canned_food_to_old_cook'});
 await f.choose('delivery:deliver_canned_food_to_old_cook');assert.deepEqual(f.state.inventory,reference.inventory);assert.deepEqual(f.state.quests,reference.quests);assert(f.state.flags.first_canned_food_delivered);assert(!f.options.some(o=>o.id.startsWith('delivery:')));
 assert.match(f.world.lastParagraphs.join(' '),/노파/);assert(f.world.lastParagraphs.some(p=>p.includes('하나')));
});

test('radio records reveal their finding only after the information action and remain complete on reload',async()=>{
 const f=await fixture('checkpoint');await f.choose('inspect:checkpoint_radio_records');assert(!f.state.flags.rescue_frequency_confirmed);
 const reference=structuredClone(f.state);performAction(reference,{type:'content_action',actionId:'monitor_rescue_frequency'});await f.choose('information:monitor_rescue_frequency');
 assert.equal(f.state.stats.mind,reference.stats.mind);assert.equal(f.state.worldElapsedMs,reference.worldElapsedMs);assert.match(f.world.lastParagraphs.join(' '),/10일차/);f.reload();assert(!f.options.some(o=>o.id.startsWith('information:')));
});
for(const roll of [.1,.45,.7,.95])test('checkpoint patrol preserves only the actual random reward or injury '+roll,async t=>{
 t.mock.method(Math,'random',()=>roll);const f=await fixture('checkpoint');await f.choose('inspect:checkpoint_perimeter');const reference=structuredClone(f.state);
 performAction(reference,{type:'content_action',actionId:'patrol_checkpoint_perimeter'});await f.choose('work:patrol_checkpoint_perimeter');
 assert.deepEqual(f.state.inventory,reference.inventory);assert.deepEqual(f.state.stats,reference.stats);assert.equal(f.state.worldElapsedMs,reference.worldElapsedMs);assert.deepEqual(f.state.skillProgress,reference.skillProgress);
 const event=f.world.events.find(e=>e.type==='SERVICE');assert(event);assert.equal(event.after.rewards.length,roll>.8?0:1);assert(event.after.paragraphs.length>=1);
});

test('an interrupted service spends elapsed time but cannot award unperformed wages',async()=>{
 const f=await fixture('kitchen');await f.choose('inspect:kitchen_serving_counter');
 const {EXHAUSTION_TICK_MS,GAME_MINUTE_MS}=require('../.server-dist/game/base-data');f.state.stats.energy=0;f.state.exhaustionLevel=3;f.state.exhaustionElapsedMs=EXHAUSTION_TICK_MS-30*GAME_MINUTE_MS;
 const before=f.state.money;await f.choose('work:help_kitchen_queue');assert(f.state.isGameOver);assert.equal(f.state.money,before);assert(f.world.events.some(e=>e.type==='STOPPED'));assert(!f.world.lastParagraphs.join(' ').includes('품삯으로 6,000'));
});
for(const [location,host,item]of [['kitchen','kitchen_ingredient_crate','rice'],['checkpoint','checkpoint_radio_truck','radioTransmitter']])test(host+' restores legacy focus without recreating collected items',async()=>{
 const f=await fixture(location,s=>{s.discoveredStockNodeIds.push(host);s.activeStockNodeId=host;s.stockState[getStockStateKey(location,host,item)]=0;s.inventory[item]=1;});
 assert.equal(f.world.player.near,host);assert(f.world.observations[host].stages.includes('interior'));await f.choose('collect:'+host);assert.equal(f.state.inventory[item],1);
});

test('published replacements win and deleted native bindings do not reappear',()=>{
 const base=buildRuntimeRegistry();validateRegistry(base);
 const portable=structuredClone(base);portable.textRooms.find(r=>r.id==='kitchen_serving').entities.find(e=>e.id==='kitchen_ingredient_crate').components.portable={itemId:'scrapMetal',amount:1};assert.throws(()=>validateRegistry(portable),/휴대할 수 없는 보관함/);
 const custom=structuredClone(base);const kitchen=custom.textRooms.find(r=>r.locationId==='kitchen');kitchen.id='authored_kitchen';
 assert.equal(withDefaultCivicRooms(custom).textRooms.filter(r=>r.locationId==='kitchen').length,1);
 const removed=structuredClone(base);removed.textRooms=removed.textRooms.filter(r=>!['kitchen','checkpoint'].includes(r.locationId));delete removed.actions.buy_meal_at_kitchen;
 removed.locations.kitchen.stockNodes=removed.locations.kitchen.stockNodes.filter(n=>n.id!=='kitchen_scrap_heap');
 const result=withDefaultCivicRooms(removed);assert(!result.textRooms.flatMap(r=>r.entities).some(e=>e.id==='kitchen_scrap_heap'));assert(!result.textRooms.flatMap(r=>r.entities).flatMap(e=>e.components.interactionPoint?.actions??[]).some(a=>a.actionId==='buy_meal_at_kitchen'));
});

test('Studio publication preserves edited civic layouts, quantities and service roles',()=>{
 const {parseContentStudioDocument}=require('../.server-dist/game/content-studio');
 const {getEffectiveContentStudioDocument,prepareContentStudioDocument}=require('../.server-dist/game/data/registry');
 const {registerContentVersion,versionRegistry}=require('../.server-dist/game/content-versions');
 const doc=getEffectiveContentStudioDocument(parseContentStudioDocument({version:2}));
 const room=doc.textRooms.find(r=>r.id==='kitchen_serving');room.layout='편집한 배식대는 왼쪽 벽을 따른다.';
 const node=doc.locations.find(l=>l.id==='kitchen').stockNodes.find(n=>n.id==='kitchen_ingredient_crate');node.items[0].initialQuantity=7;
 const registry=prepareContentStudioDocument(JSON.parse(JSON.stringify(doc))).registry,id=registerContentVersion(registry),state=createInitialGameState();state.contentVersionId=id;
 const runtime=buildRuntimeRegistry(state);assert.equal(runtime.textRooms.find(r=>r.id===room.id).layout,room.layout);assert.equal(runtime.locations.kitchen.stockNodes.find(n=>n.id===node.id).items[0].initialQuantity,7);
 assert(runtime.textRooms.find(r=>r.id===room.id).entities.find(e=>e.id==='kitchen_serving_counter').components.interactionPoint.actions.some(a=>a.role==='trade'));
 assert.deepEqual(versionRegistry(id),registry,'normalizing a runtime does not rewrite an archived publication');
});

test('the service offers the real kitchen NPC at reach, preserves the place after conversation and rejects legacy service bypasses',async t=>{
 const {GameService}=require('../.server-dist/game/service'),{normalizeGameSession}=require('../.server-dist/game/repository'),{createNpcDialogueGenerator}=require('../.server-dist/game/npc-dialogue-pipeline');
 const state=createInitialGameState();state.location='kitchen';state.sceneId='kitchen_repeat_intro';state.flags.opening_seen=true;state.flags.prologue_old_woman_seen=true;state.stats.energy=15;
 let saved={id:'kitchen-service',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}},npcCalls=0,renders=0;
 const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,sorted(v[k])])):v;
 const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>normalizeGameSession(sorted(structuredClone(saved))),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s))},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const generator=createNpcDialogueGenerator(async()=>{npcCalls++;throw Error('one simulated NPC response')},()=>true);
 const service=new GameService(repo,undefined,undefined,undefined,generator,async c=>{renders++;return fallbackNarration(c)});
 let snap=await service.getState(saved.id);const rows=()=>[...snap.availableActions,...(snap.exploration?.generalActions??[]),...(snap.exploration?.targets??[]).flatMap(t=>t.actions)];
 const choose=async id=>{const row=rows().find(r=>r.id===id||r.action.optionId===id||r.action.command===id);assert(row,'not offered '+id);snap=await service.performAction(saved.id,row.action);};
 assert(!rows().some(r=>r.action.type==='npc_dialogue'));await assert.rejects(service.performAction(saved.id,{type:'content_action',actionId:'buy_meal_at_kitchen'}),/선택|탐색/);
 await choose('inspect:kitchen_old_cook');const player=structuredClone(saved.state.locationTextWorlds.kitchen.player);assert(rows().some(r=>r.action.type==='npc_dialogue'));
 const rendered=renders;await choose('start');assert.equal(snap.exploration,null);await choose('leave');assert.deepEqual(saved.state.locationTextWorlds.kitchen.player,player);assert(snap.exploration);assert.equal(npcCalls,1);assert.equal(renders,rendered);
 const options=rows().map(r=>r.id);snap=await service.getState(saved.id);assert.deepEqual(rows().map(r=>r.id),options);assert.equal(npcCalls,1);assert.equal(renders,rendered);
});

test('public counter services are actionable on approach, while private records still require inspection',async()=>{
 const f=await fixture('kitchen');await f.choose('focus:kitchen_serving_counter');assert(!f.world.observations.kitchen_serving_counter.inspected);assert(f.options.some(o=>o.id==='trade:buy_meal_at_kitchen'));assert(f.recommended.some(o=>o.family==='TRADE'));
 const c=await fixture('checkpoint');await c.choose('focus:checkpoint_radio_records');assert(!c.options.some(o=>o.id==='information:monitor_rescue_frequency'));
});

test('moving the ingredient box preserves its stock and supports collecting, placing and reclaiming an owned object',async()=>{
 const f=await fixture('kitchen');await f.choose('explore:kitchen_ingredient_crate');const inventory=structuredClone(f.state.inventory);
 const push=f.options.find(o=>o.id==='push:kitchen_ingredient_crate:kitchen_serving_counter:beside');assert(push);await f.choose(push.id);assert.deepEqual(f.state.inventory,inventory);f.reload();await f.ensure();assert.equal(f.world.entities.kitchen_ingredient_crate.components.position.relativeTo,'kitchen_serving_counter');
 await f.choose('collect:kitchen_ingredient_crate');const water=f.state.inventory.waterBottle;
 const bottle=Object.values(f.world.entities).find(e=>e.inventoryRegistered&&e.components.portable?.itemId==='waterBottle');assert(bottle);await f.choose('hold:'+bottle.id);
 const put=f.options.find(o=>o.actions?.some(a=>a.type==='PUT'&&a.destination==='kitchen_serving_counter'&&a.relation==='on'));assert(put);await f.choose(put.id);assert.equal(f.state.inventory.waterBottle,water-1);
 const take=f.options.find(o=>o.actions?.some(a=>a.type==='TAKE'&&a.target===bottle.id));assert(take);await f.choose(take.id);assert.equal(f.state.inventory.waterBottle,water);
});
