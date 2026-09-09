
const test=require('node:test'),assert=require('node:assert/strict');
const {GameService}=require('../.server-dist/game/service');
const {createInitialGameState,refreshLocationKnowledge}=require('../.server-dist/game/rules');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {textWorldActions,currentTextWorld}=require('../.server-dist/game/text-world');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {availableWorldOptions}=require('../.server-dist/game/text-world/choices');
const {directChoices,choiceSignature}=require('../.server-dist/game/text-world/choice-director');
const {interactionContext}=require('../.server-dist/game/text-world/interaction-context');
process.env.ENABLE_LLM_WORLD_PLANNER='false';process.env.ENABLE_LLM_BACKGROUND_GENERATION='false';
test.beforeEach(t=>t.mock.method(global,'fetch',async()=>{throw Error('External generation disabled in choice contract tests')}));
// JSON objects are unordered, unlike arrays. Exercise both JSONB-like key ordering and its reverse.
function reorder(value,reverse=false){
 if(Array.isArray(value))return value.map(v=>reorder(v,reverse));
 if(!value||typeof value!=='object')return value;
 const keys=Object.keys(value).sort((a,b)=>Buffer.byteLength(a)-Buffer.byteLength(b)||Buffer.compare(Buffer.from(a),Buffer.from(b)));
 if(reverse)keys.reverse();
 return Object.fromEntries(keys.map(k=>[k,reorder(value[k],reverse)]));
}
function session(location){
 const state=createInitialGameState();state.location=location;state.sceneId=location+'_repeat_intro';state.flags.opening_seen=true;refreshLocationKnowledge(state);
 return {id:'choice-contract',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}};
}
function fixture(seed){
 let stored=reorder(JSON.parse(JSON.stringify(seed))),calls=0;
 const repo={withGameLock:async(_id,op)=>op(),loadGame:async()=>normalizeGameSession(structuredClone(stored)),saveGame:async s=>{stored=reorder(JSON.parse(JSON.stringify(s)));},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const service=new GameService(repo,undefined,undefined,undefined,undefined,async c=>{calls++;return fallbackNarration(c)});
 return {service,get saved(){return structuredClone(stored)},get calls(){return calls},get:()=>service.getState(stored.id),choose:action=>service.performAction(stored.id,action)};
}
const options=snap=>snap.availableActions.filter(a=>a.action.type==='text_world');
async function chooseId(f,snap,id){const row=options(snap).find(a=>a.action.optionId===id);assert(row,'not displayed '+id);return f.choose(row.action);}
async function verifyFrame(f,snap){
 const before=f.saved,rows=options(snap);assert(rows.length>0);assert(rows.length<=5);
 assert.deepEqual(snap.currentScene.choices.map(c=>c.serverActionHint),rows.map(c=>c.action));
 for(const reverse of [false,true]){
  const restored=normalizeGameSession(reorder(before,reverse));
  assert.deepEqual(textWorldActions(restored.state).map(c=>c.action),rows.map(c=>c.action),'displayed actions changed solely due to object ordering');
 }
 const calls=f.calls,polled=await f.get();assert.equal(f.calls,calls,'polls must not generate narration');
 assert.deepEqual(options(polled).map(c=>c.action),rows.map(c=>c.action));
 for(const row of rows){
  const branch=fixture(before),result=await branch.choose(row.action);
  assert(branch.calls<=1,'one chosen intent must not trigger extra generation');
  assert.equal(currentTextWorld(branch.saved.state)?.lastIntent.id??branch.saved.state.textWorld?.lastIntent.id,row.action.optionId);
  assert(result,'every displayed option must execute after the storage round trip');
 }
 return rows.length;
}

test('every displayed store action executes after database-shaped reloads, including the reported bread hold',async t=>{
 const f=fixture(session('convenience'));let snap=await f.get(),verified=await verifyFrame(f,snap);
 for(const id of ['explore:convenience_food_crate','collect:convenience_food_crate','explore:convenience_register']){
  snap=await chooseId(f,snap,id);verified+=await verifyFrame(f,snap);
 }
 assert(!options(snap).some(c=>c.action.optionId.startsWith('hold:')));
 const bread=snap.exploration.targets.flatMap(t=>t.actions).find(c=>c.label.includes('빵')&&c.action.optionId?.startsWith('hold:'));assert(bread);
 const originalInventory=structuredClone(f.saved.state.inventory),stale=bread.action;
 snap=await f.choose(bread.action);verified+=await verifyFrame(f,snap);
 assert.deepEqual(f.saved.state.inventory,originalInventory,'holding collected bread must not award it again');
 assert.equal(currentTextWorld(f.saved.state).player.heldItemId,bread.action.optionId.slice(5));
 const beforeReplay=f.saved;await assert.rejects(f.choose(stale),/상황이 바뀌/);assert.deepEqual(f.saved,beforeReplay);
 await assert.rejects(f.choose({type:'text_world',command:'choose',optionId:'hold:missing',revision:currentTextWorld(f.saved.state).revision}),/선택할 수 없는/);assert.deepEqual(f.saved,beforeReplay);
 t.diagnostic('Verified '+verified+' displayed store options through actual GameService execution.');
});

test('forest, river and office keep the same executable choices across reordered saves and state changes',async t=>{
 let verified=0;
 for(const [location,route]of [['forest',['harvest:chop_wood_at_forest']],['river',['harvest:fish_at_river']],['subway',['explore:crate','collect:crate']]]){
  const f=fixture(session(location));let snap=await f.get();
  if(location==='subway'){const entry=snap.availableActions.find(c=>c.action.type==='text_world'&&c.action.command==='enter');if(entry)snap=await f.choose(entry.action);else if(currentTextWorld(f.saved.state).player.zone!=='office')snap=await chooseId(f,snap,'travel:office');}
  verified+=await verifyFrame(f,snap);
  for(const id of route){snap=await chooseId(f,snap,id);verified+=await verifyFrame(f,snap);}
 }
 t.diagnostic('Verified '+verified+' displayed forest, river and office options through actual GameService execution.');
});

test('choice fingerprints ignore collection order but still change for real capabilities and threat context',async()=>{
 const f=fixture(session('subway'));let snap=await f.get();snap=await f.choose(snap.availableActions.find(c=>c.action.type==='text_world').action);
 const s=f.saved.state,w=s.textWorld,candidates=availableWorldOptions(w,s),context=interactionContext(w);
 const reversed=reorder(w,true),reverseCandidates=[...availableWorldOptions(reversed,s)].reverse();
 assert.equal(choiceSignature(w,candidates,context),choiceSignature(reversed,reverseCandidates,context));
 w.choiceHistory=[];reversed.choiceHistory=[];
 assert.deepEqual(directChoices(w,s,candidates).map(o=>o.id),directChoices(reversed,s,reverseCandidates).map(o=>o.id),'equal scores need an order-independent tie break');
 const changed=structuredClone(candidates);changed[0].actions.push({type:'WAIT',durationSeconds:5});
 assert.notEqual(choiceSignature(w,candidates),choiceSignature(w,changed),'actual action sequences must remain part of the signature');
 const changedContext={...context,threat:{kind:'darkness'},mode:'THREAT',goal:'restore_visibility'};
 assert.notEqual(choiceSignature(w,candidates,context),choiceSignature(w,candidates,changedContext));
 const discoveries={...context,newlyDiscoveredIds:['water','scrap']};assert.equal(choiceSignature(w,candidates,discoveries),choiceSignature(w,candidates,{...discoveries,newlyDiscoveredIds:['scrap','water']}));
});
