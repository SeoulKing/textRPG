const test=require('node:test'),assert=require('node:assert/strict');
const {GameService}=require('../.server-dist/game/service');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {localWorkEnvironment}=require('../.server-dist/game/work-environment');
const rows=snap=>[...snap.availableActions,...(snap.exploration?.generalActions??[]),...(snap.exploration?.targets??[]).flatMap(t=>t.actions)];
function sorted(v){return Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,sorted(v[k])])):v;}

test('a fresh survivor restores a workbench and crafts from real stored goods, then retrieves the remainder after travel and save',async t=>{
 t.mock.method(global,'fetch',async()=>{throw Error('No external requests in the shelter route')});
 let saved,step=0,narrations=0;
 const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>normalizeGameSession(sorted(structuredClone(saved))),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s))},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const service=new GameService(repo,undefined,undefined,undefined,undefined,async c=>{narrations++;return fallbackNarration(c)});
 let snap=await service.createGame();
 async function choose(id){
  const row=rows(snap).find(row=>row.id===id||row.action.optionId===id||row.action.choiceId===id||row.action.actionId===id);
  const action=id.startsWith('travel:')?{type:'travel',targetId:id.slice(7)}:row?.action;
  assert(action,'Missing '+id+'; '+rows(snap).map(row=>row.action.optionId||row.action.actionId||row.action.choiceId||row.id).join(','));
  snap=await service.performAction(saved.id,action,{requestId:'shelter-route-'+(++step)});
  assert(!snap.state.isGameOver,'Died at '+id);return action;
 }
 for(const id of ['opening_commit','travel:convenience','explore:convenience_supply_pile','collect:convenience_supply_pile','travel:shelter'])await choose(id);
 assert.equal(snap.exploration,null,'arrival preserves the existing shelter story and menus');
 await choose('text-world:shelter:enter');
 await choose('focus:shelter_workbench');
 assert.equal(localWorkEnvironment(saved.state,'craft').station,undefined);
 await choose('repair:shelter_workbench');
 assert.equal(saved.state.locationTextWorlds.shelter.entities.shelter_workbench.components.structure.integrity,5);
 assert.equal(localWorkEnvironment(saved.state,'craft').station.durationMultiplier,0.8);
 await choose('explore:shelter_storage');
 for(const itemId of ['scrapMetal','clothScrap','cordage']){
  const entity=Object.values(saved.state.locationTextWorlds.shelter.entities).find(e=>e.components.portable?.itemId===itemId&&e.components.position.zone==='player');assert(entity,itemId+' has a physical carried stack');
  await choose('hold:'+entity.id);
  const put=rows(snap).find(row=>row.action.optionId?.startsWith('put:')&&row.action.optionId.includes('shelter_storage'));
  assert(put,'offered storage destination');await choose(put.action.optionId);
  assert.equal(snap.state.inventory[itemId]??0,0);
 }
 const pool=localWorkEnvironment(saved.state,'craft').sources;
 assert.equal(pool.find(s=>s.itemId==='clothScrap').amount,4);
 await choose('leave');
 await choose('open_shelter_crafting');
 const recipe=rows(snap).find(row=>row.action.choiceId==='craft_utility_knife');assert(recipe?.craftingRecipe);
 assert(recipe.craftingRecipe.requirements.every(r=>r.met));assert(recipe.craftingRecipe.requirements.every(r=>r.storedAmount>0));
 assert.match(recipe.outcomeHint,/16분/);assert.match(recipe.craftingRecipe.effect,/20%/);
 const callsBefore=narrations,action=await choose('craft_utility_knife');
 assert.equal(narrations,callsBefore,'crafting reuses engine narration without another Gemini request');
 assert.equal(snap.state.lastActivity.plannedMinutes,16);assert.equal(snap.state.lastActivity.elapsedMinutes,16);
 assert.deepEqual(snap.state.lastActivity.storedConsumedItems,{scrapMetal:1,clothScrap:1,cordage:1});
 assert.match(snap.currentScene.paragraphs.join(' '),/보관함/);assert.match(snap.currentScene.paragraphs.join(' '),/작업대/);
 assert.equal(snap.state.inventory.utilityKnife,1);
 assert.equal(snap.availableActions.find(row=>row.action.choiceId==='craft_utility_knife').statusLabel,'이미 보유');
 const after=structuredClone(saved.state.inventory),stock=structuredClone(saved.state.locationTextWorlds.shelter.entities);
 await assert.rejects(()=>service.performAction(saved.id,action,{requestId:'stale-shelter-craft'}),/지난|바뀌/);
 assert.deepEqual(saved.state.inventory,after);assert.deepEqual(saved.state.locationTextWorlds.shelter.entities,stock);
 await choose('leave_shelter_crafting');await choose('travel:forest');await choose('travel:shelter');await choose('text-world:shelter:enter');
 assert(Object.values(saved.state.locationTextWorlds.shelter.entities).some(e=>e.components.portable?.itemId==='utilityKnife'&&e.inventoryRegistered&&e.components.position.zone==='player'),'crafted objects can be held and stored on return');
 const remaining=localWorkEnvironment(saved.state,'craft').sources;
 assert(!remaining.some(s=>s.itemId==='scrapMetal'));assert.equal(remaining.find(s=>s.itemId==='clothScrap').amount,3);
 await choose('collect:shelter_storage');
 assert.equal(snap.state.inventory.clothScrap,3);assert.equal(snap.state.inventory.utilityKnife,1);
 assert(!localWorkEnvironment(saved.state,'craft').sources.some(s=>s.itemId==='clothScrap'));
 t.diagnostic('Completed '+step+' real game actions without injected resources or time; stored materials consumed once.');
});
