const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState}=require('../.server-dist/game/rules');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {createSubwayTextWorld,migrateTextWorld}=require('../.server-dist/game/text-world/world');
const {resolveWorldActions}=require('../.server-dist/game/text-world/engine');
const {observeWorldEvent}=require('../.server-dist/game/text-world/observers');
const {createNpcDialogueGenerator}=require('../.server-dist/game/npc-dialogue-pipeline');
const {runtimeSocialProfile}=require('../.server-dist/game/npc-social');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
function fixture(zone='concourse') {
 const state=createInitialGameState();state.location='subway';state.textWorld=createSubwayTextWorld();state.inventory={crudeAxe:1};state.toolDurability.crudeAxe=8;state.stats.energy=15;
 const world=state.textWorld;world.player.near='crate';world.player.position='left-wall';
 world.observations.crate={stages:['surface'],inspected:true,collected:false};world.entities.shumi_presence.components.position.zone=zone;
 return {state,world};
}
const memory=f=>f.state.npcDialogue.conversations.shumi;
const act=(f,...actions)=>resolveWorldActions(f.world,f.state,actions);

test('a person outside hears work through the room graph without knowing its actor, contents or private inventory',()=>{
 const f=fixture();act(f,{type:'USE_TOOL',target:'crate',toolItemId:'crudeAxe',technique:'cut'});
 const known=memory(f).observations;assert(known.length);assert(known.every(o=>o.sense==='heard'&&!o.actorKnown));
 assert(!JSON.stringify(known).match(/물병|고철 조각|플레이어|crudeAxe|scrapMetal|나무 상자/));
 assert.equal(memory(f).affinity,0);
 const once=structuredClone(memory(f));for(const event of f.world.events)observeWorldEvent(f.world,f.state,event);
 assert.deepEqual(memory(f),once,'an observer cursor prevents duplicated memories');
});

test('quiet actions and attenuated sound across a closed door remain unknown',()=>{
 const quiet=fixture();act(quiet,{type:'OPEN',target:'crate'});assert.equal(memory(quiet).observations.length,0);
 const distant=fixture('storage');act(distant,{type:'USE_TOOL',target:'crate',toolItemId:'crudeAxe',technique:'cut'});
 assert.equal(memory(distant).observations.length,0);
});

test('witnessed damage to owned property affects only its owner; cover and darkness prevent attribution',()=>{
 const seen=fixture('office');seen.world.entities.crate.components.ownership={npcId:'shumi'};
 act(seen,{type:'USE_TOOL',target:'crate',toolItemId:'crudeAxe',technique:'cut'});
 assert.equal(memory(seen).affinity,-2);assert(memory(seen).observations.some(o=>o.sense==='seen'&&o.actorKnown));
 assert(seen.world.events.some(e=>e.type==='NPC_REACTION'&&e.after.dialogue.includes('제 물건')));
 for(const mode of ['cover','dark']) {
  const f=fixture('office');f.world.entities.crate.components.ownership={npcId:'shumi'};
  if(mode==='cover'){f.world.player.coverId='crate';f.world.player.relation='behind';f.world.player.posture='crouching';}
  else f.world.rooms.office.light=false;
  if(mode==='dark') {
   // A known still-visible glowing target permits the player's work without lighting the room for an observer.
   const event={id:'event:100',type:'USE_TOOL',at:0,origin:'player',actorId:'player',targetId:'crate',before:{ownerNpcId:'shumi'},after:{destroyed:false}};
   observeWorldEvent(f.world,f.state,event);
  } else act(f,{type:'USE_TOOL',target:'crate',toolItemId:'crudeAxe',technique:'cut'});
  assert.equal(memory(f).affinity,0);assert(!memory(f).observations.some(o=>o.actorKnown));
 }
});

test('old rooms acquire the external observer once while preserving items and explicit closed boundaries',()=>{
 const f=fixture();delete f.world.rooms.concourse;delete f.world.entities.shumi_presence;
 f.world.rooms.office.neighbors=f.world.rooms.office.neighbors.filter(id=>id!=='concourse');
 f.world.entities.water.components.position={zone:'player'};f.world.entities.water.inventoryRegistered=true;f.state.inventory.waterBottle=1;
 const upgraded=migrateTextWorld(JSON.parse(JSON.stringify(f.world)));
 assert(upgraded.rooms.concourse.outsideExploration);assert.equal(upgraded.entities.water.components.position.zone,'player');
 assert.equal(Object.values(migrateTextWorld(upgraded).entities).filter(e=>e.components.actor?.npcId==='shumi').length,1);
 assert.deepEqual(f.state.inventory,{crudeAxe:1,waterBottle:1});
});

test('only scoped experiences reach the single dialogue request, and saves and further exchanges preserve them',async()=>{
 const f=fixture();act(f,{type:'USE_TOOL',target:'crate',toolItemId:'crudeAxe',technique:'cut'});
 const state=GameStateSchema.parse(JSON.parse(JSON.stringify(f.state))),requests=[];
 const profile=runtimeSocialProfile('shumi',buildRuntimeRegistry(state));
 const generator=createNpcDialogueGenerator(async request=>{requests.push(request);throw Error('mock failure');},()=>true);
 const result=await generator({gameId:'npc-world-test',profile,memory:state.npcDialogue.conversations.shumi,context:{location:{id:'subway',name:'대합실',summary:'대합실',sceneTitle:'대합실',sceneParagraphs:profile.visibleDetails},player:{day:1,phase:'morning',recentLog:[]}},visitCount:1,turnNumber:0,selectedChoice:null});
 assert.equal(requests.length,1);assert.equal(requests[0].payload.worldExperience.observations[0].actorKnown,false);
 assert(!JSON.stringify(requests[0].payload).includes('radioBattery'));assert.match(result.scene.dialogue,/소리가 들린/);
 const {applyNpcDialogueGeneration}=require('../.server-dist/game/npc-dialogue');applyNpcDialogueGeneration(state,result,{newVisit:true});
 assert.equal(state.npcDialogue.conversations.shumi.observations.length,memory(f).observations.length);
});