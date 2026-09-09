const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState,performAction}=require('../.server-dist/game/rules');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {createSubwayTextWorld}=require('../.server-dist/game/text-world/world');
const {ensureSubwayStockWorld,performTextWorldAction,explorationInteractions}=require('../.server-dist/game/text-world');
const {availableLocationWorldOptions}=require('../.server-dist/game/text-world/location-world');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {withSubwayStockRooms}=require('../.server-dist/game/text-world/subway-stock');
const {getStockStateKey}=require('../.server-dist/game/state-utils');
test.beforeEach(t=>t.mock.method(global,'fetch',async()=>{throw Error('External requests disabled in subway stock tests')}));
function fixture(setup=()=>{}) {
 let state=createInitialGameState();Object.assign(state,{location:'subway',sceneId:'subway_repeat_intro'});state.flags.opening_seen=true;state.stats.energy=15;setup(state);
 const contexts=[],n=async c=>{contexts.push(c);return fallbackNarration(c)};
 const f={get state(){return state},contexts,get world(){return state.textWorld},get registry(){return buildRuntimeRegistry(state)},
 get options(){return availableLocationWorldOptions(state,f.registry)},ensure(){ensureSubwayStockWorld(state,f.registry)},
 async raw(a){return performTextWorldAction(state,a,'subway-stock',n,undefined,f.registry)},
 async enter(){return f.raw({type:'text_world',command:'enter'})},
 async choose(id){assert(f.options.some(o=>o.id===id),'not offered '+id);const a={type:'text_world',command:'choose',optionId:id,revision:f.world.revision};await f.raw(a);return a},
 reload(){state=GameStateSchema.parse(JSON.parse(JSON.stringify(state)))}};return f;
}
test('signal box discovery and collection remain separate and preserve every native cost exactly once',async()=>{
 const f=fixture();f.ensure();assert.equal(f.world,null);await f.enter();
 assert(!JSON.stringify(f.contexts[0]).includes('radioAntenna'));assert(!f.options.some(o=>o.id==='collect:subway_signal_box'));
 const before=structuredClone(f.state.inventory);await f.choose('explore:subway_signal_box');assert.deepEqual(f.state.inventory,before);
 const option=f.options.find(o=>o.id==='collect:subway_signal_box');assert(option);assert(f.state.discoveredStockNodeIds.includes('subway_signal_box'));
 const reference=structuredClone(f.state);require('../.server-dist/game/text-world/engine').resolveWorldActions(reference.textWorld,reference,option.preparation);reference.activeStockNodeId='subway_signal_box';for(const id of option.stockChoiceIds)performAction(reference,{type:'content_choice',choiceId:id});
 const calls=f.contexts.length,a=await f.choose(option.id);assert.equal(f.contexts.length,calls+1);
 for(const field of ['inventory','stats','stockState','skillProgress','worldElapsedMs'])assert.deepEqual(f.state[field],reference[field],field);
 const after=JSON.stringify(f.state);await assert.rejects(f.raw(a),/바뀌/);assert.equal(JSON.stringify(f.state),after);
 f.reload();f.ensure();assert(!f.options.some(o=>o.id===option.id));assert.equal(f.state.inventory.radioAntenna,1);
 await f.choose('leave');await f.choose('travel:office');assert(!f.options.some(o=>o.id===option.id));assert.equal(f.state.inventory.radioAntenna,1);
});
test('legacy partial stock resumes in the canonical office and polling never generates or replenishes',()=>{
 const f=fixture(s=>{s.activeStockNodeId='subway_signal_box';s.inventory.radioAntenna=1;s.stockState[getStockStateKey('subway','subway_signal_box','radioAntenna')]=0;});
 f.ensure();assert.equal(f.state.activeStockNodeId,null);assert.equal(f.world.player.near,'subway_signal_box');assert(f.world.observations.subway_signal_box.stages.includes('interior'));assert(f.options.some(o=>o.id==='collect:subway_signal_box'));assert.equal(f.contexts.length,0);
 assert(!f.world.entities['stock:subway_signal_box:radioAntenna']);const serialized=JSON.stringify(f.state);f.ensure();assert.equal(JSON.stringify(f.state),serialized);
 f.reload();f.ensure();assert.equal(f.state.inventory.radioAntenna,1);assert(!f.state.locationTextWorlds.subway);
});
test('adding a missing signal host keeps saved placement, doors and collected office loot',()=>{
 const f=fixture(s=>{s.textWorld=createSubwayTextWorld();s.textWorld.player.posture='crouching';s.textWorld.entities.crate.components.openable.isOpen=true;s.textWorld.revision=17;});
 const saved=structuredClone(f.world);f.ensure();assert.equal(f.world.revision,18);assert.deepEqual(f.world.player,saved.player);
 for(const [id,e]of Object.entries(saved.entities))assert.deepEqual(f.world.entities[id],e,id);
 assert(f.world.entities.subway_signal_box);f.ensure();assert.equal(f.world.revision,18);
});
test('authored stock bindings and removal override defaults without duplicating signal boxes',()=>{
 const registry=buildRuntimeRegistry();const custom=structuredClone(registry);const room=custom.textRooms.find(r=>r.id==='office');room.entities.find(e=>e.id==='subway_signal_box').id='custom_signal_box';
 const result=withSubwayStockRooms(custom);assert.equal(result.textRooms.flatMap(r=>r.entities).filter(e=>e.components.stockNode?.nodeId==='subway_signal_box').length,1);
 assert(result.textRooms.flatMap(r=>r.entities).some(e=>e.id==='custom_signal_box'));
 custom.locations.subway.stockNodes=[];custom.textRooms.forEach(r=>r.entities=r.entities.filter(e=>e.components.stockNode?.nodeId!=='subway_signal_box'));
 assert(!withSubwayStockRooms(custom).textRooms.flatMap(r=>r.entities).some(e=>e.id==='subway_signal_box'));
});
test('service hides and rejects legacy stock commands while concourse routes remain reachable',async()=>{
 const {GameService}=require('../.server-dist/game/service'),{normalizeGameSession}=require('../.server-dist/game/repository');
 const state=fixture().state;let saved={id:'subway-service',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}},renders=0;
 const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,sorted(v[k])])):v;
 const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>normalizeGameSession(sorted(structuredClone(saved))),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s))},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const service=new GameService(repo,undefined,undefined,undefined,undefined,async c=>{renders++;return fallbackNarration(c)});
 let snap=await service.getState(saved.id);assert(!snap.availableActions.some(c=>c.action.actionId==='go_to_subway_signal_box'));assert(snap.exploration.targets.some(t=>t.id==='subway_depth_stairs'));
 await assert.rejects(service.performAction(saved.id,{type:'content_action',actionId:'go_to_subway_signal_box'}),/표시된 선택/);
 const choose=async id=>{const rows=[...snap.availableActions,...(snap.exploration?.generalActions??[]),...(snap.exploration?.targets??[]).flatMap(t=>t.actions)];const row=rows.find(r=>r.action.optionId===id||r.action.command===id);assert(row,'missing '+id);snap=await service.performAction(saved.id,row.action);};
 await choose('travel:office');await choose('explore:subway_signal_box');await choose('collect:subway_signal_box');const count=renders,ids=snap.availableActions.map(c=>c.id);
 snap=await service.getState(saved.id);assert.deepEqual(snap.availableActions.map(c=>c.id),ids);assert.equal(renders,count);assert.equal(snap.state.inventory.radioAntenna,1);
 await choose('leave');assert(snap.exploration.targets.some(t=>t.id==='subway_depth_stairs'));await choose('focus:shumi_presence');assert(snap.availableActions.some(c=>c.action.type==='npc_dialogue'));
});
