const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState,advanceGameSeconds,advanceGameMinutes,performAction,syncClock}=require('../.server-dist/game/rules');
const {createSubwayTextWorld}=require('../.server-dist/game/text-world/world');
const {resolveWorldActions}=require('../.server-dist/game/text-world/engine');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {directNarrative}=require('../.server-dist/game/text-world/perception');
const {advancePersistentWorlds}=require('../.server-dist/game/world-time');
const {GAME_MINUTE_MS}=require('../.server-dist/game/base-data');
function fixture(){const s=createInitialGameState();s.flags.opening_seen=true;s.stats={hp:10,mind:10,energy:15};s.textWorld=createSubwayTextWorld();s.textWorld.active=false;s.textWorld.entities.lamp.components.light={on:true,fuelSeconds:180};s.textWorld.entities.door.components.openable={isOpen:true,locked:false,remainingOpenSeconds:20};return s}
test('travel and ordinary activities advance absent places without witnessing their events',()=>{
 const s=fixture(),w=s.textWorld;performAction(s,{type:'travel',targetId:'forest'});
 assert.equal(w.elapsedSeconds,900);assert.equal(w.entities.lamp.components.light.on,false);assert(!w.entities.door.components.openable.isOpen);
 assert(w.events.every(e=>e.witnessed===false));assert(!directNarrative(w).results.some(e=>['AUTO_CLOSE','LIGHT_EXPIRED'].includes(e.type)));
});
test('a text action advances active and absent places exactly once, retaining its causal event',()=>{
 const s=fixture(),w=s.textWorld;s.location='subway';w.active=true;const away=createSubwayTextWorld();away.active=false;s.locationTextWorlds.other=away;
 const result=resolveWorldActions(w,s,[{type:'WAIT',durationSeconds:30}]);assert.equal(result.elapsedSeconds,30);assert.equal(w.elapsedSeconds,30);assert.equal(away.elapsedSeconds,30);
 assert.equal(w.events.find(e=>e.type==='AUTO_CLOSE').causedBy,w.events[0].id);assert.equal(w.entities.lamp.components.light.fuelSeconds,150);
});
test('fractional action time survives saved partitioning without drifting from one minute of crafting time',()=>{
 let split=fixture();const whole=structuredClone(split);advanceGameMinutes(whole,1);
 for(let i=0;i<60;i++){advanceGameSeconds(split,1);if(i===25)split=GameStateSchema.parse(JSON.parse(JSON.stringify(split)))}
 assert.equal(split.worldElapsedMs,GAME_MINUTE_MS);assert.equal(split.textWorld.elapsedSeconds,whole.textWorld.elapsedSeconds);assert.equal(split.textWorld.entities.lamp.components.light.fuelSeconds,whole.textWorld.entities.lamp.components.light.fuelSeconds);
 assert(Math.abs(split.clockRemainderMs??0)<1e-6);
});
test('polling and reloads do not consume light fuel or simulate network waiting time',()=>{
 let s=fixture();advanceGameSeconds(s,10);s=GameStateSchema.parse(JSON.parse(JSON.stringify(s)));const before=JSON.stringify(s.textWorld);
 syncClock(s,Date.now()+86400000);assert.equal(JSON.stringify(s.textWorld),before);assert.equal(s.textWorld.entities.lamp.components.light.fuelSeconds,170);
});
test('simulation projections do not advance registered worlds and duplicate references are advanced once',()=>{
 const s=fixture(),w=s.textWorld;s.location='subway';w.active=true;const before=structuredClone(s);resolveWorldActions(w,s,[{type:'LOOK'}],{advanceTime:false});assert.equal(w.elapsedSeconds,0);assert.equal(s.worldElapsedMs,before.worldElapsedMs);
 s.locationTextWorlds.alias=w;advancePersistentWorlds(s,.4);// Aliases point to the same instantiated world and must not advance it twice.
 assert.equal(w.elapsedSeconds,0);assert.equal(w.simulation.fractionalSeconds,.4);
});
test('fatal condition boundaries stop both player and world clocks at the actual elapsed time',()=>{
 const s=fixture();s.location='subway';s.textWorld.active=true;s.stats.hp=1;s.conditions.injury={level:1,damageProgress:119/120};
 const r=resolveWorldActions(s.textWorld,s,[{type:'WAIT',durationSeconds:60}]);assert(s.isGameOver);assert(r.interrupted);assert.equal(r.elapsedSeconds,30);assert.equal(s.textWorld.elapsedSeconds,30);assert.equal(s.textWorld.entities.lamp.components.light.fuelSeconds,150);
});
