const test=require('node:test'),assert=require('node:assert/strict');
const {GameService}=require('../.server-dist/game/service');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
function sorted(v){return Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,sorted(v[k])])):v;}
const rows=snap=>[...snap.availableActions,...(snap.exploration?.generalActions??[]),...(snap.exploration?.targets??[]).flatMap(target=>target.actions)];
test('a fresh survivor collects, crafts, harvests with and carries a tool into a different world, then repairs persistent damage',async t=>{
 const flags=['ENABLE_LLM_WORLD_PLANNER','ENABLE_LLM_BACKGROUND_GENERATION'];
 const before=flags.map(key=>process.env[key]);flags.forEach(key=>process.env[key]='false');
 t.after(()=>flags.forEach((key,i)=>before[i]===undefined?delete process.env[key]:process.env[key]=before[i]));
 t.mock.method(global,'fetch',async()=>{throw Error('No provider calls in crafted-world route')});
 let saved,request=0;
 const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>normalizeGameSession(sorted(structuredClone(saved))),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s));},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const service=new GameService(repo,undefined,undefined,undefined,undefined,async c=>fallbackNarration(c));
 let snap=await service.createGame();
 async function choose(id) {
  const selected=rows(snap).find(row=>row.id===id||row.action.optionId===id||row.action.actionId===id||row.action.choiceId===id);
  const action=id.startsWith('travel:')?{type:'travel',targetId:id.slice(7)}:selected?.action;
  assert(action,'Missing: '+id+'; offered: '+rows(snap).map(row=>row.action.optionId||row.action.actionId||row.action.choiceId).join(','));
  if(selected)assert(selected.isAvailable);
  snap=await service.performAction(saved.id,action,{requestId:'crafted-route-'+(++request)});
  assert(!snap.state.isGameOver,'Survivor died at '+id);return {action,snap};
 }
 for(const id of ['opening_commit','travel:convenience','explore:convenience_supply_pile','collect:convenience_supply_pile','travel:shelter','open_shelter_crafting','craft_crude_axe','leave_shelter_crafting'])await choose(id);
 assert.equal(snap.state.inventory.crudeAxe,1);assert.equal(snap.state.toolDurability.crudeAxe,8);
 assert.deepEqual({wood:snap.state.inventory.woodPlank,metal:snap.state.inventory.scrapMetal,cloth:snap.state.inventory.clothScrap,cord:snap.state.inventory.cordage},{wood:2,metal:1,cloth:3,cord:2});
 await choose('travel:forest');await choose('toolwork:chop_wood_with_crude_axe');
 assert.equal(snap.state.inventory.wood,5);assert.equal(snap.state.toolDurability.crudeAxe,7);
 await choose('travel:shelter');await choose('travel:subway');await choose('text-world:enter');
 await choose('focus:crate');await choose('tool:crudeAxe:crate:cut');
 assert.equal(saved.state.textWorld.entities.crate.components.structure.integrity,1);assert.equal(snap.state.toolDurability.crudeAxe,6);
 const inventory={...snap.state.inventory};
 const selected=await choose('repair:crate');assert.equal(saved.state.textWorld.entities.crate.components.structure.integrity,4);
 assert.equal(snap.state.inventory.woodPlank??0,inventory.woodPlank-2);assert.equal(snap.state.inventory.clothScrap,inventory.clothScrap-1);
 const repaired=saved.state.textWorld.entities.crate.components.structure,after={...snap.state.inventory};
 await service.performAction(saved.id,selected.action,{requestId:'crafted-route-'+request});
 assert.deepEqual(saved.state.inventory,after,'duplicate receipt does not spend another repair kit');
 await assert.rejects(()=>service.performAction(saved.id,selected.action,{requestId:'stale-repair'}),/상황이 바뀌|선택할 수/);
 await choose('leave');await choose('travel:shelter');await choose('travel:subway');await choose('text-world:enter');
 assert.deepEqual(saved.state.textWorld.entities.crate.components.structure,repaired);assert.deepEqual(snap.state.inventory,after);
 assert.equal(Object.values(saved.state.textWorld.entities).filter(e=>e.components.portable?.itemId==='crudeAxe'&&e.components.position.zone==='player').length,1);
 assert.equal(snap.state.toolDurability.crudeAxe,6);t.diagnostic('Completed '+request+' real game actions without injecting resources or time.');
});