const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState}=require('../.server-dist/game/rules');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {GameService}=require('../.server-dist/game/service');
const {createNpcDialogueGenerator}=require('../.server-dist/game/npc-dialogue-pipeline');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {directChoices,learnChoice}=require('../.server-dist/game/text-world/choice-director');
const {availableLocationWorldOptions,locationWorldOptions}=require('../.server-dist/game/text-world/location-world');
const {conversationOptions}=require('../.server-dist/game/text-world/conversation-options');
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,sorted(v[k])])):v;
test.beforeEach(t=>t.mock.method(global,'fetch',async()=>{throw Error('No external calls in recommendation tests')}));
function fixture(initial){
 let state=createInitialGameState();state.location='kitchen';state.sceneId='kitchen_repeat_intro';state.flags.opening_seen=true;state.money=7000;state.stats={hp:9,mind:8,energy:15};
 let saved=initial??{id:'recommendations',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}};
 let worldCalls=0,dialogueCalls=0,lastInput;
 const repo={withGameLock:async(_id,fn)=>fn(),loadGame:async()=>normalizeGameSession(sorted(structuredClone(saved))),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s))},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const fallback=createNpcDialogueGenerator(undefined,()=>false);
 const service=new GameService(repo,undefined,undefined,undefined,async input=>{dialogueCalls++;lastInput=input;return fallback(input)},async c=>{worldCalls++;return fallbackNarration(c)});
 return {service,get saved(){return structuredClone(saved)},get state(){return saved.state},get calls(){return {world:worldCalls,dialogue:dialogueCalls}},get input(){return lastInput},poll:()=>service.getState(saved.id),choose:(action,id)=>service.performAction(saved.id,action,id?{requestId:id}:undefined)};
}

test('arrival deliberately offers the cook, work, food and discovery, without inventory handling',async()=>{
 const f=fixture(),snap=await f.poll(),ids=snap.availableActions.map(o=>o.action.optionId);
 assert(ids.includes('talk:oldCook'));assert(ids.includes('work:help_kitchen_queue'));assert(ids.includes('trade:buy_meal_at_kitchen'));
 assert(ids.some(id=>id.startsWith('explore:')));assert(ids.length>=3&&ids.length<=5);assert(!ids.some(id=>/^(hold|stow|put|drop):/.test(id)));
 assert.equal(f.state.locationTextWorlds.kitchen.player.near,null);
 const unchanged=sorted([f.state.locationTextWorlds,f.state.choicePreferences,f.state.worldElapsedMs]);await f.poll();assert.deepEqual(sorted([f.state.locationTextWorlds,f.state.choicePreferences,f.state.worldElapsedMs]),unchanged);assert.deepEqual(f.calls,{world:1,dialogue:0});
});

test('one choice approaches the cook and starts one dialogue, with exact duplicate recovery',async()=>{
 const f=fixture(),snap=await f.poll(),talk=snap.availableActions.find(o=>o.action.optionId==='talk:oldCook');
 const before=f.state.worldElapsedMs;await f.choose(talk.action,'talk-once');
 assert.equal(f.state.npcDialogue.active.npcId,'oldCook');assert.equal(f.state.locationTextWorlds.kitchen.player.near,'kitchen_old_cook');
 assert(f.state.worldElapsedMs>before);assert.equal(f.input.context.actor.locationName,'급식소 · 배식 공간');assert.deepEqual(f.calls,{world:1,dialogue:1});
 assert.match(f.state.npcDialogue.active.currentScene.outcomeParagraph,/다가가 말을 건넨다/);assert(!f.state.npcDialogue.active.currentScene.situation.includes("다가가"));
 const saved=f.saved;await f.choose(talk.action,'talk-once');assert.deepEqual(f.saved,saved);assert.deepEqual(f.calls,{world:1,dialogue:1});
 await assert.rejects(f.choose(talk.action,'talk-stale'));assert.deepEqual(f.saved,saved);
});

test('every arrival recommendation executes through the actual service after reordered saves',async()=>{
 const base=fixture(),snap=await base.poll();
 for(const choice of snap.availableActions){const f=fixture(base.saved);await f.choose(choice.action,'available-'+choice.id);assert(f.state.worldElapsedMs>=base.state.worldElapsedMs);}
 const completed=base.saved;completed.state.inventory.cannedFood=3;completed.state.quests.first_canned_food='active';completed.state.flags.first_canned_food_started=true;
 const f=fixture(completed),quest=await f.poll(),delivery=quest.availableActions.find(o=>o.action.optionId==='delivery:deliver_canned_food_to_old_cook');assert(delivery);
 await f.choose(delivery.action,'delivery-once');assert(f.state.flags.first_canned_food_delivered);assert.equal(f.state.locationTextWorlds.kitchen.player.near,'kitchen_old_cook');
 const after=f.saved;await f.choose(delivery.action,'delivery-once');assert.deepEqual(f.saved,after);
});

test('unavailable conversation and unaffordable meals cannot enter recommendations or execute',async()=>{
 const base=fixture();await base.poll();const saved=base.saved;const w=saved.state.locationTextWorlds.kitchen;
 saved.state.money=0;saved.state.inventory.rationTicket=0;w.entities.kitchen_old_cook.components.position.zone='absent';
 const f=fixture(saved),snap=await f.poll();assert(!snap.availableActions.some(o=>o.action.optionId==='talk:oldCook'||o.action.optionId?.startsWith('trade:')));
 assert.equal(conversationOptions(f.state.locationTextWorlds.kitchen,f.state).length,0);
 const before=f.saved;await assert.rejects(f.choose({type:'text_world',command:'choose',optionId:'talk:oldCook',revision:w.revision}),/대화할 수 없/);assert.deepEqual(f.saved,before);
});

test('legacy civic saves gain direct services while an authored opt-out remains respected',async()=>{
 const base=fixture();await base.poll();const s=base.saved;delete s.state.locationTextWorlds.kitchen.entities.kitchen_serving_counter.components.interactionPoint.directFromEntry;
 const f=fixture(s);await f.poll();let options=availableLocationWorldOptions(f.state,buildRuntimeRegistry(f.state));assert(options.some(o=>o.id==='work:help_kitchen_queue'));
 const state=f.saved.state;state.locationTextWorlds.kitchen.entities.kitchen_serving_counter.components.interactionPoint.directFromEntry=false;
 options=availableLocationWorldOptions(state,buildRuntimeRegistry(state));assert(!options.some(o=>o.id==='work:help_kitchen_queue'));
});

test('successful selections strengthen a bounded preference within diverse context roles and survive JSONB',async()=>{
 const f=fixture();await f.poll();const state=f.saved.state,w=state.locationTextWorlds.kitchen;
 state.inventory.rationTicket=1;
 const candidates=availableLocationWorldOptions(state,buildRuntimeRegistry(state)),preferred=candidates.find(o=>o.id==='trade:exchange_ration_ticket_at_kitchen');assert(preferred);
 const initial=directChoices(w,state,candidates);assert(initial.some(o=>o.id==='trade:buy_meal_at_kitchen'));
 for(let i=0;i<10;i++){learnChoice(state,w,preferred);w.revision++;}
 const recommended=directChoices(w,state,candidates);assert(recommended.some(o=>o.id===preferred.id));assert(recommended.some(o=>o.family==='SOCIAL'));assert(recommended.some(o=>o.family==='WORK'));
 assert.equal(recommended.filter(o=>o.family==='TRADE').length,1);assert(Object.values(state.choicePreferences.scores).every(n=>n<=24));
 const session=f.saved;session.state=state;const restored=normalizeGameSession(sorted(session)).state;
 assert.deepEqual(restored.choicePreferences,state.choicePreferences);assert.deepEqual(locationWorldOptions(restored,buildRuntimeRegistry(restored)).map(o=>o.id),locationWorldOptions(state,buildRuntimeRegistry(state)).map(o=>o.id));
 const before=JSON.stringify(state.choicePreferences);for(let i=0;i<3;i++)directChoices(w,state,candidates);assert.equal(JSON.stringify(state.choicePreferences),before);
 learnChoice(state,w,preferred);const learned=JSON.stringify(state.choicePreferences);learnChoice(state,w,preferred);assert.equal(JSON.stringify(state.choicePreferences),learned);
});

test('preference never overrides a newly available key, immediate danger or low health',async()=>{
 const f=fixture();await f.poll();const s=f.saved.state,w=s.locationTextWorlds.kitchen;
 const choices=[{id:'work:test',label:'배식 일을 돕는다',hint:'작업',nodeId:'kitchen_serving_counter'},{id:'care:test',label:'상처를 치료한다',hint:'치료',need:'health'},{id:'unlock:test',label:'열쇠로 문을 연다',hint:'잠금 해제',actions:[{type:'UNLOCK',target:'test'}]}];
 for(let i=0;i<10;i++){learnChoice(s,w,choices[0]);w.revision++;}s.stats.hp=2;
 const recommended=directChoices(w,s,choices);assert(recommended.some(o=>o.id==='care:test'));assert(recommended.some(o=>o.id==='unlock:test'));
 w.entities.enemy={id:'enemy',name:'위협',description:'위협',components:{position:{zone:w.player.zone},combatant:{encounterId:'x',hostile:true,hp:5,maxHp:5}}};
 assert(!directChoices(w,s,choices).some(o=>o.id==='work:test'));assert.equal(conversationOptions(w,s).length,0);
});


test('exhaustion during the real approach stops the conversation without a dialogue call or preference reward',async()=>{
 const base=fixture();await base.poll();const saved=base.saved;
 const {EXHAUSTION_TICK_MS}=require('../.server-dist/game/base-data');
 saved.state.stats.energy=0;saved.state.exhaustionLevel=3;saved.state.exhaustionElapsedMs=EXHAUSTION_TICK_MS-1;
 const f=fixture(saved),snap=await f.poll(),talk=snap.availableActions.find(o=>o.action.optionId==='talk:oldCook');assert(talk);
 const before=f.state.worldElapsedMs;await f.choose(talk.action,'interrupted-approach');assert.equal(f.state.npcDialogue.active,null);assert.equal(f.calls.dialogue,0);assert(f.state.worldElapsedMs>before);assert(f.state.isGameOver);assert.equal(f.state.choicePreferences,undefined);assert(f.state.locationTextWorlds.kitchen.events.some(e=>e.type==='STOPPED'));
});
