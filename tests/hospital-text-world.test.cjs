const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState,performAction,advanceGameMinutes}=require('../.server-dist/game/rules');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {registerContentVersion}=require('../.server-dist/game/content-versions');
const {worldRegistry,validateRegistry}=require('../.server-dist/game/data/registry');
const {ensureLocationWorld,locationWorldOptions,performLocationWorldAction}=require('../.server-dist/game/text-world/location-world');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {textWorldActions}=require('../.server-dist/game/text-world');
const {getStockStateKey}=require('../.server-dist/game/state-utils');
const {GAME_MINUTE_MS}=require('../.server-dist/game/base-data');
test.beforeEach(t=>t.mock.method(global,'fetch',async()=>{throw Error('No external generation in hospital tests')}));
async function fixture(setup=()=>{}){
 let state=createInitialGameState();state.location='hospital';state.sceneId='hospital_repeat_intro';state.flags.opening_seen=true;state.stats={hp:7,mind:10,energy:15};state.money=5000;setup(state);
 const contexts=[],n=async c=>{contexts.push(c);return fallbackNarration(c)};
 const f={get state(){return state},contexts,get registry(){return buildRuntimeRegistry(state)},get world(){return state.locationTextWorlds[state.location]},get options(){return locationWorldOptions(state,f.registry)},
 async ensure(){await ensureLocationWorld(state,f.registry,n,'hospital-test')},
 async choose(id){assert(f.options.some(o=>o.id===id),'missing '+id+' in '+f.options.map(o=>o.id));await f.raw({type:'text_world',command:'choose',optionId:id,revision:f.world.revision})},
 async raw(a){await performLocationWorldAction(state,a,f.registry,n,'hospital-test')},
 reload(){state=GameStateSchema.parse(JSON.parse(JSON.stringify(state)))},
 async triage(){await f.choose('travel:hospital_triage');await f.choose('inspect:hospital_triage_table')}};
 await f.ensure();return f;
}
test('entry has fixed geometry; one intention opens stock without revealing or collecting it early',async()=>{
 const f=await fixture();const first=JSON.stringify(f.contexts[0]);
 assert.match(first,/왼쪽/);assert.match(first,/오른쪽/);assert.match(first,/접수대 뒤쪽 아래/);
 for(const name of ['painRelief','radioBattery','진통제','무전기 배터리'])assert(!first.includes(name));
 assert.equal(f.options.length,3);assert(!f.options.some(o=>o.stockChoiceIds||o.contentActionId));
 const inv=structuredClone(f.state.inventory);await f.choose('explore:hospital_cabinet');
 assert.deepEqual(f.state.inventory,inv);assert.equal(f.world.player.posture,'crouching');assert.equal(f.world.player.focusEntityId,'hospital_cabinet');
 assert(f.state.discoveredStockNodeIds.includes('hospital_medicine_cabinet'));
 const contents=f.contexts.at(-1).requiredFacts.find(f=>f.kind==='contents');assert.equal(contents.data.items.length,4);
 assert(f.options.some(o=>o.id==='collect:hospital_cabinet'));assert(!f.options.some(o=>o.id.startsWith('take:stock:')));
 assert.equal(f.contexts.length,2);assert.equal(f.world.lastParagraphs.length,2);
 assert(textWorldActions(f.state).every(o=>o.loading.durationMs>=500&&o.choiceThought&&!o.postChoiceNarrative));
});
test('batch collection preserves each native reward, skill-adjusted cost and one narration; retries cannot duplicate it',async()=>{
 const f=await fixture();await f.choose('explore:hospital_cabinet');const option=f.options.find(o=>o.stockChoiceIds);
 const reference=structuredClone(f.state);reference.activeStockNodeId='hospital_medicine_cabinet';
 for(const choiceId of option.stockChoiceIds)performAction(reference,{type:'content_choice',choiceId});
 const command={type:'text_world',command:'choose',optionId:option.id,revision:f.world.revision},calls=f.contexts.length;
 await f.raw(command);
 assert.deepEqual(f.state.inventory,reference.inventory);assert.deepEqual(f.state.stockState,reference.stockState);
 assert.equal(f.state.worldElapsedMs,reference.worldElapsedMs);assert.deepEqual(f.state.skillProgress,reference.skillProgress);
 assert.equal(f.contexts.length,calls+1);assert.equal(f.state.activeStockNodeId,null);
 assert.equal(f.state.inventory.painRelief,2);assert.equal(f.state.inventory.radioBattery,1);
 const copies=Object.values(f.world.entities).filter(e=>e.id.startsWith('stock-carry:'));assert.equal(copies.length,4);
 assert.match(f.world.lastParagraphs.join(' '),/안은 비어/);assert(!f.options.some(o=>o.stockChoiceIds));
 const saved=JSON.stringify(f.state);await assert.rejects(f.raw(command),/상황이 바뀌/);assert.equal(JSON.stringify(f.state),saved);
 f.reload();const list=f.options.map(o=>o.id);await f.ensure();assert.equal(f.contexts.length,calls+1);assert.deepEqual(f.options.map(o=>o.id),list);
 f.state.location='forest';await f.ensure();f.state.location='hospital';await f.ensure();
 assert.equal(f.state.inventory.painRelief,2);assert.equal(f.world.entities.hospital_cabinet.components.container.items.length,0);
 assert(!f.options.some(o=>o.stockChoiceIds));
});
test('legacy partial stock and its current focus migrate without resetting items or refilling on reload',async()=>{
 const f=await fixture(s=>{s.discoveredStockNodeIds=['hospital_medicine_cabinet'];s.activeStockNodeId='hospital_medicine_cabinet';
 s.stockState[getStockStateKey('hospital','hospital_medicine_cabinet','radioBattery')]=0;s.inventory.radioBattery=1});
 assert.equal(f.world.player.near,'hospital_cabinet');assert(f.world.entities.hospital_cabinet.components.openable.isOpen);
 assert(!f.options.find(o=>o.stockChoiceIds).label.includes('무전기'));
 const time=f.state.worldElapsedMs,calls=f.contexts.length;f.reload();await f.ensure();assert.equal(f.state.worldElapsedMs,time);assert.equal(f.contexts.length,calls);
 await f.choose('collect:hospital_cabinet');assert.equal(f.state.inventory.radioBattery,1);assert.equal(f.state.inventory.painRelief,2);
});
test('a blocked opening stops before discovery and cannot expose a collection option',async()=>{
 const f=await fixture();f.world.entities.hospital_cabinet.components.openable.locked=true;
 const snapshot=JSON.stringify(f.state.inventory);await f.choose('explore:hospital_cabinet');
 assert.equal(JSON.stringify(f.state.inventory),snapshot);assert(!f.state.discoveredStockNodeIds.includes('hospital_medicine_cabinet'));
 assert(!f.options.some(o=>o.stockChoiceIds));assert(f.contexts.at(-1).results.some(e=>e.type==='STOPPED'));
 assert(!JSON.stringify(f.contexts.at(-1).requiredFacts).includes('radioBattery'));
});
test('death during a batch keeps only completed pickups and never executes the remaining choices',async()=>{
 const f=await fixture();await f.choose('explore:hospital_cabinet');const first=f.options.find(o=>o.stockChoiceIds).stockChoiceIds[0];
 const firstItem=f.registry.choices[first].effects.find(e=>e.type==='collect_stock_item_all').itemId;
 f.state.stats.hp=1;f.state.conditions.injury={level:1,damageProgress:.99};await f.choose('collect:hospital_cabinet');
 assert(f.state.isGameOver);assert(f.state.inventory[firstItem]>0);
 const collected=f.contexts.at(-1).results.filter(e=>e.type==='TAKE');assert.equal(collected.length,1);assert.equal(collected[0].after.itemId,firstItem);
 assert(f.contexts.at(-1).results.some(e=>e.type==='STOPPED'));assert.equal(f.state.activeStockNodeId,null);
 for(const item of f.registry.locations.hospital.stockNodes[0].items.filter(i=>i.itemId!==firstItem))assert.equal(f.state.stockState[getStockStateKey('hospital','hospital_medicine_cabinet',item.itemId)]??item.initialQuantity,item.initialQuantity);
});
test('services require attention, preserve native payment and recovery, and disappear when unaffordable',async()=>{
 const f=await fixture();const snap=JSON.stringify(f.state);await assert.rejects(f.raw({type:'text_world',command:'choose',optionId:'care:receive_hospital_first_aid',revision:f.world.revision}),/선택할 수 없는/);assert.equal(JSON.stringify(f.state),snap);
 await f.triage();assert(f.options.some(o=>o.id==='work:help_hospital_triage'));assert(f.options.some(o=>o.id==='care:receive_hospital_first_aid'));
 const reference=structuredClone(f.state);performAction(reference,{type:'content_action',actionId:'receive_hospital_first_aid'});
 const count=f.contexts.length;await f.choose('care:receive_hospital_first_aid');
 assert.equal(f.contexts.length,count+1);assert.deepEqual(f.state.stats,reference.stats);assert.equal(f.state.money,reference.money);assert.equal(f.state.worldElapsedMs,reference.worldElapsedMs);
 const service=f.contexts.at(-1).results.find(e=>e.type==='SERVICE');assert.equal(service.after.moneyDelta,-1800);assert.equal(service.after.elapsedSeconds,900);
 assert.match(f.world.lastParagraphs.join(' '),/소독약과 붕대/);
 f.state.money=0;assert(!f.options.some(o=>o.id==='care:receive_hospital_first_aid'));
 await f.choose('defocus');assert(!f.options.some(o=>o.contentActionId));await f.choose('focus:hospital_triage_table');assert(f.options.some(o=>o.contentActionId));
});
for(const [roll,id,item]of [[.1,'hospital_triage_pain_relief','painRelief'],[.4,'hospital_triage_cloth','clothScrap'],[.7,'hospital_triage_cordage','cordage'],[.9,'hospital_triage_treatment',null]])test('triage preserves only the executed branch: '+id,async t=>{
 const f=await fixture();await f.triage();t.mock.method(Math,'random',()=>roll);
 const reference=structuredClone(f.state);performAction(reference,{type:'content_action',actionId:'help_hospital_triage'},{rng:()=>roll});
 const start=f.state.worldElapsedMs;await f.choose('work:help_hospital_triage');const service=f.contexts.at(-1).results.find(e=>e.type==='SERVICE');
 assert.equal(service.after.sceneId,id);assert.deepEqual(f.state.inventory,reference.inventory);assert.deepEqual(f.state.stats,reference.stats);
 assert.equal(f.state.worldElapsedMs-start,35*GAME_MINUTE_MS);assert.equal(service.after.rewards.length,item?1:0);
 if(item){assert.match(f.world.lastParagraphs.join(' '),/챙겨 둔다/);assert.equal(service.after.rewards[0].itemId,item);assert(Object.values(f.world.entities).some(e=>e.id.startsWith('received:')&&e.components.portable.itemId===item))}
 for(const other of ['hospital_triage_pain_relief','hospital_triage_cloth','hospital_triage_cordage','hospital_triage_treatment'].filter(s=>s!==id))assert(!JSON.stringify(service).includes(other));
 const rendered=f.world.lastParagraphs.join(' ');assert(!rendered.includes('당신은'));assert.equal(f.world.lastParagraphs.length,2);
 await f.choose('care:receive_hospital_first_aid');assert(!f.contexts.at(-1).results.some(e=>e.type==='SERVICE'&&e.after.sceneId===id));
});
test('an interrupted service has no unexecuted scene, item or treatment',async()=>{
 const f=await fixture();await f.triage();f.state.stats.hp=1;f.state.conditions.injury={level:1,damageProgress:.99};
 const inventory=structuredClone(f.state.inventory);await f.choose('work:help_hospital_triage');
 assert(f.state.isGameOver);assert.deepEqual(f.state.inventory,inventory);
 const e=f.contexts.at(-1).results.find(e=>e.type==='SERVICE');assert(e.after.interrupted);assert.equal(e.after.sceneId,undefined);assert.deepEqual(e.after.rewards,[]);assert.deepEqual(e.after.paragraphs,[]);
 assert.match(f.world.lastParagraphs.join(' '),/도중 멈춘다/);assert.deepEqual(f.options,[]);
});
test('authored stock and service IDs use the same adapter, and invalid cross-location bindings are rejected',async()=>{
 const registry=structuredClone(worldRegistry),room=registry.textRooms.find(r=>r.id==='hospital_reception');
 const cabinet=room.entities.find(e=>e.id==='hospital_cabinet');cabinet.id='supply_cabinet';cabinet.details.anchor=cabinet.id;
 registry.locations.hospital.stockNodes[0].id='medical_supply';
 cabinet.components.stockNode.nodeId='medical_supply';
 for(const c of Object.values(registry.choices))for(const field of ['conditions','effects'])for(const e of c[field])if(e.nodeId==='hospital_medicine_cabinet')e.nodeId='medical_supply';
 for(const scene of Object.values(registry.scenes))for(const condition of scene.conditions)if(condition.nodeId==='hospital_medicine_cabinet')condition.nodeId='medical_supply';
 const table=registry.textRooms.find(r=>r.id==='hospital_triage').entities[0],action=registry.actions.receive_hospital_first_aid;
 delete registry.actions.receive_hospital_first_aid;action.id='dress_wound';registry.actions[action.id]=action;table.components.interactionPoint.actions[0].actionId=action.id;
 registry.locations.hospital.interactionChoices=registry.locations.hospital.interactionChoices.filter(a=>a.id!=='go_to_hospital_medicine_cabinet'&&a.id!=='receive_hospital_first_aid'&&a.id!=='dress_wound').concat(action);
 const f=await fixture(s=>s.contentVersionId=registerContentVersion(registry));await f.choose('explore:supply_cabinet');await f.choose('collect:supply_cabinet');assert.equal(f.state.inventory.painRelief,2);
 await f.triage();await f.choose('care:dress_wound');assert.equal(f.state.money,3200);
 cabinet.components.stockNode.nodeId='missing';assert.throws(()=>validateRegistry(registry),/unavailable stock node/);
 cabinet.components.stockNode.nodeId='medical_supply';table.components.interactionPoint.actions[0].actionId='chop_wood_at_forest';assert.throws(()=>validateRegistry(registry),/unavailable interaction action/);
});


test('bound cash uses its finite ledger and a disappearing pile stays gone after serialization',async()=>{
 const registry=structuredClone(worldRegistry),node=registry.locations.hospital.stockNodes[0];
 node.money=275;node.depletionBehavior='disappear';
 const choice=structuredClone(registry.choices.collect_pain_relief_from_hospital);choice.id='collect_hospital_cash';choice.label='남은 돈을 챙긴다';
 choice.conditions=[{type:'active_stock_node',nodeId:node.id},{type:'stock_money_gte',locationId:'hospital',nodeId:node.id,amount:1}];
 choice.effects=[{type:'collect_stock_money_all',locationId:'hospital',nodeId:node.id}];registry.choices[choice.id]=choice;
 const f=await fixture(s=>s.contentVersionId=registerContentVersion(registry));const c=f.contexts[0];assert(!JSON.stringify({facts:[...c.requiredFacts,...c.optionalFacts,...c.knownFacts],choices:c.nextChoices.map(o=>({label:o.label,thought:o.defaultThought}))}).includes('275'));
 await f.choose('explore:hospital_cabinet');await f.choose('collect:hospital_cabinet');assert.equal(f.state.money,5275);
 assert.equal(f.world.entities.hospital_cabinet.components.position.zone,'depleted');assert(!f.options.some(o=>o.stockChoiceIds));
 f.reload();await f.ensure();assert.equal(f.state.money,5275);assert.equal(f.world.entities.hospital_cabinet.components.position.zone,'depleted');
});
test('Studio and version defaults retain authored bindings without overwriting custom rooms or opt-outs',()=>{
 const {parseContentStudioDocument}=require('../.server-dist/game/content-studio');
 const {getEffectiveContentStudioDocument,prepareContentStudioDocument}=require('../.server-dist/game/data/registry');
 const {withDefaultHospitalRooms}=require('../.server-dist/game/text-world/hospital-definitions');
 const document=getEffectiveContentStudioDocument(parseContentStudioDocument({version:2}));
 const room=document.textRooms.find(r=>r.id==='hospital_reception');room.layout='작성자가 바꾼 접수실 배치.';
 const roundTrip=prepareContentStudioDocument(JSON.parse(JSON.stringify(document))).registry;
 assert.equal(roundTrip.textRooms.find(r=>r.id===room.id).layout,room.layout);
 assert.equal(roundTrip.textRooms.find(r=>r.id===room.id).entities.find(e=>e.id==='hospital_cabinet').components.stockNode.nodeId,'hospital_medicine_cabinet');
 const point=roundTrip.textRooms.find(r=>r.id==='hospital_triage').entities[0].components.interactionPoint;assert.equal(point.actions.length,2);
 const custom={...worldRegistry,textRooms:[{...room,id:'custom_reception',entities:[]}]};assert.deepEqual(withDefaultHospitalRooms(custom).textRooms,custom.textRooms);
 assert.equal(withDefaultHospitalRooms({...worldRegistry,textRooms:undefined}).textRooms,undefined);
});
