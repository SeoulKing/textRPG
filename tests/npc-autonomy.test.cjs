const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState,advanceGameSeconds}=require('../.server-dist/game/rules');
const {createSubwayTextWorld,migrateTextWorld,visibleEntities}=require('../.server-dist/game/text-world/world');
const {advancePersistentWorlds}=require('../.server-dist/game/world-time');
const {resolveWorldActions}=require('../.server-dist/game/text-world/engine');
const {relocateEntity}=require('../.server-dist/game/text-world/spatial');
const {directNarrative}=require('../.server-dist/game/text-world/perception');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {npcWorldContext}=require('../.server-dist/game/text-world/observers');
const {ActorRoutineSchema}=require('../.server-dist/game/schemas/actor');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {textRoomIssues}=require('../.server-dist/game/text-world/validation');
const {defaultTextRooms}=require('../.server-dist/game/text-world/definitions');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {GameService}=require('../.server-dist/game/service');
const {createNpcDialogueGenerator}=require('../.server-dist/game/npc-dialogue-pipeline');
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,sorted(v[k])])):v;
function fixture(){const state=createInitialGameState();state.location='subway';state.sceneId='subway_repeat_intro';state.flags.opening_seen=true;state.textWorld=createSubwayTextWorld();state.inventory={cannedFood:2};state.stats={hp:10,mind:10,energy:15};
 const world=state.textWorld,actor=world.entities.shumi_presence;actor.components.actor.life.hunger=80;actor.components.actor.life.remainingSeconds=5;return {state,world,actor};}
function tick(f,seconds){advanceGameSeconds(f.state,seconds,{actionWorld:f.world});}
function foodOnFloor(f){const food=f.world.entities.food;relocateEntity(f.world,food,{zone:'office'});return food;}
function gate(f,{locked=false,blocked=false}={}) {f.world.entities.test_gate={id:'test_gate',name:'연결문',description:'연결문이다.',details:{anchor:'test_gate',placement:'두 방 사이',outline:'연결문',surface:'연결문이다.'},components:{position:{zone:'concourse'},portal:{from:'concourse',to:'office'},openable:{isOpen:false,locked}}};
 if(blocked)f.world.entities.barrier={id:'barrier',name:'막는 판자',description:'길을 막는 판자다.',components:{position:{zone:'concourse',relativeTo:'test_gate',relation:'blocking'},physical:{mass:10,volume:8,opaque:true,movable:true,blocksPassage:true}}};return f.world.entities.test_gate;}
function copy(f){const state=structuredClone(f.state);state.textWorld=migrateTextWorld(sorted(state.textWorld));return {state,world:state.textWorld,actor:state.textWorld.entities.shumi_presence};}
test.beforeEach(t=>{t.mock.method(global,'fetch',async()=>{throw Error('No external generation in autonomy tests')});process.env.ENABLE_LLM_WORLD_PLANNER='false';process.env.ENABLE_LLM_BACKGROUND_GENERATION='false';});

test('a hungry survivor walks, eats one real item, and rests without consuming player inventory',()=>{
 const f=fixture(),food=foodOnFloor(f),inventory=structuredClone(f.state.inventory);tick(f,5);assert.equal(f.actor.components.position.zone,'office');assert.equal(food.components.position.zone,'office');
 tick(f,5);assert.equal(food.components.position.zone,'office');assert.equal(f.actor.components.position.relativeTo,food.id);tick(f,5);assert.equal(food.components.position.zone,'consumed');assert.equal(f.actor.components.actor.life.hunger,45);assert.deepEqual(f.state.inventory,inventory);assert.equal(f.world.events.filter(e=>e.type==='NPC_CONSUME').length,1);
 tick(f,5);assert.equal(f.actor.components.position.zone,'concourse');assert.equal(f.actor.components.actor.life.mode,'REST');assert(f.state.npcDialogue.conversations.shumi.observations.some(e=>e.sense==='self'&&e.eventType==='NPC_CONSUME'));
 const restored=copy(f);tick(restored,120);assert.equal(restored.world.entities.food.components.position.zone,'consumed');assert.equal(restored.world.events.filter(e=>e.type==='NPC_CONSUME').length,1);
});

test('one long advance and saved split advances have identical decisions, clocks and self memories',()=>{
 const a=fixture();foodOnFloor(a);const b=copy(a);tick(a,75);tick(b,7);const c=copy(b);tick(c,68);
 assert.deepEqual(c.actor.components,a.actor.components);assert.deepEqual(c.world.events,a.world.events);assert.deepEqual(c.state.npcDialogue.conversations.shumi,a.state.npcDialogue.conversations.shumi);assert.deepEqual(c.world.entities.food,a.world.entities.food);
});

test('NPCs continue offscreen but unseen movement and meals are not rendered as witnessed facts',()=>{
 const f=fixture();foodOnFloor(f);f.world.active=false;f.state.location='shelter';const revision=f.world.revision;advanceGameSeconds(f.state,20);
 assert.equal(f.world.entities.food.components.position.zone,'consumed');assert(f.world.revision>revision);assert(f.world.events.every(e=>e.witnessed===false));assert.equal(directNarrative(f.world).results.length,0);
 assert(f.state.npcDialogue.conversations.shumi.observations.some(e=>e.eventType==='NPC_CONSUME'));assert.deepEqual(f.state.inventory,{cannedFood:2});
});

test('closed doors cost an opening action while locked and blocked paths prevent NPC passage',()=>{
 const f=fixture(),door=gate(f);foodOnFloor(f);tick(f,5);assert(!door.components.openable.isOpen);assert.equal(f.actor.components.position.relativeTo,door.id);tick(f,5);assert(door.components.openable.isOpen);assert.equal(f.actor.components.position.zone,'concourse');assert(f.world.events.some(e=>e.type==='OPEN'&&e.after.actorKnown===false));const opened=directNarrative(f.world).results.find(e=>e.type==='OPEN');assert(opened);assert.equal(opened.actorId,undefined);assert.equal(opened.after.actorName,undefined);assert.match(fallbackNarration(directNarrative(f.world)).paragraphs.join(' '),/연결문이 반대편에서 열린다/);
 tick(f,5);assert.equal(f.actor.components.position.zone,'office');tick(f,10);assert.equal(f.world.entities.food.components.position.zone,'consumed');
 for(const options of [{locked:true},{blocked:true}]){const b=fixture();gate(b,options);foodOnFloor(b);tick(b,90);assert.equal(b.actor.components.position.zone,'concourse');assert.equal(b.world.entities.food.components.position.zone,'office');assert(!b.world.events.some(e=>e.type==='ACTOR_MOVE'));}
});

test('search opens actual containers using the NPC viewpoint without granting the player discoveries',()=>{
 const f=fixture();relocateEntity(f.world,f.world.entities.food,{zone:'crate',relation:'inside'});f.world.player.zone='concourse';f.world.player.near=null;const observed=structuredClone(f.world.observations);tick(f,25);
 assert(f.world.entities.crate.components.openable.isOpen);assert.equal(f.world.entities.food.components.position.zone,'consumed');assert.deepEqual(f.world.observations,observed);
 const open=f.world.events.findIndex(e=>e.type==='OPEN'&&e.targetId==='crate'),eat=f.world.events.findIndex(e=>e.type==='NPC_CONSUME');assert(open>=0&&eat>open);assert.equal(f.actor.components.position.zone,'concourse');
});

test('another owner, fixed stock and a carried item are excluded from autonomous scavenging',()=>{
 for(const kind of ['owner','stock','legacy-stock','carried']){const f=fixture(),food=foodOnFloor(f);if(kind==='owner')food.components.ownership={npcId:'oldCook'};if(kind==='stock'){relocateEntity(f.world,food,{zone:'crate',relation:'inside'});f.world.entities.crate.components.stockNode={nodeId:'native_stock'};}if(kind==='legacy-stock'){f.world.entities.subway_signal_box={...structuredClone(f.world.entities.crate),id:'subway_signal_box'};relocateEntity(f.world,food,{zone:'subway_signal_box',relation:'inside'});}if(kind==='carried'){relocateEntity(f.world,food,{zone:'player'});food.inventoryRegistered=true;}
  const inventory=structuredClone(f.state.inventory);tick(f,120);assert.notEqual(food.components.position.zone,'consumed');assert.deepEqual(f.state.inventory,inventory);assert(!f.world.events.some(e=>e.type==='NPC_CONSUME'));}
});

test('danger drives a real retreat and remembered danger prevents immediately returning to it',()=>{
 const f=fixture();f.world.entities.enemy={id:'enemy',name:'위협하는 사람',description:'위협하는 사람이다.',components:{position:{zone:'concourse'},combatant:{encounterId:'test',hostile:true,hp:5,maxHp:5}}};
 tick(f,5);assert.equal(f.actor.components.position.zone,'office');assert.equal(f.actor.components.actor.life.mode,'ESCAPE');assert.deepEqual(f.actor.components.actor.life.threats,[{zone:'concourse',until:301}]);
 const restored=copy(f);tick(restored,90);assert.equal(restored.actor.components.position.zone,'office');assert(restored.actor.components.actor.life.threats.some(t=>t.zone==='concourse'));assert(!restored.world.events.some(e=>e.type==='ACTOR_MOVE'&&e.after.zone==='concourse'));
 const b=fixture();gate(b,{blocked:true});b.world.entities.enemy=structuredClone(f.world.entities.enemy);tick(b,5);assert.equal(b.actor.components.position.zone,'concourse');assert.equal(b.actor.components.actor.life.mode,'ESCAPE');assert(!b.world.events.some(e=>e.type==='ACTOR_MOVE'));
});

test('rest restores fatigue and a held conversation reserves the NPC without wall-clock simulation',()=>{
 const f=fixture();f.actor.components.actor.life.hunger=20;f.actor.components.actor.life.fatigue=80;tick(f,300);assert.equal(f.actor.components.actor.life.fatigue,79);
 const active={npcId:'shumi',turnNumber:1,currentScene:{}};f.state.npcDialogue.active=active;f.actor.components.actor.life.hunger=80;foodOnFloor(f);tick(f,60);assert.equal(f.actor.components.actor.life.mode,'INTERACT');assert.equal(f.actor.components.position.zone,'concourse');assert.equal(f.world.entities.food.components.position.zone,'office');
 f.state.npcDialogue.active=null;tick(f,5);assert.equal(f.actor.components.actor.life.mode,'REST','fatigue still overrides searching');
});

test('room authoring rejects invalid routine destinations and unknown food, and old saves retain progress',()=>{
 const rooms=defaultTextRooms(),items=new Set(Object.keys(buildRuntimeRegistry().items)),actor=rooms.find(r=>r.id==='concourse').entities.find(e=>e.components.actor);assert.equal(textRoomIssues(rooms,items).length,0);
 actor.components.actor.routine.roamZones.push('missing');actor.components.actor.routine.foodItemIds=['unknown'];assert(textRoomIssues(rooms,items).some(i=>i.message.includes('생활 구역')));assert(textRoomIssues(rooms,items).some(i=>i.message.includes('식량')));
 const f=fixture();f.world.entities.crate.components.openable.isOpen=true;f.world.entities.food.components.position.zone='consumed';delete f.actor.components.actor.life;delete f.actor.components.actor.routine;const restored=migrateTextWorld(f.world);assert(restored.entities.shumi_presence.components.actor.routine);assert(restored.entities.shumi_presence.components.actor.life);assert(restored.entities.crate.components.openable.isOpen);assert.equal(restored.entities.food.components.position.zone,'consumed');
});

test('the actual service keeps JSONB choices stable and a gifted meal becomes later NPC consumption with no extra generation',async()=>{
 const f=fixture();f.actor.components.position.zone='office';f.world.player.near=f.actor.id;f.world.player.focusEntityId=f.actor.id;f.world.player.position=f.actor.id;
 let saved={id:'npc-life',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state:f.state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}},snapshot,narrations=0,dialogues=0,seq=0,lastInput;
 const repo={withGameLock:async(_id,fn)=>fn(),loadGame:async()=>normalizeGameSession(sorted(structuredClone(saved))),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s))},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const fallback=createNpcDialogueGenerator(undefined,()=>false),service=new GameService(repo,undefined,undefined,undefined,async input=>{dialogues++;lastInput=input;return fallback(input)},async c=>{narrations++;return fallbackNarration(c)});
 const rows=()=>[...snapshot.availableActions,...(snapshot.exploration?.generalActions??[]),...(snapshot.exploration?.targets??[]).flatMap(t=>t.actions)];
 async function poll(){snapshot=await service.getState('npc-life');}async function choose(predicate){const row=rows().find(predicate);assert(row,'expected offered action '+rows().map(r=>r.action.optionId??r.id));const requestId='life-'+(++seq);snapshot=await service.performAction('npc-life',row.action,{requestId});return {action:row.action,requestId};}
 const gameplay=s=>({actor:s.textWorld.entities.shumi_presence,clock:s.worldElapsedMs,elapsed:s.textWorld.elapsedSeconds,events:s.textWorld.events,inventory:s.inventory,memory:s.npcDialogue.conversations});await poll();const first=structuredClone(gameplay(saved.state));await poll();assert.deepEqual(gameplay(saved.state),first);assert.equal(narrations+dialogues,0);
 await choose(r=>r.action.optionId==='talk:shumi');assert.equal(dialogues,1);assert.match(lastInput.context.actor.placement,/역무실/);assert(!lastInput.context.location.sceneParagraphs.join(' ').includes('기둥'));
 const given=await choose(r=>r.action.type==='npc_dialogue'&&r.action.command==='give'&&r.action.itemId==='cannedFood');assert.equal(dialogues,2);assert.equal(saved.state.inventory.cannedFood,1);assert.equal(saved.state.npcDialogue.conversations.shumi.inventory.cannedFood,1);
 const after=structuredClone(saved.state);snapshot=await service.performAction('npc-life',given.action,{requestId:given.requestId});assert.deepEqual(saved.state,after);assert.equal(dialogues,2);
 await choose(r=>r.action.type==='npc_dialogue'&&r.action.command==='leave');await choose(r=>r.action.optionId==='focus:floor');
 const world=saved.state.textWorld;assert.equal(saved.state.npcDialogue.conversations.shumi.inventory.cannedFood,0);assert.equal(saved.state.inventory.cannedFood,1);assert(world.events.some(e=>e.type==='NPC_CONSUME'));assert.equal(dialogues,2);assert.equal(narrations,1);assert.equal(world.entities.shumi_presence.components.actor.life.mode,'REST');const prose=snapshot.currentScene.paragraphs.join(' ');assert.match(prose,/슈미가 캔 음식 1개를 먹고 그 자리에 머물며 쉰다/);assert.equal((prose.match(/자리에 머물며 쉰다/g)||[]).length,1);assert(!prose.includes('주변을 살피고 있다'));
 const ids=rows().map(r=>r.action.optionId??r.id).sort();await poll();assert.deepEqual(rows().map(r=>r.action.optionId??r.id).sort(),ids);assert.equal(narrations,1);
});

test('two independent survivors cannot both consume the same world meal after save-order changes',()=>{
 const f=fixture(),other=structuredClone(f.actor);other.id='cook_actor';other.name='노파 배식 담당';other.components.actor.npcId='oldCook';f.world.entities[other.id]=other;
 f.state.dynamicContent.people.oldCook={...buildRuntimeRegistry(f.state).people.oldCook,locationId:'subway'};foodOnFloor(f);const restored=copy(f);tick(restored,30);
 assert.equal(restored.world.events.filter(e=>e.type==='NPC_CONSUME').length,1);assert.equal(restored.world.entities.food.components.position.zone,'consumed');assert.deepEqual(restored.state.inventory,{cannedFood:2});
 const meals=Object.values(restored.state.npcDialogue.conversations).flatMap(m=>m.observations).filter(o=>o.sense==='self'&&o.eventType==='NPC_CONSUME');assert.equal(meals.length,1);
});

test('an observed danger and released attention react at the same boundary for long and split time',()=>{
 const a=fixture();a.world.entities.enemy={id:'enemy',name:'위협',description:'위협',components:{position:{zone:'concourse'},combatant:{encounterId:'test',hostile:true,hp:5,maxHp:5}}};a.actor.components.actor.life.remainingSeconds=60;
 const b=copy(a);tick(a,20);tick(b,3);tick(b,17);assert.deepEqual(a.actor.components,b.actor.components);assert.deepEqual(a.world.events,b.world.events);assert.equal(a.world.events.find(e=>e.type==='ACTOR_MOVE').at,1);
 const c=fixture();c.actor.components.actor.life.mode='INTERACT';c.actor.components.actor.life.remainingSeconds=60;foodOnFloor(c);const d=copy(c);tick(c,30);tick(d,2);tick(d,28);assert.deepEqual(c.actor.components,d.actor.components);assert.deepEqual(c.world.events,d.world.events);
});

test('NPC opening uses the same two-second cost and crosses before a three-second door closes',()=>{
 const f=fixture(),door=gate(f);door.components.openable.autoCloseSeconds=3;foodOnFloor(f);tick(f,15);
 assert.equal(f.actor.components.position.zone,'office');assert.equal(door.components.openable.isOpen,false);
 assert.equal(f.world.events.find(e=>e.type==='OPEN').at,10);assert.equal(f.world.events.find(e=>e.type==='ACTOR_MOVE'&&e.after.zone==='office').at,12);assert.equal(f.world.events.find(e=>e.type==='AUTO_CLOSE').at,13);
});
