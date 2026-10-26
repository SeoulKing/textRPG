const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState}=require('../.server-dist/game/rules');
const {GameService}=require('../.server-dist/game/service');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {worldRegistry,validateRegistry}=require('../.server-dist/game/data/registry');
const {questProgressFields,withQuestGuidanceDefaults}=require('../.server-dist/game/quest-guidance');
const {getStockStateKey}=require('../.server-dist/game/state-utils');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
process.env.ENABLE_LLM_WORLD_PLANNER='false';process.env.ENABLE_LLM_BACKGROUND_GENERATION='false';
let requests=0;test.beforeEach(t=>{requests=0;t.mock.method(global,'fetch',async()=>{requests++;throw Error('No external requests in quest guide tests')})});test.afterEach(()=>assert.equal(requests,0));
const progress=(s,id='first_canned_food',r=buildRuntimeRegistry(s))=>questProgressFields(s,r.quests[id],r,['shelter_crafting_menu','shelter_cooking_menu']);
function active(){const s=createInitialGameState();s.flags.rescue_goal_accepted=true;s.flags.first_canned_food_started=true;s.quests.first_canned_food='active';s.quests.prepare_rescue_signal='active';return s}
function fixture(){let stored;const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>structuredClone(stored),saveGame:async s=>{stored=JSON.parse(JSON.stringify(s));stored.state=GameStateSchema.parse(stored.state)},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};return {service:new GameService(repo,undefined,undefined,undefined,undefined,async c=>fallbackNarration(c)),get stored(){return stored}};}

test('quest guidance distinguishes collecting, delivering and completion without running an action',()=>{
 const s=active();let p=progress(s);assert.match(p.nextStep,/진열대/);assert.deepEqual(p.requirements.map(r=>[r.itemId,r.amount,r.met]),[['cannedFood',3,false]]);assert.deepEqual(p.requirements[0].sourceHints,[]);
 s.inventory.cannedFood=3;const before=JSON.stringify(s);p=progress(s);assert.match(p.nextStep,/급식소.*건넨다/);assert(!p.nextStep.includes('전달이 끝났다'));assert.equal(JSON.stringify(s),before);
 s.quests.first_canned_food='completed';delete s.inventory.cannedFood;p=progress(s);assert.equal(p.nextStep,undefined);assert(p.requirements.every(r=>r.met&&r.sourceHints.length===0));
 s.quests.first_canned_food='inactive';assert.equal(progress(s).nextStep,undefined);
});

test('a fresh player can follow the displayed clue, collect cans and deliver them through offered actions',async()=>{
 const f=fixture();let snap=await f.service.createGame();const choose=async(id)=>{const row=snap.availableActions.find(c=>[c.id,c.action.choiceId,c.action.actionId,c.action.optionId].includes(id)&&c.isAvailable);assert(row,'Missing '+id+' in '+snap.availableActions.map(c=>c.action.optionId||c.id));snap=await f.service.performAction(snap.gameId,row.action)};
 await choose('opening_commit');await choose('accept_first_canned_food_quest');assert.match(snap.quests.find(q=>q.id==='first_canned_food').nextStep,/진열대/);
 snap=await f.service.performAction(snap.gameId,{type:'travel',targetId:'convenience'});
 for(let n=0;n<5&&(snap.state.inventory.cannedFood??0)<3;n++){
  const row=snap.availableActions.find(c=>c.isAvailable&&c.action.optionId?.includes('convenience_shelf'));assert(row,'Clued shelf cannot be selected: '+snap.availableActions.map(c=>c.action.optionId));await choose(row.id);
 }
 assert.equal(snap.state.inventory.cannedFood,3);assert.equal(snap.quests.find(q=>q.id==='first_canned_food').status,'active');assert.match(snap.quests.find(q=>q.id==='first_canned_food').nextStep,/급식소.*건넨다/);
 snap=await f.service.performAction(snap.gameId,{type:'travel',targetId:'kitchen'});await choose('deliver_canned_food_to_old_cook');const quest=snap.quests.find(q=>q.id==='first_canned_food');assert.equal(quest.status,'completed');assert.equal(quest.nextStep,undefined);assert.equal(snap.state.inventory.cannedFood,1);
 const inventory=structuredClone(snap.state.inventory),time=snap.state.worldElapsedMs;snap=await f.service.getState(snap.gameId);assert.deepEqual(snap.state.inventory,inventory);assert.equal(snap.state.worldElapsedMs,time);assert(snap.quests.find(q=>q.id==='first_canned_food').requirements.every(r=>r.met));
});

test('source hints require disclosed stock and remain accurate after collection and use',()=>{
 const s=active();s.flags.visited_hospital=true;let p=progress(s,'prepare_rescue_signal');assert.deepEqual(p.requirements.find(r=>r.itemId==='radioBattery').sourceHints,[]);
 s.discoveredStockNodeIds.push('hospital_medicine_cabinet');p=progress(s,'prepare_rescue_signal');assert.match(p.requirements.find(r=>r.itemId==='radioBattery').sourceHints[0],/병원.*1개 남음/);
 s.stockState[getStockStateKey('hospital','hospital_medicine_cabinet','radioBattery')]=0;p=progress(s,'prepare_rescue_signal');assert.match(p.requirements.find(r=>r.itemId==='radioBattery').sourceHints[0],/수집 완료/);
 s.inventory.radioBattery=1;assert.deepEqual(progress(s,'prepare_rescue_signal').requirements.find(r=>r.itemId==='radioBattery').sourceHints,[]);
});

test('bound quest counts follow edited recipe costs including duplicate inputs and tools',()=>{
 const s=active(),r=structuredClone(worldRegistry),recipe=r.choices.assemble_rescue_radio;
 recipe.conditions=recipe.conditions.filter(c=>c.type!=='has_item');recipe.effects=[{type:'remove_item',itemId:'wood',amount:2},{type:'remove_item',itemId:'wood',amount:3},{type:'damage_tool',itemId:'utilityKnife',amount:1},{type:'set_flag',flag:'rescue_signal_ready'},{type:'advance_time',minutes:20}];
 let p=progress(s,'prepare_rescue_signal',r);assert.deepEqual(new Map(p.requirements.map(v=>[v.itemId,v.amount])),new Map([['wood',5],['utilityKnife',1]]));assert(!p.requirements.some(v=>v.itemId==='radioBattery'));
 s.inventory.wood=5;s.inventory.utilityKnife=1;s.toolDurability.utilityKnife=0;p=progress(s,'prepare_rescue_signal',r);assert(p.requirements.every(v=>v.met));assert.match(p.nextStep,/도구.*조건/);
 s.toolDurability.utilityKnife=1;assert.match(progress(s,'prepare_rescue_signal',r).nextStep,/제작 메뉴.*조립/);
});

test('native guidance migrates only absent metadata and preserves explicit opt-outs and changed quests',()=>{
 const old=structuredClone(worldRegistry);delete old.quests.prepare_rescue_signal.guidance;old.quests.prepare_rescue_signal.title='수정한 제목';old.quests.first_canned_food.guidance=null;
 const upgraded=withQuestGuidanceDefaults(old,worldRegistry);assert(upgraded.quests.prepare_rescue_signal.guidance);assert.equal(upgraded.quests.prepare_rescue_signal.title,'수정한 제목');assert.equal(upgraded.quests.first_canned_food.guidance,null);assert.equal(old.quests.prepare_rescue_signal.guidance,undefined);
 old.quests.prepare_rescue_signal.objectives=[{type:'flag',flag:'custom_goal'}];assert.equal(withQuestGuidanceDefaults(old,worldRegistry).quests.prepare_rescue_signal.guidance,undefined);
});

test('arbitrary quests use their authored completion reference and invalid cross-location references are rejected',()=>{
 const s=active(),r=structuredClone(worldRegistry);r.quests.writers_quest={...structuredClone(r.quests.first_canned_food),id:'writers_quest',title:'다른 부탁',guidance:{gathering:'필요한 물자를 찾는다.',ready:'목적지에서 전달한다.',completion:{kind:'action',id:'deliver_canned_food_to_old_cook',locationId:'kitchen'}}};s.quests.writers_quest='active';assert.match(progress(s,'writers_quest',r).nextStep,/물자/);validateRegistry(r);
 r.quests.writers_quest.guidance.completion.locationId='hospital';assert.throws(()=>validateRegistry(r),/another location/);r.quests.writers_quest.guidance.completion.id='missing';assert.throws(()=>validateRegistry(r),/unknown completion/);
});
