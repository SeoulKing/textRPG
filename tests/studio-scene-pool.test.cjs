const test=require('node:test');
const assert=require('node:assert/strict');
const {studioScenePool,studioWriteScenePool,studioChoiceResultSummary}=require('../content-scene-pool');
const {studioContentLinks}=require('../content-story-library');
const {getEffectiveContentStudioDocument,buildWorldRegistryFromStudio,validateRegistry,applyPreparedContentStudioRegistry}=require('../.server-dist/game/data/registry');
const {parseContentStudioDocument}=require('../.server-dist/game/content-studio');
const {registerContentVersion}=require('../.server-dist/game/content-versions');
const {createInitialGameState,performAction}=require('../.server-dist/game/rules');
const {inspectStudio}=require('../.server-dist/game/studio-validation');
function fixture(){const document=getEffectiveContentStudioDocument(),story=document.stories.find(row=>row.id==='native_region_forest'),action=story.actions.find(row=>row.id==='chop_wood_at_forest');return {document,story,action};}

test('legacy logging imports one common reward and three narrative variants without changing content',()=>{
 const {document,action}=fixture(),before=JSON.stringify(document);
 const pool=studioScenePool(document,action,'forest');assert.equal(pool.entries.length,3);assert(pool.entries.every(row=>row.scene.id.startsWith('forest_chop_result_')));
 assert.match(studioChoiceResultSummary(document,action),/\+3/);assert.equal(action.effects.filter(effect=>effect.type==='add_item').length,1);assert.equal(JSON.stringify(document),before);
 const searching=document.stories.find(row=>row.id==='native_region_forest').actions.find(row=>row.id==='search_forest_resources');assert.match(studioChoiceResultSummary(document,searching),/20% 성공 시 \+1 목재 판자/);
});

test('pool membership is local to its result, saved IDs appear in graph and invalid references are rejected',()=>{
 const {document,story,action}=fixture(),originalTags=JSON.stringify(story.scenes.map(row=>row.tags)),shared=structuredClone(action);
 const common=action.effects.filter(effect=>!['set_scene','set_random_scene'].includes(effect.type));
 studioWriteScenePool(document,action,'forest',['forest_chop_result_1','forest_chop_result_3'],true);
 assert.equal(studioScenePool(document,shared,'forest').entries.length,3);assert.equal(studioScenePool(document,action,'forest').entries.length,2);assert.equal(JSON.stringify(story.scenes.map(row=>row.tags)),originalTags);
 assert.deepEqual(action.effects.filter(effect=>!['set_scene','set_random_scene'].includes(effect.type)),common);
 const restored=parseContentStudioDocument(JSON.parse(JSON.stringify(document)));
 const links=studioContentLinks(restored).filter(row=>row.from===action.id);assert.deepEqual(new Set(links.map(row=>row.to)),new Set(['forest_chop_result_1','forest_chop_result_3']));
 assert.throws(()=>studioWriteScenePool(document,action,'forest',['missing'],true));
 action.effects.find(effect=>effect.type==='set_random_scene').sceneIds.push('missing');assert(inspectStudio(document).issues.some(issue=>issue.message.includes('장면 묶음')));
});

test('actual engine varies eligible narration, grants common reward once and keeps saved content versions',()=>{
 const {document,story,action}=fixture();delete action.skillUse;
 studioWriteScenePool(document,action,'forest',['forest_chop_result_1','forest_chop_result_2','forest_chop_result_3'],true);
 story.scenes.find(row=>row.id==='forest_chop_result_3').conditions.push({type:'flag',flag:'writer_unmet_condition'});
 const saved=parseContentStudioDocument(JSON.parse(JSON.stringify(document))),registry=buildWorldRegistryFromStudio(saved);validateRegistry(registry);registerContentVersion(registry,true);applyPreparedContentStudioRegistry(registry);
 const state=createInitialGameState();state.location='forest';state.flags.opening_seen=true;state.sceneId='forest_repeat_intro';state.inventory={};
 let previous;for(let i=1;i<=3;i++){performAction(state,{type:'content_action',actionId:action.id},{rng:()=>0});assert.equal(state.inventory.wood,3*i);assert.notEqual(state.sceneId,previous);assert.notEqual(state.sceneId,'forest_chop_result_3');previous=state.sceneId;}
 // A newer publication changes both narration selection and rewards, while the prior game stays on A.
 const next=structuredClone(saved),nextAction=next.stories.find(row=>row.id===story.id).actions.find(row=>row.id===action.id);nextAction.effects.find(effect=>effect.type==='add_item').amount=7;studioWriteScenePool(next,nextAction,'forest',['forest_chop_result_1'],true);
 const registryB=buildWorldRegistryFromStudio(next);registerContentVersion(registryB,true);applyPreparedContentStudioRegistry(registryB);
 performAction(state,{type:'content_action',actionId:action.id},{rng:()=>0});assert.equal(state.inventory.wood,12);assert.notEqual(state.sceneId,previous);
 const newState=createInitialGameState();newState.location='forest';newState.flags.opening_seen=true;newState.sceneId='forest_repeat_intro';newState.inventory={};performAction(newState,{type:'content_action',actionId:action.id},{rng:()=>0});assert.equal(newState.inventory.wood,7);assert.equal(newState.sceneId,'forest_chop_result_1');
});

test('activity narration shows one result then returns to base without granting twice; repeat avoidance survives return',()=>{
 const {document,action}=fixture();delete action.skillUse;
 studioWriteScenePool(document,action,'forest',['forest_chop_result_1','forest_chop_result_2','forest_chop_result_3'],true,true);
 const original=JSON.stringify(document),registry=buildWorldRegistryFromStudio(document);assert.equal(JSON.stringify(document),original);validateRegistry(registry);registerContentVersion(registry,true);applyPreparedContentStudioRegistry(registry);
 const state=createInitialGameState();state.location='forest';state.flags.opening_seen=true;state.flags.intro_seen_forest=true;state.sceneId='forest_repeat_intro';state.inventory={};
 performAction(state,{type:'content_action',actionId:action.id},{rng:()=>0});const first=state.sceneId;assert(first.startsWith('studio_activity_'));assert.equal(state.inventory.wood,3);
 const result=registry.scenes[first];assert.equal(result.suppressLocationInteractions,true);assert.equal(result.choiceIds.length,1);const returnChoice=registry.choices[result.choiceIds[0]];assert.equal(returnChoice.label,'숲으로 돌아가기');
 const minutes=state.worldElapsedMs;performAction(state,{type:'content_choice',choiceId:returnChoice.id},{rng:()=>0});assert.equal(state.sceneId,'forest_repeat_intro');assert.equal(state.inventory.wood,3);assert.deepEqual(state.worldElapsedMs,minutes);
 performAction(state,{type:'content_action',actionId:action.id},{rng:()=>0});assert.notEqual(state.sceneId,first);assert.equal(state.inventory.wood,6);
});

test('live preview keeps the original manuscript and return choice attached to compiled activity scenes',()=>{
 const {StudioPreviewService}=require('../.server-dist/game/studio-preview');
 const {document,action}=fixture();delete action.skillUse;
 studioWriteScenePool(document,action,'forest',['forest_chop_result_1'],true,true);
 const service=new StudioPreviewService();
 try {
  const start=service.start(document,{locationId:'forest',inventory:{},flags:{intro_seen_forest:true}});
  const result=service.step(start.id,{action:{type:'content_action',actionId:action.id}});
  assert.equal(result.sourceSceneId,'forest_chop_result_1');assert.equal(result.editorTarget.sceneId,result.sourceSceneId);
  assert.equal(result.inventory.wood,3);assert.equal(result.choices.length,1);
  assert.equal(result.choices[0].label,'숲으로 돌아가기');assert.equal(result.choices[0].available,true);
  assert.equal(result.choices[0].editorTarget.sceneId,'forest_chop_result_1');
  const synced=service.step(start.id,{document});assert.equal(synced.sceneId,result.sceneId);assert.equal(synced.inventory.wood,3);
  const returned=service.step(start.id,{action:result.choices[0].action});
  assert.equal(returned.sceneId,'forest_repeat_intro');assert.equal(returned.inventory.wood,3);
  assert(returned.choices.some(choice=>choice.id===action.id));
 } finally {service.dispose();}
});

test('probability branches show their own narration and rewards before returning to the location',()=>{
 const {document,story}=fixture(),action=story.actions.find(row=>row.id==='search_forest_resources');delete action.skillUse;
 const random=action.effects.find(effect=>effect.type==='random_outcome');
 for(const result of random.outcomes){const pool=studioScenePool(document,result,'forest');studioWriteScenePool(document,result,'forest',pool.entries.map(row=>row.scene.id),true,true);}
 const registry=buildWorldRegistryFromStudio(document);validateRegistry(registry);registerContentVersion(registry,true);applyPreparedContentStudioRegistry(registry);
 for(const [rng,index] of [[0.1,0],[0.55,1],[0.7,2]]){
  const state=createInitialGameState();state.location='forest';state.flags.opening_seen=true;state.flags.intro_seen_forest=true;state.sceneId='forest_repeat_intro';state.inventory={};
  performAction(state,{type:'content_action',actionId:action.id},{rng:()=>rng});
  const scene=registry.scenes[state.sceneId],expected=Object.fromEntries(random.outcomes[index].effects.filter(effect=>effect.type==='add_item').map(effect=>[effect.itemId,effect.amount]));
  assert.deepEqual(state.inventory,expected);assert(studioScenePool(document,random.outcomes[index],'forest').entries.some(row=>row.scene.id===scene.sourceSceneId));
  const time=state.worldElapsedMs;performAction(state,{type:'content_choice',choiceId:scene.choiceIds[0]},{rng:()=>rng});
  assert.equal(state.sceneId,'forest_repeat_intro');assert.deepEqual(state.inventory,expected);assert.equal(state.worldElapsedMs,time);
 }
});
