const {inventoryLightControls,performInventoryLightAction}=require('../.server-dist/game/text-world/inventory-lights');
function switchLight(s,on){const c=inventoryLightControls(s)[0];performInventoryLightAction(s,{type:'item_light',...c,on});}
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInitialGameState } = require('../.server-dist/game/rules');
const { GameStateSchema, GameActionSchema } = require('../.server-dist/game/schemas');
const { normalizeGameSession } = require('../.server-dist/game/repository');
const { GameService } = require('../.server-dist/game/service');
const { createSubwayTextWorld, visibleEntities, migrateTextWorld } = require('../.server-dist/game/text-world/world');
const { resolveWorldActions, validateWorldAction } = require('../.server-dist/game/text-world/engine');
const { directNarrative, perceiveWorld } = require('../.server-dist/game/text-world/perception');
const { fallbackNarration, validateNarration } = require('../.server-dist/game/text-world/narrator');
const { performTextWorldAction, textWorldActions } = require('../.server-dist/game/text-world');
function initial() { const s = createInitialGameState(); s.location='subway'; s.sceneId='subway_first_intro'; s.flags.known_subway=true; return s; }
const narrator = async context => fallbackNarration(context);
async function enter(state) { await performTextWorldAction(state,{type:'text_world',command:'enter'},'test',narrator); }
function action(state,id) { const c=textWorldActions(state).find(c=>c.action.optionId===id); assert(c,'Missing '+id+': '+textWorldActions(state).map(c=>c.action.optionId)); return c.action; }
async function findKey(state) { await choose(state,'inspect:floor'); await choose(state,'take:doorKey'); }
async function unlockDoor(state) { await findKey(state); await choose(state,'unlock:door'); }
function storedRecap(state) {
  const world=structuredClone(state.textWorld);
  world.events=[];
  world.lastIntent={id:'overview',label:'기존 저장의 상태 정리',importance:'minor'};
  resolveWorldActions(world,state,[{type:'LOOK'}]);
  return fallbackNarration(directNarrative(world)).paragraphs;
}
async function choose(state,id) {
  if(id==='light:lamp'){switchLight(state,!inventoryLightControls(state)[0].on);return;}
  // Follow the visible focus-exit flow when the requested intention belongs to the room.
  if (!textWorldActions(state).some(c=>c.action.optionId===id) && textWorldActions(state).some(c=>c.action.optionId==='defocus'))
    await performTextWorldAction(state,action(state,'defocus'),'test',narrator);
  await performTextWorldAction(state,action(state,id),'test',narrator);
  if (!state.textWorld.active || state.isGameOver || state.stageClear) return;
  const choices=textWorldActions(state); assert(choices.length>=1 && choices.length<=5,choices.map(c=>c.label).join(','));
  assert(!choices.some(c=>['overview','more','back'].includes(c.action.optionId)));
}
function session(state) { return {id:'text-world-test',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,
  world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}}; }

test('entry communicates fixed layout without leaking contents; a single intent reveals but never collects',async()=>{
  const s=initial(), before=structuredClone(s.inventory); await enter(s);
  const ctx=directNarrative(s.textWorld), serialized=JSON.stringify(ctx);
  assert(!/미개봉 물병|고철|캔 음식|공구 보관함/.test(serialized));
  assert.match(s.textWorld.lastParagraphs.join(' '),/왼쪽 벽/); assert.match(s.textWorld.lastParagraphs.join(' '),/오른쪽 벽/); assert.match(s.textWorld.lastParagraphs.join(' '),/맞은편/);
  assert.equal(s.textWorld.observations.crate.stages.includes('surface'),false);
  await choose(s,'explore:crate');
  assert.deepEqual(s.inventory,before); assert.equal(s.textWorld.player.posture,'crouching'); assert.equal(s.textWorld.player.position,'left-wall'); assert.equal(s.textWorld.player.facing,'crate');
  assert.deepEqual(s.textWorld.observations.crate.stages,['outline','surface','interior']);
  assert.match(s.textWorld.lastParagraphs.join(' '),/미개봉 물병/);
  assert.equal(s.textWorld.elapsedSeconds,13); // move 5 + crouch 1 + inspect 5 + open 2
  assert(action(s,'collect:crate')); assert(s.textWorld.lastParagraphs.length>=2);
});

test('group collection counts actual actions, survives normalization and rejects stale duplicate',async()=>{
  let s=initial(); const water=s.inventory.waterBottle??0, scrap=s.inventory.scrapMetal??0;
  await enter(s); await choose(s,'explore:crate'); const take=action(s,'collect:crate'), time=s.textWorld.elapsedSeconds;
  await performTextWorldAction(s,take,'test',narrator);
  assert.equal(s.inventory.waterBottle,water+1); assert.equal(s.inventory.scrapMetal,scrap+2);
  assert.equal(s.textWorld.elapsedSeconds-time,8); // Two pickups and storing the first item. assert.equal(s.textWorld.player.posture,'crouching');
  assert(s.systemNoteEntries.some(e=>e.type==='delta'&&e.subject==='item'&&e.itemId==='waterBottle'&&e.amount===1));
  const collected=structuredClone(s); await assert.rejects(performTextWorldAction(s,take,'test',narrator),/상황이 바뀌/); assert.deepEqual(s,collected);
  s=normalizeGameSession(JSON.parse(JSON.stringify(session(s)))).state;
  await choose(s,'leave'); await enter(s);
  assert(!textWorldActions(s).some(c=>/collect:crate|explore:crate/.test(c.action.optionId)));
  assert.equal(s.inventory.waterBottle,water+1); assert.equal(s.textWorld.entities.crate.components.container.items.length,0);
  assert(s.textWorld.entities.crate); assert(GameStateSchema.safeParse(s).success);
});

test('partial failure preserves completed movement, posture and collection with structured failed action',async()=>{
  const s=initial(); await enter(s); s.textWorld.entities.crate.components.openable.locked=true;
  await choose(s,'explore:crate'); const w=s.textWorld;
  assert.equal(w.player.near,'crate'); assert.equal(w.player.posture,'crouching'); assert.equal(w.elapsedSeconds,11);
  assert.equal(w.entities.crate.components.openable.isOpen,false); assert(!JSON.stringify(w.knowledge).includes('미개봉 물병'));
  const failure=w.events.at(-1); assert.equal(failure.type,'STOPPED'); assert.equal(failure.attemptedAction,'OPEN'); assert.equal(failure.targetId,'crate');
  assert(!textWorldActions(s).some(c=>c.action.optionId==='explore:crate'));
  w.entities.crate.components.openable.locked=false; w.entities.crate.components.openable.isOpen=true;
  directNarrative(w); w.events=[]; const water=s.inventory.waterBottle??0;
  const result=resolveWorldActions(w,s,[{type:'TAKE',target:'water'},{type:'TAKE',target:'missing'},{type:'TAKE',target:'scrap'}]);
  assert(result.interrupted); assert.equal(s.inventory.waterBottle,water+1); assert(w.entities.crate.components.container.items.includes('scrap'));
  assert.equal(w.events[0].type,'TAKE'); assert.equal(w.events[1].type,'STOPPED');
});

test('discovery stops a plan before automatic collection, including illumination of an open dark container',()=>{
  const s=initial(),w=createSubwayTextWorld(); w.player.near='crate';
  resolveWorldActions(w,s,[{type:'OPEN',target:'crate'},{type:'TAKE',target:'water'}]);
  assert.equal(w.entities.water.components.position.zone,'crate');
  w.player.zone='storage'; w.player.near='cache'; w.entities.cache.components.openable.isOpen=true;
  w.entities.lamp.components.position.zone='player'; w.player.heldToolId='lamp';
  assert(!visibleEntities(w).some(e=>e.id==='food')); assert(!JSON.stringify(perceiveWorld(w)).includes('캔 음식'));
  const result=resolveWorldActions(w,s,[{type:'LIGHT',target:'lamp'},{type:'TAKE',target:'food'}]);
  assert(result.discovery); assert.equal(w.entities.food.components.position.zone,'cache'); assert(visibleEntities(w).some(e=>e.id==='food'));
});

test('flashlight travels with the player; corridor, storage and returns share staged discovery',async()=>{
  const s=initial(); await enter(s); await unlockDoor(s); await choose(s,'equip:lamp');switchLight(s,true);
  assert.equal(s.textWorld.player.heldToolId,'lamp'); assert.equal(s.textWorld.player.position,'right-wall');
  assert(!perceiveWorld(s.textWorld).find(f=>f.kind==='layout').data.layout.includes('손전등이 놓여 있다'));
  await choose(s,'travel:corridor'); assert(!visibleEntities(s.textWorld).some(e=>e.id==='cache'));
  await choose(s,'survey:corridor'); assert(!textWorldActions(s).some(c=>c.action.optionId==='survey:corridor'));
  await choose(s,'travel:storage'); assert(visibleEntities(s.textWorld).some(e=>e.id==='cache')); assert(!visibleEntities(s.textWorld).some(e=>e.id==='food'));
  await choose(s,'explore:cache'); const before=s.inventory.cannedFood??0; await choose(s,'collect:cache'); assert.equal(s.inventory.cannedFood,before+1);
  await choose(s,'light:lamp'); assert(!visibleEntities(s.textWorld).some(e=>e.id==='cache'));
  switchLight(s,true);
  await choose(s,'travel:corridor'); await choose(s,'travel:office');
  assert.equal(s.textWorld.player.posture,'standing'); assert.equal(s.textWorld.player.heldToolId,'lamp'); assert(s.textWorld.entities.door.components.openable.isOpen);
});

test('opening the doorway without portable light reveals darkness and does not walk into it',async()=>{
  const s=initial(); await enter(s); await unlockDoor(s);
  assert.equal(s.textWorld.player.zone,'office'); assert(s.textWorld.entities.door.components.openable.isOpen);
  assert.match(s.textWorld.lastParagraphs.join(' '),/복도.*빛이 없어/);
  assert(!textWorldActions(s).some(c=>c.action.optionId==='travel:corridor'));
  assert(validateWorldAction(s.textWorld,s,{type:'MOVE',target:'corridor'}));
});

test('last three rendered scenes and posture are passed as continuity, recap is one paragraph',async()=>{
  const s=initial(); await enter(s); await choose(s,'explore:crate'); await choose(s,'collect:crate');
  const last=structuredClone(s.textWorld.recentScenes); let context;
  await performTextWorldAction(s,action(s,'equip:lamp'),'test',async c=>{context=structuredClone(c); return fallbackNarration(c);});
  assert.deepEqual(context.recentScenes,last); assert.equal(context.recentScenes.length,3);
  assert(context.results.some(e=>e.type==='POSTURE'&&e.before.posture==='crouching'&&e.after.posture==='standing'));
  assert.equal(context.player.heldTool.name,'손전등'); assert(!context.requiredFacts.some(f=>f.kind==='layout'));
  assert.equal(s.textWorld.recentScenes.length,3);
  const recap=storedRecap(s); assert.equal(recap.length,1); assert.match(recap[0],/비어/);
});

test('narrator can select sensory details, but missing required IDs, unknown IDs and incorrect paragraph count fail',async()=>{
  const s=initial(); await enter(s); const c=directNarrative(s.textWorld);
  const ids=c.requiredFacts.map(f=>f.id);
  const valid={paragraphs:[{text:'입구에 선다.',factIds:ids},{text:'양쪽 벽을 살핀다.',factIds:[ids[0]]}]};
  assert(validateNarration(c,valid));
  const missing=structuredClone(valid); missing.paragraphs.forEach(p=>p.factIds=p.factIds.filter(id=>id!==ids.at(-1))); assert.equal(validateNarration(c,missing),null);
  const invalid=structuredClone(valid); invalid.paragraphs[0].factIds.push('invented:water'); assert.equal(validateNarration(c,invalid),null);
  assert.equal(validateNarration(c,{paragraphs:[valid.paragraphs[0]]}),null);
});

test('narration failure cannot roll back collection or mutate engine facts',async()=>{
  const s=initial(); await enter(s); await choose(s,'explore:crate'); let received;
  await performTextWorldAction(s,action(s,'collect:crate'),'test',async c=>{received=structuredClone(c); c.requiredFacts.length=0; throw new Error('offline');});
  assert(!('entities' in received)); assert.equal(s.textWorld.source,'template'); assert(s.textWorld.lastParagraphs.length>=2);
  assert.equal(s.textWorld.entities.crate.components.container.items.length,0); assert.match(s.textWorld.lastParagraphs.join(' '),/챙긴다|손에 쥔다/);
});

test('v1 migration preserves opened doors, empty containers, tool state, inventory and revision without refilling',()=>{
  const s=initial(),v1=createSubwayTextWorld();
  v1.version=1; v1.revision=25; v1.entities.crate.components.container.items=[];
  v1.entities.water.components.position.zone='collected'; v1.entities.scrap.components.position.zone='collected';
  v1.entities.door.components.openable.isOpen=true; v1.entities.lamp.components.position.zone='player'; v1.entities.lamp.components.light.on=true;
  v1.player={zone:'office',near:'crate'}; v1.knowledge={'contents:crate':{text:'안은 비어 있다.',signature:'old',observedAt:10}};
  for (const key of ['observations','visitedZones','recentScenes','lastIntent']) delete v1[key];
  s.textWorld=v1; const restored=normalizeGameSession(JSON.parse(JSON.stringify(session(s)))).state;
  assert.equal(restored.textWorld.version,2); assert.equal(restored.textWorld.revision,25); assert.equal(restored.textWorld.player.posture,'crouching'); assert.equal(restored.textWorld.player.heldToolId,'lamp');
  assert(restored.textWorld.entities.door.components.openable.isOpen); assert.deepEqual(restored.textWorld.entities.crate.components.container.items,[]); assert.deepEqual(restored.inventory,s.inventory);
  assert(!textWorldActions(restored).some(c=>/explore:crate|collect:crate/.test(c.action.optionId)));
  assert.throws(()=>migrateTextWorld({...v1,entities:null}));
  const raw=session(initial()); delete raw.state.textWorld; assert.equal(normalizeGameSession(raw).state.textWorld,null);
  assert(!GameActionSchema.safeParse({type:'text_world',command:'input',text:'상자를 열어'}).success);
});

test('distant, hidden, unknown and disconnected operations fail without generating objects',()=>{
  const s=initial(),w=createSubwayTextWorld(),inventory=structuredClone(s.inventory);
  for (const a of [{type:'TAKE',target:'food'},{type:'OPEN',target:'crate'},{type:'MOVE',target:'storage'},{type:'TAKE',target:'invented'}]) assert(resolveWorldActions(w,s,[a]).interrupted);
  assert.deepEqual(s.inventory,inventory); assert.equal(w.elapsedSeconds,0);
});

test('GameService hides world internals, serializes duplicate grouped collections and rejects bypass actions',async()=>{
  let stored=session(initial()); let calls=0;
  const repository={withGameLock:async(_id,op)=>op(),loadGame:async()=>structuredClone(stored),saveGame:async s=>{stored=structuredClone(s);},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
  const service=new GameService(repository,undefined,undefined,undefined,undefined,async c=>{calls++;return fallbackNarration(c);});
  let snap=await service.performAction(stored.id,{type:'text_world',command:'enter'}); assert.equal(snap.state.textWorld,null); assert(!JSON.stringify(snap.currentScene).includes('미개봉 물병'));
  const act=async id=>{snap=await service.performAction(stored.id,snap.availableActions.find(c=>c.action.optionId===id).action);};
  await act('explore:crate'); const take=snap.availableActions.find(c=>c.action.optionId==='collect:crate').action;
  const before=stored.state.inventory.waterBottle??0;
  const results=await Promise.allSettled([service.performAction(stored.id,take),service.performAction(stored.id,take)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1); assert.equal(stored.state.inventory.waterBottle,before+1); assert.equal(calls,3);
  await assert.rejects(service.performAction(stored.id,{type:'travel',targetId:'shelter'}),/탐색을 마치/);
  await assert.rejects(service.performAction(stored.id,{type:'text_world',command:'choose',optionId:'take:food',revision:stored.state.textWorld.revision}),/선택할 수 없는/);
});

test('reachable exploration states offer 2–5 useful intentions without recaps and retain a real route out',async()=>{
  const s=initial(); await enter(s); const queue=[s],seen=new Set(); let inspected=0;
  while(queue.length && inspected<140) {
    const state=queue.shift(),w=state.textWorld;
    const key=JSON.stringify([w.player,Object.values(w.entities).map(e=>e.components),w.observations]);
    if(seen.has(key)) continue; seen.add(key); inspected++;
    const choices=textWorldActions(state); assert(choices.length>=2&&choices.length<=5,choices.map(c=>c.label).join(','));
    assert(choices.some(c=>['leave','travel:office','travel:corridor','defocus','emerge:crate'].includes(c.action.optionId)));
    assert(!choices.some(c=>c.action.optionId==='overview'));
    for(const c of choices.filter(c=>!['overview','leave'].includes(c.action.optionId))) {
      const next=structuredClone(state); await performTextWorldAction(next,c.action,'test',narrator); queue.push(next);
    }
  }
  assert(inspected>=50);
});

test('first-person boundary rejects addressed-player prose and malformed narrator output without losing outcomes',async()=>{
  const s=initial(); await enter(s); const context=directNarrative(s.textWorld);
  assert.deepEqual(context.voice,{person:'first',selfReference:'나',tense:'present',omitSubject:true});
  const ids=context.requiredFacts.map(f=>f.id);
  assert.equal(validateNarration(context,{paragraphs:[{text:'당신은 방 안으로 들어선다.',factIds:ids},{text:'당신의 눈에 상자가 보인다.',factIds:ids}]}),null);
  await choose(s,'explore:crate');const before=s.inventory.waterBottle??0;
  await performTextWorldAction(s,action(s,'collect:crate'),'test',async()=>({paragraphs:['당신은 물건을 챙긴다.','몸을 일으킨다.'],source:'llm'}));
  assert.equal(s.inventory.waterBottle,before+1);assert.equal(s.textWorld.source,'template');assert(!s.textWorld.lastParagraphs.join(' ').includes('당신'));
  assert.equal(s.textWorld.player.posture,'crouching');
});

test('switching on light after a dark arrival requires the newly revealed layout; surveying must report its findings',async()=>{
  const s=initial();await enter(s);await unlockDoor(s);await choose(s,'equip:lamp');switchLight(s,true);await choose(s,'travel:corridor');
  await choose(s,'travel:storage');await choose(s,'light:lamp');
  const w=s.textWorld; delete w.knowledge['layout:storage']; let context;
  switchLight(s,true);
  assert(w.knowledge['layout:storage']);assert.match(w.lastParagraphs.join(' '),/선반/);
  await performTextWorldAction(s,action(s,'survey:storage'),'test',async c=>{context=structuredClone(c);return fallbackNarration(c);});
  assert(context.requiredFacts.some(f=>f.kind==='surface'&&f.targetId==='storage'));
  assert.match(w.lastParagraphs.join(' '),/선반|바닥/);
});

test('a collected light stays off until enabled from inventory before entering an unvisited dark room',async()=>{
  const s=initial();await enter(s);await unlockDoor(s);await choose(s,'equip:lamp');switchLight(s,true);await choose(s,'light:lamp');
  assert(!textWorldActions(s).some(c=>c.action.optionId==='travel:corridor'));switchLight(s,true);
  const id=action(s,'travel:corridor');await performTextWorldAction(s,id,'test',narrator);
  assert.equal(s.textWorld.player.zone,'corridor');assert.equal(s.textWorld.entities.lamp.components.light.on,true);
  assert.deepEqual(s.textWorld.events.map(e=>e.type),['MOVE']);
});

test('authored footsteps follow movement and never play during still collection; custom crowded rooms still cap choices and preserve return',async()=>{
  const s=initial();await enter(s);await unlockDoor(s);await choose(s,'equip:lamp');switchLight(s,true);let c;
  await performTextWorldAction(s,action(s,'travel:corridor'),'test',async context=>{c=structuredClone(context);return fallbackNarration(context);});
  assert(c.optionalFacts.some(f=>f.id.startsWith('ambient:corridor')));
  await choose(s,'travel:storage');
  const w=s.textWorld;
  for(let i=0;i<8;i++) { const box=structuredClone(w.entities.cache);box.id='extraBox'+i;box.components.container.items=[];w.entities[box.id]=box; }
  const choices=textWorldActions(s);assert(choices.length>=3&&choices.length<=5);assert(choices.some(c=>c.action.optionId==='travel:corridor'));
  // Other unopened objects compete for one semantic slot; inspecting them makes room for the rest.
  for(let i=0;i<8&&!textWorldActions(s).some(c=>c.action.optionId==='explore:cache');i++) {
    const other=textWorldActions(s).find(c=>c.action.optionId.startsWith('explore:extraBox'));
    assert(other,'An unseen object remains reachable');await choose(s,other.action.optionId);
    if(!textWorldActions(s).some(c=>c.action.optionId==='explore:cache'))await choose(s,'defocus');
  }
  await choose(s,'explore:cache');await choose(s,'collect:cache');
  c=directNarrative(w);assert(!c.optionalFacts.some(f=>f.id.startsWith('ambient:')));
  assert(!textWorldActions(s).some(c=>['more','back'].includes(c.action.optionId)));
});

test('rendering guards distinguish retained posture from invented posture and keep the two station doorways separate',async()=>{
  const {hasContradictoryAction}=require('../.server-dist/game/text-world/narrator');
  const s=initial();await enter(s);await choose(s,'explore:crate');await choose(s,'collect:crate');
  let c=directNarrative(s.textWorld);
  assert(hasContradictoryAction(c,'상자 앞에 쪼그리고 앉는다.'));
  assert(!hasContradictoryAction(c,'쪼그리고 앉은 채 물병을 챙긴다.'));
  await unlockDoor(s);await choose(s,'equip:lamp');switchLight(s,true);await choose(s,'travel:corridor');await choose(s,'travel:office');
  c=directNarrative(s.textWorld);
  assert(hasContradictoryAction(c,'대합실로 통하는 철문이 있는 역무실로 돌아온다.'));
  assert(!hasContradictoryAction(c,'철문을 지나 역무실로 돌아와 대합실로 통하는 입구를 바라본다.'));
  assert(c.requiredFacts.some(f=>f.kind==='connection'&&f.data.to==='정비 복도'));
  const recap=storedRecap(s);assert.equal(recap.length,1);
  assert.match(recap[0],/비어 있었/);assert.match(recap[0],/정비 복도 사이/);
});

test('a changed room or inventory cannot be represented by scenery alone, even when fact IDs claim coverage',async()=>{
 const {hasContradictoryAction}=require('../.server-dist/game/text-world/narrator');
 const s=initial();await enter(s);await unlockDoor(s);await choose(s,'equip:lamp');switchLight(s,true);await choose(s,'travel:corridor');await choose(s,'travel:office');
 const context=directNarrative(s.textWorld);
 const prose='손에 든 손전등의 빛줄기에 역무실 입구 맞은편에 열려 있는 철문과 정비 복도로 이어지는 어두운 통로가 비친다.';
 assert(hasContradictoryAction(context,prose));
 assert.equal(validateNarration(context,{paragraphs:[{text:prose,factIds:[...context.requiredFacts,...context.optionalFacts].map(f=>f.id)}]}),null);
 assert.match(fallbackNarration(context).paragraphs[0],/철문 안쪽으로 돌아온다/);
});


test('the locked office door requires discovering and collecting its floor key before unlocking', async()=>{
 const s=initial();await enter(s);const w=s.textWorld;
 assert(w.entities.door.components.openable.locked);
 assert(!visibleEntities(w).some(e=>e.id==='doorKey'));
 assert(!JSON.stringify(directNarrative(w)).includes('철문 열쇠'));
 assert(!textWorldActions(s).some(c=>/doorKey|unlock:/.test(c.action.optionId)));
 await choose(s,'open:door');assert.equal(w.events.at(-1).type,'STOPPED');assert(!w.entities.door.components.openable.isOpen);
 assert(!textWorldActions(s).some(c=>c.action.optionId==='open:door'));
 const before=s.inventory.ironDoorKey??0;
 await choose(s,'inspect:floor');
 assert.match(w.lastParagraphs.join(' '),/열쇠/);assert.equal(s.inventory.ironDoorKey??0,before);
 assert(visibleEntities(w).some(e=>e.id==='doorKey'));
 const take=action(s,'take:doorKey');await performTextWorldAction(s,take,'test',narrator);
 assert.equal(s.inventory.ironDoorKey,before+1);
 assert(s.systemNoteEntries.some(e=>e.type==='delta'&&e.subject==='item'&&e.itemId==='ironDoorKey'&&e.amount===1));
 await assert.rejects(performTextWorldAction(s,take,'test',narrator),/상황이 바뀌/);
 await choose(s,'unlock:door');
 assert(!w.entities.door.components.openable.locked);assert(w.entities.door.components.openable.isOpen);
 assert.equal(s.inventory.ironDoorKey,before+1);assert(!w.observations.door.blocked);
 assert.deepEqual(w.events.slice(-2).map(e=>e.type),['UNLOCK','OPEN']);
 assert.match(w.lastParagraphs.join(' '),/잠금/);
 await choose(s,'equip:lamp');switchLight(s,true);await choose(s,'travel:corridor');await choose(s,'travel:office');
 assert(!textWorldActions(s).some(c=>['inspect:floor','take:doorKey','unlock:door'].includes(c.action.optionId)));
});

test('hidden keys cannot be taken or revealed just by approaching, and inspection stops before collection',()=>{
 const s=initial(),w=createSubwayTextWorld();
 w.player.near='door';assert(validateWorldAction(w,s,{type:'UNLOCK',target:'door'}));
 assert(resolveWorldActions(w,s,[{type:'OPEN',target:'door'}]).interrupted);
 resolveWorldActions(w,s,[{type:'MOVE',target:'floor'}]);directNarrative(w);
 assert(!visibleEntities(w).some(e=>e.id==='doorKey'));
 assert(validateWorldAction(w,s,{type:'TAKE',target:'doorKey'}));
 const result=resolveWorldActions(w,s,[{type:'INSPECT',target:'floor'},{type:'MOVE',target:'doorKey'},{type:'TAKE',target:'doorKey'}]);
 assert(result.discovery);assert.equal(w.entities.doorKey.components.position.zone,'office');
 assert.equal(s.inventory.ironDoorKey??0,0);
 w.entities.door.components.openable.keyId='wrongKey';w.player.near='door';s.inventory.ironDoorKey=1;
 assert(validateWorldAction(w,s,{type:'UNLOCK',target:'door'}));
});

test('older office saves gain the puzzle once, preserving opened doors and all collected resources',async()=>{
 const s=initial();await enter(s);await choose(s,'explore:crate');await choose(s,'collect:crate');
 const old=structuredClone(s.textWorld);delete old.entities.floor;delete old.entities.doorKey;
 delete old.entities.door.components.openable.keyId;old.entities.door.components.openable.locked=false;
 const migrated=migrateTextWorld(old);assert(migrated.entities.door.components.openable.locked);assert(migrated.entities.doorKey);
 assert.deepEqual(migrated.entities.crate.components.container.items,[]);
 assert.deepEqual(migrateTextWorld(migrated),migrated);
 old.entities.door.components.openable.isOpen=true;
 const visited=migrateTextWorld(old);assert(visited.entities.door.components.openable.isOpen);assert(!visited.entities.door.components.openable.locked);
 s.textWorld=migrated;await findKey(s);await choose(s,'unlock:door');
 const restored=normalizeGameSession(JSON.parse(JSON.stringify(session(s)))).state;
 assert.equal(restored.inventory.ironDoorKey,1);assert(restored.textWorld.entities.door.components.openable.isOpen);
 assert(!textWorldActions(restored).some(c=>c.action.optionId==='take:doorKey'));
});
