const test=require('node:test');
const assert=require('node:assert/strict');
const {studioOutcomeProbabilities,studioSetSuccessPercent,studioSetOutcomePercent,studioReplaceEffects,studioCreateRegionAction}=require('../content-outcome-editor');
const {getEffectiveContentStudioDocument,buildWorldRegistryFromStudio,applyPreparedContentStudioRegistry}=require('../.server-dist/game/data/registry');
const {parseContentStudioDocument}=require('../.server-dist/game/content-studio');
const {getFishingOutcomeProbabilities,createEmptySkillProgress,buildSkillProgressCards}=require('../.server-dist/game/skill-progression');
const {registerContentVersion}=require('../.server-dist/game/content-versions');
const {createInitialGameState,performAction}=require('../.server-dist/game/rules');
const {EffectSchema}=require('../.server-dist/game/schemas/condition-effect');
const {studioSyncAction}=require('../content-story-library');
const close=(actual,expected)=>assert(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
function fishing(){const document=getEffectiveContentStudioDocument();return {document,action:document.stories.find(s=>s.id==='native_region_river').actions.find(a=>a.id==='fish_at_river')};}
test('probability editing matches engine at every level, preserves result effects and updates the skill card',()=>{
 const {action}=fishing(),effect=action.effects.find(e=>e.type==='random_outcome'),original=structuredClone(effect.outcomes.map(row=>row.effects));
 studioSetSuccessPercent(effect,60);const expected=[.4,.45,.15];studioOutcomeProbabilities(effect.outcomes).forEach((p,i)=>close(p,expected[i]));
 for(let level=1;level<=5;level++)studioOutcomeProbabilities(effect.outcomes,level,10,5).forEach((p,i)=>close(p,getFishingOutcomeProbabilities(effect.outcomes,level)[i]));
 assert.deepEqual(effect.outcomes.map(row=>row.effects),original);
 close(buildSkillProgressCards(createEmptySkillProgress(),effect.outcomes).find(row=>row.id==='fishing').effectPercent,60);
 studioSetOutcomePercent(effect,2,25);close(studioOutcomeProbabilities(effect.outcomes)[2],.25);close(studioOutcomeProbabilities(effect.outcomes).reduce((sum,p)=>sum+p,0),1);
 assert.throws(()=>studioSetSuccessPercent(effect,101));assert.throws(()=>studioSetOutcomePercent(effect,0,NaN));
});
test('zero and certain outcomes are supported while all-zero probabilities are rejected',()=>{
 const effect=fishing().action.effects.find(e=>e.type==='random_outcome');
 studioSetSuccessPercent(effect,0);assert(EffectSchema.safeParse(effect).success);assert.deepEqual(getFishingOutcomeProbabilities(effect.outcomes,5),[1,0,0]);
 studioSetSuccessPercent(effect,100);assert(EffectSchema.safeParse(effect).success);close(getFishingOutcomeProbabilities(effect.outcomes,1)[0],0);
 effect.outcomes.forEach(row=>row.weight=0);assert.equal(EffectSchema.safeParse(effect).success,false);
});
test('new region choices and authored outcomes survive serialization and execute with the real engine',()=>{
 const {document}=fishing();const {action,story}=studioCreateRegionAction(document,'river','writer_river_reward','강에서 꾸러미를 찾는다');
 const outcome={weight:100,result:'success',label:'물과 식량을 찾았다',effects:[{type:'add_item',itemId:'waterBottle',amount:2},{type:'add_item',itemId:'cannedFood',amount:1},{type:'change_money',amount:50},{type:'set_scene',sceneId:'writer_river_result'}]};
 action.effects.push({type:'random_outcome',outcomes:[outcome,{weight:0,result:'failure',label:'아무것도 없다',effects:[]}]});
 studioReplaceEffects(outcome,['log'],[{type:'log',message:'버려진 가방 안에서 보급품을 찾았다.'}]);
 story.scenes.push({id:'writer_river_result',locationId:'river',studioStoryId:story.id,title:'물가의 꾸러미',paragraphs:['작가가 작성한 결과 장면.'],conditions:[],choices:[],tags:[]});
 studioSyncAction(document,action);const restored=parseContentStudioDocument(JSON.parse(JSON.stringify(document))),registry=buildWorldRegistryFromStudio(restored);registerContentVersion(registry,true);applyPreparedContentStudioRegistry(registry);
 const state=createInitialGameState();state.flags.opening_seen=true;state.location='river';state.sceneId='river_repeat_intro';state.inventory={};const money=state.money;
 performAction(state,{type:'content_action',actionId:action.id},{rng:()=>0.9});assert.equal(state.inventory.waterBottle,2);assert.equal(state.inventory.cannedFood,1);assert.equal(state.money,money+50);assert.equal(state.sceneId,'writer_river_result');
 const saved=registry.actions[action.id].effects.find(e=>e.type==='random_outcome');assert.equal(saved.outcomes[0].label,'물과 식량을 찾았다');assert(saved.outcomes[0].effects.some(e=>e.message==='버려진 가방 안에서 보급품을 찾았다.'));
});

test('new action costs gate rewards and daily limits prevent repeat grants',()=>{
 const {document}=fishing();const {action}=studioCreateRegionAction(document,'river','writer_river_trade','물로 식량 교환');
 action.dailyLimit={key:'writer_trade_daily',max:1};
 action.effects.push({type:'random_outcome',outcomes:[{weight:100,result:'success',effects:[{type:'remove_item',itemId:'waterBottle',amount:2},{type:'add_item',itemId:'cannedFood',amount:1}]},{weight:0,result:'failure',effects:[]}]});
 const registry=buildWorldRegistryFromStudio(document);registerContentVersion(registry,true);applyPreparedContentStudioRegistry(registry);
 const state=createInitialGameState();state.flags.opening_seen=true;state.location='river';state.sceneId='river_repeat_intro';state.inventory={waterBottle:1};
 assert.throws(()=>performAction(state,{type:'content_action',actionId:action.id},{rng:()=>0}));assert.equal(state.inventory.cannedFood??0,0);assert.equal(state.inventory.waterBottle,1);
 state.inventory.waterBottle=4;performAction(state,{type:'content_action',actionId:action.id},{rng:()=>0});assert.equal(state.inventory.waterBottle,2);assert.equal(state.inventory.cannedFood,1);
 assert.throws(()=>performAction(state,{type:'content_action',actionId:action.id},{rng:()=>0}));assert.equal(state.inventory.cannedFood,1);
});
