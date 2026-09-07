const test=require('node:test'),assert=require('node:assert/strict');
const {GameService}=require('../.server-dist/game/service');
const {createInitialGameState,refreshLocationKnowledge}=require('../.server-dist/game/rules');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {currentTextWorld}=require('../.server-dist/game/text-world');
function sorted(v){return Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,sorted(v[k])])):v;}
function fixture(location='subway',seed){
 const state=createInitialGameState();state.location=location;state.sceneId=location+'_repeat_intro';state.flags.opening_seen=true;refreshLocationKnowledge(state);
 let saved=seed||{id:'catalogue-test',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}},calls=0;
 const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>normalizeGameSession(sorted(structuredClone(saved))),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s));},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const service=new GameService(repo,undefined,undefined,undefined,undefined,async c=>{calls++;return fallbackNarration(c)});
 return {get saved(){return saved},get calls(){return calls},get:()=>service.getState(saved.id),choose:a=>service.performAction(saved.id,a)};
}
const rows=snap=>[...(snap.exploration?.generalActions||[]),...(snap.exploration?.targets||[]).flatMap(t=>t.actions)];
async function start(f){let s=await f.get();if(!s.exploration)s=await f.choose({type:'text_world',command:'enter'});return s;}
async function choose(f,snap,id){const row=rows(snap).find(c=>c.action.optionId===id);assert(row,'missing catalogue intention: '+id);return f.choose(row.action);}
test.beforeEach(t=>t.mock.method(global,'fetch',async()=>{throw Error('No external generation in catalogue tests')}));

test('catalogue reveals only visible targets, lists suggestions as a subset, and querying is free',async()=>{
 const f=fixture(),snap=await start(f),before=structuredClone(f.saved),calls=f.calls;
 assert.deepEqual(snap.exploration.targets.map(t=>t.id).sort(),['crate','door','floor','lamp']);
 for(const hidden of ['doorKey','water','scrap','food','cache'])assert(!snap.exploration.targets.some(t=>t.id===hidden));
 assert(!JSON.stringify(snap.exploration).includes('ironDoorKey'));assert.equal(snap.state.textWorld,null);
 assert(rows(snap).length>snap.availableActions.length);assert(snap.availableActions.every(c=>rows(snap).some(r=>r.action.optionId===c.action.optionId)));
 const next=await f.get();assert.deepEqual(next.exploration,snap.exploration);assert.equal(f.calls,calls);assert.equal(f.saved.state.timeMinutes,before.state.timeMinutes);
});

test('every catalogue action executes after a reordered save across office and store',async t=>{
 let count=0;
 for(const location of ['subway','convenience']){
 const f=fixture(location);let snap=await start(f);
 for(const id of [null,location==='subway'?'explore:crate':'explore:convenience_food_crate',location==='subway'?'collect:crate':'collect:convenience_food_crate']){
  if(id)snap=await choose(f,snap,id);
  assert(snap.availableActions.length<=5);const saved=structuredClone(f.saved);
  for(const row of rows(snap)){
   const branch=fixture(location,sorted(saved));const result=await branch.choose(row.action);assert(result);assert(branch.calls<=1);count++;
  }
 }
 }
 t.diagnostic('Executed '+count+' catalogue actions from their offered snapshots.');
});

test('manual placement and door closure work without the director recommending them; stale actions cannot duplicate an item',async()=>{
 const f=fixture();let snap=await start(f);
 snap=await choose(f,snap,'inspect:floor');snap=await choose(f,snap,'take:doorKey');snap=await choose(f,snap,'unlock:door');
 const close=rows(snap).find(c=>c.action.optionId==='close:door');assert(close);assert(!snap.availableActions.some(c=>c.action.optionId==='close:door'));
 snap=await f.choose(close.action);assert.equal(currentTextWorld(f.saved.state).entities.door.components.openable.isOpen,false);
 snap=await choose(f,snap,'explore:crate');snap=await choose(f,snap,'collect:crate');
 const held=currentTextWorld(f.saved.state).player.heldItemId,id='put:'+held+':crate:inside';
 const put=rows(snap).find(c=>c.action.optionId===id);assert(put);const quantity=structuredClone(f.saved.state.inventory);
 snap=await f.choose(put.action);assert.equal(currentTextWorld(f.saved.state).entities[held].components.position.zone,'crate');
 await assert.rejects(f.choose(put.action),/상황이 바뀌/);
 snap=await choose(f,snap,'collect:crate');assert.deepEqual(f.saved.state.inventory,quantity);
 await assert.rejects(f.choose({type:'text_world',command:'choose',optionId:'take:food',revision:snap.exploration.revision}),/선택할 수 없는/);
});
