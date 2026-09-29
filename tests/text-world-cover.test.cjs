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
const {TextEntitySchema,TextWorldSchema}=require('../.server-dist/game/schemas/text-world');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {shelterTextRooms}=require('../.server-dist/game/text-world/shelter-definitions');
const {createLocationTextWorld,migrateTextWorld,visibleEntities}=require('../.server-dist/game/text-world/world');
const {resolveWorldActions,validateWorldAction}=require('../.server-dist/game/text-world/engine');
const {interactionOptions}=require('../.server-dist/game/text-world/affordances');
const {currentCover,canProvideCover,relocateEntity}=require('../.server-dist/game/text-world/spatial');
const {combatCanSeePlayer}=require('../.server-dist/game/text-world/combat-space');
const {perceiveWorld}=require('../.server-dist/game/text-world/perception');
const {nextNarrativeChoices,resolveChoiceLabels}=require('../.server-dist/game/text-world/choice-labels');
const {hasContradictoryAction}=require('../.server-dist/game/text-world/narrator');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
function desk(zone='office') {
 const entity=structuredClone(shelterTextRooms()[0].entities[1]);entity.id='independent_desk';entity.name='목재 책상';entity.components.position={zone};entity.details.anchor=entity.id;
 entity.components.structure.integrity=5;entity.components.physical=structuredClone(entity.components.structure.intactPhysical);return entity;
}
function coverWorld() {
 const state=createInitialGameState();state.location='subway';state.textWorld=createSubwayTextWorld();state.stats.energy=15;state.inventory={crudeAxe:1};state.toolDurability.crudeAxe=8;
 const world=state.textWorld,table=desk();world.entities[table.id]=table;
 return {state,world,table};
}
function act(f,...actions){f.world.events=[];return resolveWorldActions(f.world,f.state,actions);}
function hide(f){const choice=interactionOptions(f.world,f.state).find(o=>o.id==='hide:'+f.table.id+':under');assert(choice,'authored under space is offered');return act(f,...choice.actions);}

test('cover positions require authored geometry; legacy behind cover and explicit opt-out remain valid',()=>{
 const f=coverWorld();assert(!canProvideCover(f.world,f.table));assert(canProvideCover(f.world,f.table,'under'));assert(canProvideCover(f.world,f.world.entities.crate));
 assert(!interactionOptions(f.world,f.state).some(o=>o.id==='hide:crate:under'));
 for(const patch of [{opaque:false},{volume:1},{coverRelations:[]}]){Object.assign(f.table.components.physical,patch);assert(!interactionOptions(f.world,f.state).some(o=>o.id.startsWith('hide:'+f.table.id)));f.table.components.physical=structuredClone(f.table.components.structure.intactPhysical);}
 f.table.components.structure.integrity=0;assert(!canProvideCover(f.world,f.table,'under'));f.table.components.structure.integrity=5;
 f.table.components.position.zone='crate';assert(!canProvideCover(f.world,f.table,'under'));f.table.components.position.zone='office';
 assert(!TextEntitySchema.safeParse({...f.table,components:{...f.table.components,physical:{...f.table.components.physical,coverRelations:['inside']}}}).success);
 f.world.player.near='crate';act(f);const before=JSON.stringify(f.world.player);assert(act(f,{type:'HIDE',target:'crate',relation:'under'}).interrupted);assert.equal(JSON.stringify(f.world.player),before);
});

test('one hide intent preserves hands, position and saved cover while occluding the tabletop',()=>{
 const f=coverWorld(),w=f.world;w.entities.water.components.position={zone:f.table.id,relation:'on'};
 assert(visibleEntities({...w,player:{...w.player,near:f.table.id}}).some(e=>e.id==='water'));
 const lamp=w.entities.lamp;lamp.components.position={zone:'player'};lamp.inventoryRegistered=true;f.state.inventory.flashlight=1;w.player.heldToolId=lamp.id;lamp.components.light.on=true;
 assert.equal(hide(f).elapsedSeconds,7);assert.equal(w.player.posture,'crouching');assert.equal(w.player.heldToolId,'lamp');assert(lamp.components.light.on);assert.equal(currentCover(w).relation,'under');
 assert(!visibleEntities(w).some(e=>e.id==='water'));assert(validateWorldAction(w,f.state,{type:'PUT',target:'lamp',destination:f.table.id,relation:'on'}));assert(!perceiveWorld(w).some(x=>x.targetId==='water'));
 const c=directNarrative(w);assert.equal(c.player.positionLabel,'목재 책상 아래');assert(c.requiredFacts.some(x=>x.id==='cover:'+f.table.id&&x.data.relation==='under'));
 assert.match(fallbackNarration(c).paragraphs.join(' '),/책상 아래/);assert(!hasContradictoryAction(c,fallbackNarration(c).paragraphs.join(' ')));
 const restored=migrateTextWorld(sorted(JSON.parse(JSON.stringify(w))));assert.equal(currentCover(restored).relation,'under');assert.equal(restored.player.heldToolId,'lamp');
 const options=interactionOptions(restored,f.state);assert(options.some(o=>o.id==='emerge:'+f.table.id));assert(!options.some(o=>o.id.startsWith('hide:'+f.table.id)));
});

test('standing or walking first exits below furniture; invalid destinations do not make the player emerge',()=>{
 const f=coverWorld();hide(f);assert(act(f,{type:'MOVE',target:'missing'}).interrupted);assert(currentCover(f.world));
 assert.equal(act(f,{type:'POSTURE',posture:'standing'}).elapsedSeconds,3);assert.deepEqual(f.world.events.filter(e=>e.origin!=='simulation').map(e=>e.type),['EMERGE','POSTURE']);
 assert.equal(f.world.events[0].after.posture,'crouching');assert.equal(currentCover(f.world),undefined);assert.equal(f.world.player.coverId,null);
 hide(f);const context=directNarrative(f.world);assert(hasContradictoryAction(context,'목재 책상 뒤에 몸을 낮춰 숨는다.'));
 assert.equal(act(f,{type:'MOVE',target:'crate'}).elapsedSeconds,7);assert.equal(f.world.events[0].type,'EMERGE');assert.equal(f.world.player.posture,'crouching');assert.equal(f.world.player.near,'crate');
 hide(f);const exit=interactionOptions(f.world,f.state).find(o=>o.id==='emerge:'+f.table.id);assert.equal(act(f,...exit.actions).elapsedSeconds,3);assert.match(fallbackNarration(directNarrative(f.world)).paragraphs.join(' '),/아래에서.*빠져나온다/);
});

test('cover invalidates on destruction, relocation, and stale saves without erasing items or crouching',()=>{
 const f=coverWorld();hide(f);f.table.components.structure.integrity=1;
 assert(!act(f,{type:'USE_TOOL',target:f.table.id,toolItemId:'crudeAxe',technique:'cut'}).interrupted);assert.equal(f.table.components.structure.integrity,0);assert.equal(currentCover(f.world),undefined);assert.equal(f.world.player.coverId,null);assert.equal(f.world.player.posture,'crouching');
 f.table.components.structure.integrity=5;f.table.components.physical=structuredClone(f.table.components.structure.intactPhysical);hide(f);
 relocateEntity(f.world,f.table,{zone:'office',relativeTo:'crate',relation:'beside'});assert.equal(f.world.player.coverId,null);assert.equal(f.world.player.posture,'crouching');
 hide(f);const stored=structuredClone(f.world);stored.entities[f.table.id].components.structure.integrity=0;
 const migrated=migrateTextWorld(stored);assert.equal(migrated.player.coverId,null);assert.equal(migrated.player.posture,'crouching');assert.deepEqual(Object.keys(migrated.entities).sort(),Object.keys(stored.entities).sort());
 stored.player.coverId='missing';assert.doesNotThrow(()=>directNarrative(migrateTextWorld(stored)));
});

test('NPC vision and combat use the same valid cover but hiding never erases known player positions',async t=>{
 t.mock.method(Math,'random',()=>.4);const f=await battle();const table=desk(f.world.player.zone);f.world.entities[table.id]=table;await f.poll();
 const hp=f.state.stats.hp,renders=f.renders;const receipt=await f.choose('hide:'+table.id+':under');assert.equal(f.renders,renders+1);assert.equal(f.state.stats.hp,hp);assert.equal(combatGeometry(f.state).coverRelation,'under');
 const enemy=Object.values(f.world.entities).find(e=>e.components.combatant?.hostile);assert(!combatCanSeePlayer(f.world,enemy));assert.equal(enemy.components.combatant.awareness.lastKnownPlayerZone,f.world.player.zone);
 const seen=structuredClone(f.state);await f.raw(receipt.action,receipt.requestId);assert.deepEqual(f.state,seen);assert.equal(f.renders,renders+1);
 const beforeIds=f.rows.map(r=>r.action.optionId).sort();await f.poll();assert.deepEqual(f.rows.map(r=>r.action.optionId).sort(),beforeIds);assert.equal(f.renders,renders+1);
 assert(f.snap.availableActions.length<=5);const attack=combatRow(f,'attack');assert(attack);await f.raw(attack.action);assert.equal(f.renders,renders+2);assert.equal(f.world.player.posture,'standing');assert.equal(f.world.player.coverId,null);assert.equal(combatGeometry(f.state).counterPenalty,0);assert(f.state.stats.hp<hp);
 assert(f.world.events.some(e=>e.type==='EMERGE'));assert.equal(f.world.events.filter(e=>e.type==='COMBAT').length,1);
});

test('the actual shelter workbench gains its under space only after a paid repair, and JSONB saves keep that progress',async()=>{
 const f=await fixture(state=>{state.location='shelter';state.sceneId='shelter_first_intro';state.inventory={woodPlank:2,scrapMetal:2,cordage:1};const world=createLocationTextWorld(shelterTextRooms());world.active=true;state.locationTextWorlds.shelter=world;world.observations.shelter_workbench={stages:['outline','surface'],inspected:true,collected:false};});
 assert(!f.rows.some(o=>o.action.optionId==='hide:shelter_workbench:under'));await f.choose('repair:shelter_workbench');assert.equal(f.state.inventory.woodPlank??0,0);assert.equal(f.state.locationTextWorlds.shelter.entities.shelter_workbench.components.structure.integrity,5);
 const calls=f.renders,paid=structuredClone(f.state.inventory),receipt=await f.choose('hide:shelter_workbench:under');assert.equal(f.renders,calls+1);assert.equal(currentCover(f.state.locationTextWorlds.shelter).relation,'under');
 await f.raw(receipt.action,receipt.requestId);assert.equal(f.renders,calls+1);assert.deepEqual(f.state.inventory,paid);await f.poll();assert.equal(currentCover(f.state.locationTextWorlds.shelter).relation,'under');
 await f.choose('emerge:shelter_workbench');assert.equal(f.state.locationTextWorlds.shelter.player.posture,'standing');assert.equal(f.state.locationTextWorlds.shelter.player.coverId,null);
});

test('unchanged old workbenches migrate without undoing repairs or overwriting custom cover definitions',async()=>{
 for(const intact of [false,true]){
  const f=await fixture(state=>{state.location='shelter';state.sceneId='shelter_first_intro';const world=createLocationTextWorld(shelterTextRooms());world.active=true;const bench=world.entities.shelter_workbench,s=bench.components.structure;
   bench.description='판재와 가로대를 연결한 목재 작업대다.';bench.details.surface='판재 아래에 가로대와 이음새가 보인다.';s.intactPhysical.opaque=false;delete s.intactPhysical.coverRelations;if(intact){s.integrity=5;bench.components.physical=structuredClone(s.intactPhysical);}state.locationTextWorlds.shelter=world;state.inventory.woodPlank=3;});
  const bench=f.state.locationTextWorlds.shelter.entities.shelter_workbench;assert.equal(bench.components.structure.integrity,intact?5:0);assert.deepEqual(bench.components.structure.intactPhysical.coverRelations,['under']);assert.equal(f.state.inventory.woodPlank,3);
  assert.equal(f.rows.some(o=>o.action.optionId==='hide:shelter_workbench:under'),intact);
 }
 const room=shelterTextRooms()[0],bench=room.entities[1];bench.details.surface='판재 아래에 가로대와 이음새가 보인다.';bench.components.structure.intactPhysical.coverRelations=[];
 const withoutPhysics=structuredClone(room);withoutPhysics.entities[1].description='판재와 가로대를 연결한 목재 작업대다.';delete withoutPhysics.entities[1].components.physical;delete withoutPhysics.entities[1].components.structure.intactPhysical.coverRelations;withoutPhysics.entities[1].components.structure.intactPhysical.opaque=false;assert.doesNotThrow(()=>createLocationTextWorld([withoutPhysics]));
 const custom=createLocationTextWorld([room]);assert.deepEqual(custom.entities.shelter_workbench.components.structure.intactPhysical.coverRelations,[]);assert.equal(custom.entities.shelter_workbench.details.surface,bench.details.surface);
});

test('LLM choice wording must preserve under versus behind and engine source remains authoritative',()=>{
 const f=coverWorld(),option=interactionOptions(f.world,f.state).find(o=>o.id.endsWith(':under'));const context=directNarrative(f.world);context.nextChoices=nextNarrativeChoices(f.world,[{...option,family:'COVER'}]);
 assert.equal(resolveChoiceLabels(context,[{optionId:option.id,label:'목재 책상 뒤로 몸을 낮춘다'}])[0].source,'template');
 assert.equal(resolveChoiceLabels(context,[{optionId:option.id,label:'목재 책상 밑으로 몸을 낮춰 숨는다'}])[0].source,'llm');
 hide(f);assert.match(buildNarrationPrompt(directNarrative(f.world)).userPrompt??JSON.stringify(buildNarrationPrompt(directNarrative(f.world))),/EMERGE|가구 아래/);
});

test('coming out below furniture can stop before a timed door closes without silently moving through it',()=>{
 const f=coverWorld();hide(f);const door=f.world.entities.door;Object.assign(door.components.openable,{isOpen:true,locked:false,autoCloseSeconds:1,remainingOpenSeconds:1});f.world.rooms.corridor.light=true;
 assert.equal(validateWorldAction(f.world,f.state,{type:'MOVE',target:'corridor'}),null);
 const result=act(f,{type:'MOVE',target:'corridor'});assert(result.interrupted);assert.equal(result.elapsedSeconds,2);assert.equal(f.world.player.zone,'office');assert.equal(f.world.player.posture,'crouching');assert.equal(f.world.player.coverId,null);
 assert(f.world.events.some(e=>e.type==='EMERGE'));assert(f.world.events.some(e=>e.type==='AUTO_CLOSE'));assert(!f.world.events.some(e=>e.type==='MOVE'));assert.equal(f.world.events.at(-1).attemptedAction,'MOVE');
});

test('a witness hears anonymous throws under the desk and can identify the throw after emerging',()=>{
 const f=coverWorld(),w=f.world;w.entities.shumi_presence.components.position.zone='office';const water=w.entities.water;water.components.position={zone:'player'};water.components.portable.amount=2;water.inventoryRegistered=true;w.player.heldItemId=water.id;f.state.inventory.waterBottle=2;hide(f);
 assert(!act(f,{type:'THROW',target:water.id,destination:'office'}).interrupted);let observations=f.state.npcDialogue.conversations.shumi.observations;assert(observations.some(o=>o.sense==='heard'));assert(!observations.some(o=>o.actorKnown));
 act(f,{type:'EMERGE',target:f.table.id});assert(!act(f,{type:'THROW',target:water.id,destination:'office'}).interrupted);observations=f.state.npcDialogue.conversations.shumi.observations;assert(observations.some(o=>o.sense==='seen'&&o.eventType==='THROW'&&o.actorKnown));assert.equal(f.state.inventory.waterBottle??0,0);
});
