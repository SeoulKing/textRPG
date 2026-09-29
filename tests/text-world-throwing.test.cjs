const test=require('node:test'),assert=require('node:assert/strict');
const {GameService}=require('../.server-dist/game/service');
const {createInitialGameState,performAction}=require('../.server-dist/game/rules');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {createNpcDialogueGenerator}=require('../.server-dist/game/npc-dialogue-pipeline');
const {createSubwayTextWorld}=require('../.server-dist/game/text-world/world');
const {worldDeparturePlan}=require('../.server-dist/game/text-world/departure');
const {GAME_MINUTE_MS}=require('../.server-dist/game/base-data');
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,sorted(v[k])])):v;
test.beforeEach(t=>{t.mock.method(global,'fetch',async()=>{throw Error('External requests disabled in concourse verification')});process.env.ENABLE_LLM_WORLD_PLANNER='false';process.env.ENABLE_LLM_BACKGROUND_GENERATION='false';});
async function fixture(setup=()=>{},narrator=fallbackNarration){
 const state=createInitialGameState();Object.assign(state,{location:'subway',sceneId:'subway_repeat_intro'});state.flags.opening_seen=true;state.stats={hp:9,mind:8,energy:15};await setup(state);
 let saved={id:'concourse-test',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}},snap,renders=0,encounters=0,npc=0,seq=0;
 const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>normalizeGameSession(sorted(structuredClone(saved))),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s))},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const fallback=createNpcDialogueGenerator(undefined,()=>false);
 const service=new GameService(repo,undefined,undefined,async()=>{encounters++;throw Error('Template encounter')},async c=>{npc++;return fallback(c)},async c=>{renders++;return narrator(c)});
 const f={service,get state(){return saved.state},get world(){return saved.state.textWorld},get snap(){return snap},get renders(){return renders},get encounters(){return encounters},get npc(){return npc},
 get rows(){return [...snap.availableActions,...(snap.exploration?.generalActions??[]),...(snap.exploration?.targets??[]).flatMap(t=>t.actions)]},
 async poll(){snap=await service.getState(saved.id);return snap},
 async raw(action,requestId='concourse-'+(++seq)){snap=await service.performAction(saved.id,action,{requestId});return {action,requestId}},
 async choose(id){const row=f.rows.find(r=>r.action.optionId===id||r.action.command===id||r.id===id);assert(row,'not offered '+id+'; '+f.rows.map(r=>r.action.optionId||r.action.command));return f.raw(row.action)}};
 await f.poll();return f;
}

const {startSubwayExpedition,descendSubwayFloor}=require('../.server-dist/game/subway-expedition');
const {beginSubwaySituation}=require('../.server-dist/game/subway-encounter');
const {expeditionFloorIds}=require('../.server-dist/game/text-world/expedition-floor-state');
const {combatGeometry,advanceCombatOpponent}=require('../.server-dist/game/text-world/combat-space');
const {interactionContext}=require('../.server-dist/game/text-world/interaction-context');
const {directNarrative}=require('../.server-dist/game/text-world/perception');
const {buildNarrationPrompt}=require('../.server-dist/game/text-world/narration-prompt');
async function battle(setup=()=>{}){const f=await fixture(setup);await f.choose('focus:subway_depth_stairs');await f.choose('journey:start_subway_expedition');return f;}
function combatRow(f,primary){const choices=f.state.subwayExpedition.currentFloorProgress.encounter.currentScene.choices;return f.rows.find(r=>choices.some(c=>c.intent.primary===primary&&r.action.optionId==='combat:'+c.id));}
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {resolveWorldActions,validateWorldAction}=require('../.server-dist/game/text-world/engine');
const {interactionOptions}=require('../.server-dist/game/text-world/affordances');
const {rootZone,relocateEntity}=require('../.server-dist/game/text-world/spatial');
const {holdEntity}=require('../.server-dist/game/text-world/hands');
const {transferCarriedEntities}=require('../.server-dist/game/text-world/inventory');
const {audibleSounds}=require('../.server-dist/game/text-world/simulation');
function throwingWorld(){
 const state=createInitialGameState();state.location='subway';state.inventory.waterBottle=3;
 const world=state.textWorld=createSubwayTextWorld();world.player.zone='office';world.rooms.corridor.light=true;
 const water=world.entities.water;water.components.portable.amount=3;water.inventoryRegistered=true;
 relocateEntity(world,water,{zone:'player'});holdEntity(world,water);
 world.entities.door.components.openable={isOpen:true,locked:false};
 return {state,world};
}
function throwAction(f,destination='corridor'){return interactionOptions(f.world,f.state).find(o=>o.id==='throw:water:'+destination)?.actions[0];}

test('a real stack loses exactly one owned item and leaves a recoverable projectile beyond an open passage',()=>{
 const f=throwingWorld(),before=structuredClone(f.state),action=throwAction(f);assert(action);assert.deepEqual(f.state,before);
 const result=resolveWorldActions(f.world,f.state,[action]);assert.equal(result.elapsedSeconds,3);assert(!result.interrupted);
 const event=f.world.events.find(e=>e.type==='THROW'),projectile=f.world.entities[event.after.projectileId];
 assert.equal(projectile.components.portable.amount,1);assert.equal(projectile.components.position.zone,'corridor');
 assert.equal(f.state.inventory.waterBottle,2);assert.equal(f.world.entities.water.components.portable.amount,2);assert.equal(f.world.player.heldItemId,'water');
 assert(audibleSounds(f.world).some(s=>/물병/.test(s.description)));assert(f.world.simulation.sounds.some(s=>s.sourceId===projectile.id&&s.zone==='corridor'));
 assert.deepEqual(event.after.inventoryDelta,{waterBottle:-1});
 assert(!resolveWorldActions(f.world,f.state,[{type:'MOVE',target:'corridor'},{type:'MOVE',target:projectile.id},{type:'TAKE',target:projectile.id}]).interrupted);
 assert.equal(f.state.inventory.waterBottle,3);assert(GameStateSchema.safeParse(f.state).success);
 const destination=structuredClone(f.world);destination.entities={};destination.player.heldItemId=null;destination.player.heldToolId=null;
 f.state.locationTextWorlds.other=destination;transferCarriedEntities(f.state,destination);transferCarriedEntities(f.state,f.world);
 assert.equal(f.state.inventory.waterBottle,3);assert.equal(Object.values(f.world.entities).filter(e=>e.components.portable?.itemId==='waterBottle'&&e.components.position.zone==='player').reduce((n,e)=>n+e.components.portable.amount,0),3);
});

test('closed, blocked, remote and unsupported throws are absent and leave inventory unchanged',()=>{
 const f=throwingWorld(),action=throwAction(f);f.world.entities.door.components.openable.isOpen=false;
 assert(!throwAction(f));assert(validateWorldAction(f.world,f.state,action));
 f.world.entities.door.components.openable.isOpen=true;
 f.world.entities.crate.components.position={zone:'office',relativeTo:'door',relation:'blocking'};
 assert(!throwAction(f));assert(validateWorldAction(f.world,f.state,{...action,destination:'storage'}));
 const water=f.world.entities.water;water.components.throwable={unitMass:3,sound:{description:'충돌 소리',intensity:1}};
 assert(!throwAction(f,'office'));delete water.components.throwable;
 f.world.player.heldItemId=null;assert(!throwAction(f,'office'));
 const before=structuredClone(f.state.inventory);assert(resolveWorldActions(f.world,f.state,[action]).interrupted);assert.deepEqual(f.state.inventory,before);
});

test('a door that closes during preparation stops the throw after paid time without losing a projectile',()=>{
 const f=throwingWorld(),action=throwAction(f),before=structuredClone(f.state.inventory);
 Object.assign(f.world.entities.door.components.openable,{autoCloseSeconds:2,remainingOpenSeconds:2});
 const result=resolveWorldActions(f.world,f.state,[{type:'WAIT',durationSeconds:4},action]);
 assert(result.interrupted);assert.equal(result.elapsedSeconds,4);assert.deepEqual(f.state.inventory,before);
 assert(!f.world.events.some(e=>e.type==='THROW'));assert.equal(f.world.events.at(-1).attemptedAction,'THROW');
});

test('throwing provisional loot debits only its own ledger and the final item releases the hand',()=>{
 const f=throwingWorld();f.state.subwayExpedition.active=true;f.state.subwayExpedition.runNumber=1;f.state.subwayExpedition.carriedLoot={waterBottle:1};
 const water=f.world.entities.water;water.components.portable.amount=1;water.expeditionLoot={runNumber:1,floorId:'test-floor'};
 const action=throwAction(f);assert(action);assert(!resolveWorldActions(f.world,f.state,[action]).interrupted);
 assert.equal(f.state.inventory.waterBottle,3);assert.equal(f.state.subwayExpedition.carriedLoot.waterBottle,undefined);assert.equal(f.world.player.heldItemId,null);
 assert.deepEqual(water.expeditionLoot,{runNumber:1,floorId:'test-floor'});assert.equal(water.components.position.zone,'corridor');
 assert(!resolveWorldActions(f.world,f.state,[{type:'MOVE',target:'corridor'},{type:'MOVE',target:water.id},{type:'TAKE',target:water.id}]).interrupted);
 assert.equal(f.state.subwayExpedition.carriedLoot.waterBottle,1);assert.equal(f.state.inventory.waterBottle,3);
});

test('a concealed throw diverts a combat opponent, uses one renderer, survives JSONB and cannot replay its item cost',async t=>{
 t.mock.method(Math,'random',()=>.99);const f=await battle(s=>{s.inventory.waterBottle=2;});const ids=expeditionFloorIds(f.state);
 const hold=f.rows.find(r=>r.action.optionId?.startsWith('hold:')&&r.label.includes('물병'));assert(hold);await f.raw(hold.action);
 await f.choose('hide:'+ids.prefix+'_cache1');
 const throwRow=f.rows.find(r=>r.action.optionId?.startsWith('throw:')&&r.action.optionId.endsWith(':'+ids.landing));assert(throwRow);
 assert(f.snap.availableActions.some(r=>r.action.optionId===throwRow.action.optionId));
 const before=structuredClone(f.state),renders=f.renders,receipt=await f.raw(throwRow.action,'throw-once-0001');
 assert.equal(f.renders,renders+1);assert.equal(f.state.inventory.waterBottle,1);assert.equal(f.state.stats.hp,before.stats.hp);
 assert.equal(f.world.entities[ids.prefix+'_opponent'].components.position.zone,ids.landing);
 const move=f.world.events.find(e=>e.type==='ACTOR_MOVE');assert.equal(move.after.reason,'sound');assert.equal(move.witnessed,true);
 assert.equal(f.world.elapsedSeconds-before.textWorld.elapsedSeconds,303);
 const projectile=f.world.events.find(e=>e.type==='THROW').after.projectileId;assert.equal(rootZone(f.world,f.world.entities[projectile]),ids.landing);
 const after=structuredClone(f.state);await f.raw(receipt.action,receipt.requestId);assert.deepEqual(f.state,after);assert.equal(f.renders,renders+1);
 await assert.rejects(f.raw(throwRow.action),/상황이 바뀌/);
 await f.choose('travel:'+ids.landing);await f.choose('take:'+projectile);assert.equal(f.state.inventory.waterBottle,2);
});

test('visible throwing does not distract an opponent and unobserved movement does not reveal the current room',async t=>{
 t.mock.method(Math,'random',()=>.99);const f=await battle(s=>{s.inventory.waterBottle=1;});const ids=expeditionFloorIds(f.state);
 await f.raw(f.rows.find(r=>r.action.optionId?.startsWith('hold:')&&r.label.includes('물병')).action);
 const row=f.rows.find(r=>r.action.optionId?.startsWith('throw:')&&r.action.optionId.endsWith(':'+ids.landing));assert(row);await f.raw(row.action);
 const enemy=f.world.entities[ids.prefix+'_opponent'];assert.equal(enemy.components.position.zone,ids.room);assert(!f.world.events.some(e=>e.type==='ACTOR_MOVE'));
 // There is deliberately no MOVE event or line of sight: the actor must not read the player's new zone.
 f.world.events=[];f.world.player.zone=ids.landing;f.world.entities[ids.door].components.openable.isOpen=false;f.world.simulation.sounds=[];
 assert.equal(advanceCombatOpponent(f.state),false);assert.equal(enemy.components.position.zone,ids.room);assert.equal(f.world.entities[ids.door].components.openable.isOpen,false);
});

test('sound investigation remembers its destination across a closed door and save; locked routes and hidden reactions stay private',async t=>{
 t.mock.method(Math,'random',()=>.99);const f=await battle(s=>{s.inventory.waterBottle=1;});const ids=expeditionFloorIds(f.state);
 await f.raw(f.rows.find(r=>r.action.optionId?.startsWith('hold:')&&r.label.includes('물병')).action);await f.choose('hide:'+ids.prefix+'_cache1');
 const row=f.rows.find(r=>r.action.optionId?.startsWith('throw:')&&r.action.optionId.endsWith(':'+ids.landing));assert(row);
 const source=f.world.player.heldItemId,before=structuredClone(f.state),door=f.world.entities[ids.door].components.openable;
 Object.assign(door,{autoCloseSeconds:2,remainingOpenSeconds:2});
 f.world.events=[];assert(!resolveWorldActions(f.world,f.state,[{type:'THROW',target:source,destination:ids.landing}]).interrupted);assert(!door.isOpen);
 const locked=structuredClone(f.state);locked.textWorld.entities[ids.door].components.openable.locked=true;
 assert.equal(advanceCombatOpponent(locked,before),false);assert(!locked.textWorld.entities[ids.door].components.openable.isOpen);
 assert.equal(advanceCombatOpponent(f.state,before),true);assert(door.isOpen);
 const enemyId=ids.prefix+'_opponent';assert.equal(f.world.entities[enemyId].components.position.zone,ids.room);
 assert.equal(f.world.entities[enemyId].components.combatant.awareness.investigation.zone,ids.landing);
 const restored=GameStateSchema.parse(sorted(JSON.parse(JSON.stringify(f.state))));restored.textWorld.events=[];
 assert.equal(advanceCombatOpponent(restored),true);assert.equal(restored.textWorld.entities[enemyId].components.position.zone,ids.landing);
 assert.equal(restored.textWorld.entities[enemyId].components.combatant.awareness.investigation,undefined);
 // The player leaves line of sight without supplying a new observed move; only the old known room can guide pursuit.
 restored.textWorld.player.zone='office';restored.textWorld.events=[];restored.textWorld.simulation.sounds=[];
 assert(advanceCombatOpponent(restored));assert.equal(restored.textWorld.entities[enemyId].components.position.zone,ids.room);
 assert.equal(restored.textWorld.events.at(-1).witnessed,false);
 assert(!directNarrative(restored.textWorld).results.some(e=>e.type==='ACTOR_MOVE'));
});

test('authored throwing components support an unnamed item without ID rules and validate mass and destination wording',()=>{
 const {TextEntitySchema}=require('../.server-dist/game/schemas/text-world');
 const {resolveChoiceLabels}=require('../.server-dist/game/text-world/choice-labels');
 const f=throwingWorld(),source=f.world.entities.water;
 source.components.portable.itemId=null;source.components.throwable={unitMass:.3,sound:{description:'작은 돌이 바닥에 닿는 소리',intensity:.6}};
 source.name='작은 돌';assert(TextEntitySchema.safeParse(source).success);assert(throwAction(f));
 source.components.throwable.unitMass=-1;assert(!TextEntitySchema.safeParse(source).success);
 const option={id:'throw:stone:corridor',label:'작은 돌 한 개를 복도 바닥으로 던진다',family:'DISTRACT',labelNames:['작은 돌'],defaultThought:'소리가 나면 그쪽을 돌아볼까.'};
 const c={nextChoices:[option]};
 assert.equal(resolveChoiceLabels(c,[{optionId:option.id,label:'작은 돌 한 개를 상대에게 던진다'}])[0].label,option.label);
 assert.equal(resolveChoiceLabels(c,[{optionId:option.id,label:'작은 돌 한 개를 복도 바닥에 던진다'}])[0].label,'작은 돌 한 개를 복도 바닥에 던진다');
});

test('an empty lightweight container can be thrown, while real contents and physical mass prevent it',()=>{
 const f=throwingWorld(),source=f.world.entities.water;source.components.portable.amount=1;f.state.inventory.waterBottle=1;
 source.components.container={items:[],capacity:3};source.components.openable={isOpen:true,locked:false};
 source.components.physical={mass:.7,volume:1,movable:true,opaque:true,blocksPassage:false};
 assert(throwAction(f));source.components.physical.mass=5;assert(!throwAction(f));source.components.physical.mass=.7;
 f.world.entities.payload={id:'payload',name:'내용물',description:'실제 내용물',components:{position:{zone:source.id,relation:'inside'},portable:{itemId:null,amount:1}}};source.components.container.items=['payload'];
 assert(!throwAction(f));delete f.world.entities.payload;source.components.container.items=[];
 const action=throwAction(f);assert(action);assert(!resolveWorldActions(f.world,f.state,[action]).interrupted);
 assert.equal(source.components.position.zone,'corridor');assert.deepEqual(source.components.container.items,[]);
});
