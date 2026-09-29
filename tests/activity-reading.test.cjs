const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState,performAction}=require('../.server-dist/game/rules');
const {GameService}=require('../.server-dist/game/service');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {workActivityParagraphs}=require('../.server-dist/game/activity-narrative');
const {resolveStoryFrame}=require('../.server-dist/game/story-flow');
process.env.ENABLE_LLM_WORLD_PLANNER='false';process.env.ENABLE_LLM_BACKGROUND_GENERATION='false';
let requests=0;
test.beforeEach(t=>{requests=0;t.mock.method(global,'fetch',async()=>{requests++;throw Error('No provider calls for authored work results')})});
test.afterEach(()=>assert.equal(requests,0));
function stateFor(id){const state=createInitialGameState();Object.assign(state.flags,{opening_seen:true,shelter_crafting_open:true,shelter_crafting_intro_seen:true,shelter_cooking_open:true});state.sceneId=id.startsWith('cook_')?'shelter_cooking_menu':'shelter_crafting_menu_repeat';state.stats={hp:10,mind:10,energy:15};
 const definition=buildRuntimeRegistry(state).choices[id];for(const c of definition.conditions){if(c.type==='has_item')state.inventory[c.itemId]=c.amount;if(c.type==='flag')state.flags[c.flag]=true;if(c.type==='quest_state')state.quests[c.questId]=c.status;}return state;}
function fixture(state){let stored={id:'activity-reading',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}};const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>structuredClone(stored),saveGame:async s=>{stored=JSON.parse(JSON.stringify(s));stored.state=GameStateSchema.parse(stored.state)},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};const service=new GameService(repo);return{service,get state(){return stored.state},read:()=>service.getState(stored.id),choose:s=>service.performAction(stored.id,s.action)};}

test('craft results replace an empty menu body, persist on reload, and add a new scene for each actual job',async()=>{
 const state=stateFor('craft_firewood');state.inventory.wood=2;const f=fixture(state);let before=await f.read();const choice=before.availableActions.find(c=>c.id==='craft_firewood');assert(choice.choiceThought);assert.equal(choice.loading.durationMs,500);assert(!choice.postChoiceNarrative);
 const after=await f.choose(choice);assert.equal(after.currentScene.title,'제작');assert.match(after.currentScene.paragraphs.join(' '),/목재.*땔감/);assert(!after.currentScene.paragraphs.join(' ').includes('당신은'));assert.notEqual(after.currentScene.id,before.currentScene.id);
 assert.equal(f.state.inventory.firewood,4);assert.deepEqual(f.state.lastActivity.producedItems,{firewood:4});assert.deepEqual(after.currentScene.paragraphs,f.state.lastActivity.paragraphs);
 const reloaded=await f.read();assert.equal(reloaded.currentScene.id,after.currentScene.id);assert.deepEqual(reloaded.currentScene.paragraphs,after.currentScene.paragraphs);
 const second=await f.choose(reloaded.availableActions.find(c=>c.id==='craft_firewood'));assert.notEqual(second.currentScene.id,after.currentScene.id);assert.equal(second.currentScene.paragraphs.length,1);assert.equal(f.state.inventory.firewood,8);
 await assert.rejects(f.choose(choice),/작업 상황/);assert.equal(f.state.inventory.firewood,8);assert.deepEqual((await f.read()).currentScene,second.currentScene);
});

test('cooking shows the selected recipe completion while food use keeps that scene and leaving expires it',async()=>{
 const f=fixture(stateFor('cook_rice_porridge')),before=await f.read();const choice=before.availableActions.find(c=>c.id==='cook_rice_porridge');assert.equal(choice.choiceThought,'먹을 것을 좀 준비해 둘까.');
 const after=await f.choose(choice);assert.equal(after.currentScene.title,'요리');assert(after.currentScene.paragraphs.join(' ').includes(buildRuntimeRegistry(f.state).items.ricePorridge.name));assert(!after.currentScene.paragraphs.join(' ').includes('당신은'));assert.equal(f.state.inventory.ricePorridge,1);
 const eaten=await f.service.performAction(after.gameId,{type:'use_item',itemId:'ricePorridge'});assert.equal(eaten.currentScene.id,after.currentScene.id);assert.deepEqual(eaten.currentScene.paragraphs,after.currentScene.paragraphs);assert.equal(f.state.inventory.ricePorridge??0,0);
 const exited=await f.choose(eaten.availableActions.find(c=>c.id==='leave_shelter_cooking'));assert.notEqual(exited.currentScene.id,after.currentScene.id);assert.equal(f.state.lastActivity.paragraphs,undefined);
});

test('interrupted cooking shows the unfinished attempt and cannot leak its completion log',async()=>{
 const state=stateFor('cook_rice_porridge');state.stats.hp=1;state.conditions.injury={level:1,damageProgress:.99};const f=fixture(state),before=await f.read();const after=await f.choose(before.availableActions.find(c=>c.id==='cook_rice_porridge'));
 assert(after.state.isGameOver);assert.equal(f.state.lastActivity.status,'interrupted');assert.match(after.currentScene.paragraphs.join(' '),/끝내기 전에 멈춘다/);assert(!after.currentScene.paragraphs.join(' ').includes('물에 오래 풀어'));assert.equal(f.state.inventory.ricePorridge??0,0);assert.deepEqual(f.state.lastActivity.producedItems,{});
});

for(const roll of [0,.99])test('custom recipe narrative follows only its executed random branch: '+roll,()=>{
 const state=stateFor('craft_firewood'),registry=buildRuntimeRegistry(state);state.dynamicContent.choices.authored_work={...structuredClone(registry.choices.craft_firewood),id:'authored_work',label:'재료 손질',conditions:[{type:'has_item',itemId:'wood',amount:1}],effects:[{type:'remove_item',itemId:'wood',amount:1},{type:'advance_time',minutes:5},{type:'random_outcome',outcomes:[{weight:1,result:'success',effects:[{type:'add_item',itemId:'firewood',amount:2},{type:'log',message:'당신은 잘 마른 조각을 골라 땔감으로 챙긴다.'}]},{weight:1,result:'failure',effects:[{type:'log',message:'당신은 목재를 살피지만 쓸 만한 조각을 얻지 못한다.'}]}]}]};
 const observed=[];performAction(state,{type:'content_choice',choiceId:'authored_work'},{rng:()=>roll,onNarrative:e=>observed.push(e)});const text=state.lastActivity.paragraphs.join(' ');assert(!text.includes('당신은'));assert.equal(state.lastActivity.elapsedMinutes,5);
 if(roll===0){assert.match(text,/잘 마른/);assert(!text.includes('얻지 못한다'));assert.equal(state.inventory.firewood,2)}else {assert.match(text,/얻지 못한다/);assert(!text.includes('잘 마른'));assert.equal(state.inventory.firewood??0,0)}
 assert(observed.some(e=>e.type==='text'&&e.text.includes(roll===0?'잘 마른':'얻지 못한다')));
});

test('authored result text is not truncated to satisfy the scene paragraph limit; absent text has a factual completion fallback',()=>{
 const state=stateFor('craft_firewood');performAction(state,{type:'content_choice',choiceId:'craft_firewood'});const registry=buildRuntimeRegistry(state),definition=registry.choices.craft_firewood;
 const many=workActivityParagraphs(definition,state.lastActivity,['첫째.','둘째.','셋째.','넷째.'],registry);assert.equal(many.length,3);assert.match(many[2],/셋째.*넷째/);
 const fallback=workActivityParagraphs(definition,state.lastActivity,[],registry);assert.equal(fallback.length,1);assert.match(fallback[0],/작업을 마친다/);
});

test('local actions with activity metadata get thoughts through the same story adapter',()=>{
 const state=stateFor('craft_firewood'),registry=buildRuntimeRegistry(state);state.dynamicContent.actions.local_work={...structuredClone(registry.actions.rest_light_at_shelter),id:'local_work',label:'작은 작업',activity:{kind:'craft'},effects:[{type:'advance_time',minutes:5}],conditions:[]};state.dynamicContent.locations.shelter={...structuredClone(registry.locations.shelter),interactionChoices:[state.dynamicContent.actions.local_work]};state.sceneId='shelter_repeat_prequest';state.flags.prologue_old_woman_seen=true;state.flags.shelter_crafting_open=false;state.flags.shelter_cooking_open=false;
 const row=resolveStoryFrame(state,buildRuntimeRegistry(state)).choices.find(c=>c.id==='local_work');assert(row?.choiceThought);assert.equal(row.choiceThoughtSource,'template');
});
