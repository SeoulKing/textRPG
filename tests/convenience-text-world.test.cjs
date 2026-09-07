const test = require('node:test');
const assert = require('node:assert/strict');
const { createInitialGameState, performAction, refreshLocationKnowledge } = require('../.server-dist/game/rules');
const { buildRuntimeRegistry } = require('../.server-dist/game/runtime-registry');
const { registerContentVersion } = require('../.server-dist/game/content-versions');
const { normalizeGameSession } = require('../.server-dist/game/repository');
const { GameService } = require('../.server-dist/game/service');
const { ensureConvenienceWorld, syncConvenienceEntities } = require('../.server-dist/game/text-world/convenience');
const { performTextWorldAction, textWorldActions, textWorldScene, textWorldEntryActions } = require('../.server-dist/game/text-world');
const { fallbackNarration } = require('../.server-dist/game/text-world/narrator');
const narrator = async c => fallbackNarration(c);
const world = s => s.locationTextWorlds.convenience;
function initial() { const s=createInitialGameState();s.location='convenience';s.sceneId='convenience_first_intro';refreshLocationKnowledge(s);return s; }
async function enter(s,n=narrator) { await ensureConvenienceWorld(s,buildRuntimeRegistry(s),n,'store-test'); }
function action(s,id) { const a=textWorldActions(s).find(c=>c.action.optionId===id)?.action;assert(a,`${id}: ${textWorldActions(s).map(c=>c.action.optionId)}`);return a; }
async function choose(s,id,n=narrator) { await performTextWorldAction(s,action(s,id),'store-test',n); }
function session(s) {return {id:'store-test',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state:s,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}};}

test('convenience enters text rendering directly, hides stock until inspection, and separates discovery from collection',async()=>{
 const s=initial();const before=structuredClone(s.inventory);let contexts=[];const n=async c=>{contexts.push(c);return fallbackNarration(c);};await enter(s,n);
 assert.equal(textWorldScene(s).locationId,'convenience');assert.equal(textWorldActions(s).length,5);
 assert(!JSON.stringify(contexts[0]).includes('통조림'));assert(!JSON.stringify(contexts[0]).includes('1800'));
 assert(textWorldActions(s).every(c=>!c.action.optionId.includes('overview')));
 await choose(s,'explore:convenience_food_crate',n);
 assert.deepEqual(s.inventory,before);assert.equal(world(s).player.posture,'crouching');assert.equal(world(s).player.near,'convenience_food_crate');
 assert(world(s).lastParagraphs.length>=2);assert(world(s).observations.convenience_food_crate.stages.includes('interior'));
 const contents=contexts.at(-1).requiredFacts.find(f=>f.kind==='contents');assert.equal(contents.data.items.length,3);
 assert(action(s,'collect:convenience_food_crate'));assert.equal(s.activeStockNodeId,null);
 assert(!JSON.stringify(contexts.at(-1)).includes('1800'));
});

test('group collection preserves each existing reward, flag, skill award, and adjusted collection time',async()=>{
 const s=initial();await enter(s);await choose(s,'explore:convenience_food_crate');
 const legacy=structuredClone(s);legacy.activeStockNodeId='convenience_food_crate';
 const originalNow=Date.now;Date.now=()=>2000000000000;s.lastRealTimestamp=Date.now();legacy.lastRealTimestamp=Date.now();
 try {
  for(const choiceId of ['collect_stale_bread_from_food_crate','collect_water_from_food_crate','collect_rice_from_food_crate']) performAction(legacy,{type:'content_choice',choiceId});
  const oldTime=s.worldElapsedMs,oldInventory=structuredClone(s.inventory);await choose(s,'collect:convenience_food_crate');
  assert.deepEqual(s.inventory,legacy.inventory);assert.deepEqual(s.skillProgress,legacy.skillProgress);assert.equal(s.worldElapsedMs,legacy.worldElapsedMs);assert.deepEqual(s.stockState,legacy.stockState);
  assert(s.worldElapsedMs>oldTime);assert.equal(s.inventory.staleBread,(oldInventory.staleBread??0)+2);
  assert(s.systemNoteEntries.some(e=>e.type==='delta'&&e.subject==='item'&&e.amount===2));
  assert.equal(world(s).events.filter(e=>e.type==='TAKE').length,3);assert(!world(s).events.some(e=>e.type==='POSTURE'));
  assert(!textWorldActions(s).some(c=>c.action.optionId.includes('food_crate')));
 } finally {Date.now=originalNow;}
});

test('cash is discovered and collected in won and does not become an inventory object',async()=>{
 const s=initial();await enter(s);await choose(s,'explore:convenience_register');assert.match(world(s).lastParagraphs.join(' '),/1800원/);assert(!world(s).lastParagraphs.join(' ').includes('1800개'));
 const cash=s.money;await choose(s,'collect:convenience_register');assert.equal(s.money,cash+1800);assert(!s.inventory.$money);assert.match(world(s).lastParagraphs.join(' '),/1800원/);
});

test('partial old saves and published stock definitions survive load, depletion, region travel, and subway exploration',async()=>{
 let s=initial();const registry=structuredClone(buildRuntimeRegistry(s));registry.locations.convenience.stockNodes.find(n=>n.id==='convenience_shelf').items[0].initialQuantity=9;
 registry.locations.convenience.stockNodes.find(n=>n.id==='convenience_supply_pile').depletionBehavior='disappear';s.contentVersionId=registerContentVersion(registry,false);
 s.stockState['convenience:convenience_shelf:cannedFood']=1;s.activeStockNodeId='convenience_shelf';s.discoveredStockNodeIds.push('convenience_shelf');
 s=normalizeGameSession(JSON.parse(JSON.stringify(session(s)))).state;await enter(s);assert.equal(world(s).player.near,'convenience_shelf');assert(action(s,'collect:convenience_shelf'));
 const before=s.inventory.cannedFood??0;await choose(s,'collect:convenience_shelf');assert.equal(s.inventory.cannedFood,before+1);assert(s.flags.first_canned_food_collected);
 await choose(s,'travel:shelter');await enter(s);s.location='subway';await performTextWorldAction(s,{type:'text_world',command:'enter'},'store-test',narrator);await choose(s,'explore:crate');await choose(s,'collect:crate');await choose(s,'leave');
 s=normalizeGameSession(JSON.parse(JSON.stringify(session(s)))).state;s.location='convenience';await enter(s);
 assert.equal(s.inventory.cannedFood,before+1);assert(!textWorldActions(s).some(c=>c.action.optionId.includes('shelf')));assert.equal(s.textWorld.observations.crate.collected,true);
 await choose(s,'explore:convenience_supply_pile');await choose(s,'collect:convenience_supply_pile');assert.equal(world(s).entities.convenience_supply_pile.components.position.zone,'depleted');
 assert(!textWorldActions(s).some(c=>c.action.optionId.includes('supply_pile')));
 const fresh=initial();fresh.contentVersionId=s.contentVersionId;await enter(fresh);await choose(fresh,'explore:convenience_shelf');assert.match(world(fresh).lastParagraphs.join(' '),/9개/);
});

test('portal discovery keeps the original story and choices available beside exploration',async()=>{
 const s=initial();s.flags.magic_city_entrance_discovered=true;await enter(s);assert.match(world(s).lastParagraphs.join(' '),/푸른 빛|종소리/);
 assert(action(s,'story:go_to_magic_city_entrance_after_discovery'));await choose(s,'story:leave_magic_city_portal_for_now');assert(s.flags.magic_city_portal_discovery_seen);assert.equal(s.location,'convenience');
 assert(action(s,'explore:convenience_shelf'));assert(!textWorldActions(s).some(c=>c.action.optionId.startsWith('story:')));
});

test('death during a bundle stops subsequent rewards and narration retains actual collected items',async()=>{
 const s=initial();const registry=structuredClone(buildRuntimeRegistry(s));registry.choices.collect_stale_bread_from_food_crate.effects.push({type:'change_stat',stat:'hp',value:-10});s.contentVersionId=registerContentVersion(registry,false);
 await enter(s);await choose(s,'explore:convenience_food_crate');const water=s.inventory.waterBottle??0;await choose(s,'collect:convenience_food_crate');
 assert(s.isGameOver);assert.equal(s.inventory.waterBottle??0,water);assert(world(s).events.some(e=>e.type==='STOPPED'));assert.equal(textWorldActions(s).length,0);
});

test('service conceals hidden state, serializes duplicate choices, and renders once per intent, never on polls',async()=>{
 let stored=session(initial()),calls=0;
 const repository={withGameLock:async(_id,op)=>op(),loadGame:async()=>structuredClone(stored),saveGame:async s=>{stored=structuredClone(s);},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const service=new GameService(repository,undefined,undefined,undefined,undefined,async c=>{calls++;return fallbackNarration(c);});
 let snap=await service.getState(stored.id);assert.equal(calls,1);assert.deepEqual(snap.state.locationTextWorlds,{});assert(!JSON.stringify(snap.currentScene).includes('1800'));
 await service.getState(stored.id);assert.equal(calls,1);
 snap=await service.performAction(stored.id,snap.availableActions.find(c=>c.action.optionId==='explore:convenience_register').action);
 const take=snap.availableActions.find(c=>c.action.optionId==='collect:convenience_register').action,before=stored.state.money;
 const results=await Promise.allSettled([service.performAction(stored.id,take),service.performAction(stored.id,take)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(stored.state.money,before+1800);assert.equal(calls,3);
});

test('both text locations offer the existing 500ms activity delay; regional travel retains 1000ms',async()=>{
 const s=initial();await enter(s);assert(textWorldActions(s).every(c=>c.loading.durationMs===(c.action.optionId.startsWith('travel:')?1000:500)));
 s.location='subway';assert.equal(textWorldEntryActions(s)[0].loading.durationMs,500);await performTextWorldAction(s,{type:'text_world',command:'enter'},'store-test',narrator);
 assert(textWorldActions(s).every(c=>c.loading.durationMs===500&&c.loading.transitionType==='activity'));
});

test('observed store narration omissions and invented bulk packaging are rejected',async()=>{
 const {hasContradictoryAction}=require('../.server-dist/game/text-world/narrator');
 const s=initial();await enter(s);await choose(s,'explore:convenience_food_crate');let context;
 await choose(s,'collect:convenience_food_crate',async c=>{context=c;return fallbackNarration(c);});
 assert(hasContradictoryAction(context,'빵과 물병, 쌀 한 포대를 챙긴다.'));
 assert(hasContradictoryAction(context,'빵과 물병, 쌀을 챙긴다.'));
 assert(!hasContradictoryAction(context,'몸을 낮춘 채 빵과 물병, 쌀을 챙긴다. 보관함 안은 이제 비어 있다.'));
 assert.match(world(s).lastParagraphs.join(' '),/비어/);
 assert(textWorldActions(s).some(c=>c.label==='작은 병원으로 이동한다'));
});
