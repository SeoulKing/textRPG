const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState,advanceGameSeconds,performAction,syncClock,forecastShelterSleep}=require('../.server-dist/game/rules');
const {GAME_MINUTE_MS,REAL_DAY_MS,EXHAUSTION_TICK_MS}=require('../.server-dist/game/base-data');
const {relieveExhaustion}=require('../.server-dist/game/survival-pressure');
const {conditionCards}=require('../.server-dist/game/health-conditions');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {GameStateSchema,StateSnapshotSchema}=require('../.server-dist/game/schemas');
const {createSubwayTextWorld}=require('../.server-dist/game/text-world/world');
const minute=GAME_MINUTE_MS;
function fresh(){const s=createInitialGameState();Object.assign(s.flags,{opening_seen:true,prologue_old_woman_seen:true,intro_seen_shelter:true,first_canned_food_started:true});s.stats={hp:10,mind:10,energy:0};return s}
function minutes(s,n){return advanceGameSeconds(s,n*60)/60}
const close=(a,b)=>assert(Math.abs(a-b)<.002,`${a} != ${b}`);

test('the final energy hour is not retroactively counted as exhaustion',()=>{
 const s=fresh();s.stats.energy=1;minutes(s,60);assert.equal(s.stats.energy,0);assert.equal(s.exhaustionElapsedMs,0);
 minutes(s,719);assert.equal(s.exhaustionLevel,0);minutes(s,1);assert.equal(s.exhaustionLevel,1);assert.equal(s.exhaustionElapsedMs,0);
});
test('daybreak and action splitting preserve the same survival pressure',()=>{
 const once=fresh(),split=fresh();once.stats.energy=15;split.stats.energy=15;minutes(once,30*60);for(const n of [59,1,301,400,679,360])minutes(split,n);
 for(const key of ['worldElapsedMs','autoEnergyElapsedMs','exhaustionElapsedMs','exhaustionLevel'])close(once[key],split[key]);
 assert.equal(once.exhaustionLevel,1);assert.equal(once.exhaustionElapsedMs,3*60*minute);assert.equal(once.stats.hp,5);assert.equal(once.stats.mind,0);assert.deepEqual(once.stats,split.stats);
 const partial=fresh();partial.worldElapsedMs=REAL_DAY_MS-10*minute;partial.stats.energy=1;partial.autoEnergyElapsedMs=55*minute;minutes(partial,20);
 assert.equal(partial.day,2);assert.equal(partial.exhaustionElapsedMs,15*minute);assert.equal(partial.autoEnergyElapsedMs,15*minute);
});
test('energy pauses accumulated burden and explicit relief removes its partial level too',()=>{
 const s=fresh();minutes(s,6*60);s.stats.energy=2;minutes(s,60);assert.equal(s.exhaustionElapsedMs,6*60*minute);
 relieveExhaustion(s,1);assert.equal(s.exhaustionElapsedMs,0);assert.equal(s.exhaustionLevel,0);
 s.exhaustionLevel=2;s.exhaustionElapsedMs=6*60*minute;relieveExhaustion(s,1);assert.equal(s.exhaustionLevel,1);assert.equal(s.exhaustionElapsedMs,6*60*minute);
 s.inventory.hotMeal=1;performAction(s,{type:'use_item',itemId:'hotMeal'});assert.equal(s.exhaustionLevel,0);assert.equal(s.exhaustionElapsedMs,0);assert(s.stats.energy>0);assert.equal(s.inventory.hotMeal,undefined);assert.match(s.systemNote,/탈진 Lv1 → Lv0/);
});
test('fatal exhaustion cuts off world simulation at its exact boundary',()=>{
 const s=fresh();s.exhaustionLevel=3;s.exhaustionElapsedMs=EXHAUSTION_TICK_MS-13*minute;s.textWorld=createSubwayTextWorld();s.textWorld.active=false;
 close(minutes(s,24*60),13);assert.equal(s.isGameOver,true);assert.equal(s.stageClear,false);assert.equal(s.exhaustionLevel,4);assert.match(s.gameOverReason,/탈진/);close(s.textWorld.elapsedSeconds,13*60);
 const saved=structuredClone(s);assert.equal(minutes(s,60),0);assert.deepEqual(s,saved);GameStateSchema.parse(s);
});
test('sleep forecasts fatal exhaustion and cannot heal away the failure',()=>{
 const s=fresh();s.worldElapsedMs=12*60*minute;s.exhaustionLevel=3;s.exhaustionElapsedMs=EXHAUSTION_TICK_MS-30*minute;
 const before=structuredClone(s),forecast=forecastShelterSleep(s);assert.deepEqual(s,before);assert(forecast.isFatal);assert.equal(forecast.exhaustionAfter,4);
 performAction(s,{type:'content_action',actionId:'sleep_at_shelter'});assert(s.isGameOver);close(s.worldElapsedMs-before.worldElapsedMs,30*minute);assert.equal(s.stats.hp,10);
});
test('work interrupted by exhaustion pays inputs once and cannot award the unfinished result',()=>{
 const s=fresh();s.flags.shelter_crafting_open=true;s.sceneId='shelter_crafting_menu';s.inventory.wood=1;s.exhaustionLevel=3;s.exhaustionElapsedMs=EXHAUSTION_TICK_MS-5*minute;
 performAction(s,{type:'content_choice',choiceId:'craft_firewood'});assert(s.isGameOver);assert.equal(s.inventory.wood,undefined);assert.equal(s.inventory.firewood,undefined);assert.equal(s.lastActivity.status,'interrupted');close(s.lastActivity.elapsedMinutes,5);assert.equal(s.activityRevision,1);
});
test('old living saves keep their progress without dying on load; new saves retain the fatal level',()=>{
 const s=fresh();s.saveVersion=20;s.exhaustionLevel=17;s.exhaustionElapsedMs=1234;s.inventory.wood=6;s.flags.rescue_signal_ready=true;
 const raw={id:'pressure-save',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state:s,world:{}};
 const restored=normalizeGameSession(raw).state;assert.equal(restored.saveVersion,21);assert.equal(restored.exhaustionLevel,3);assert.equal(restored.exhaustionElapsedMs,1234);syncClock(restored);assert(!restored.isGameOver);assert.equal(restored.inventory.wood,6);assert(restored.flags.rescue_signal_ready);
 restored.exhaustionLevel=4;const current=normalizeGameSession({...raw,state:restored}).state;assert.equal(current.exhaustionLevel,4);syncClock(current);assert(current.isGameOver);
});
test('status cards distinguish paused exhaustion from timed injury damage',()=>{
 const s=fresh();s.exhaustionLevel=3;s.exhaustionElapsedMs=11*60*minute;
 const active=conditionCards(s)[0];assert.equal(active.kind,'exhaustion');assert.equal(active.nextDamageMinutes,null);assert.equal(active.nextWorseningMinutes,60);StateSnapshotSchema.shape.conditionCards.parse([active]);
 s.stats.energy=2;const paused=conditionCards(s)[0];assert.equal(paused.nextWorseningMinutes,null);
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync('app-api.js','utf8');const body=source.slice(source.indexOf('function healthConditionDetailsMarkup()'),source.indexOf('function statusDetailMarkup()'));
 const ctx={client:{snapshot:{conditionCards:[paused]}},formatMinutesLabel:n=>`${n}분`};vm.createContext(ctx);vm.runInContext(body,ctx);assert.match(ctx.healthConditionDetailsMarkup(),/기력이 남아 있어/);assert.doesNotMatch(ctx.healthConditionDetailsMarkup(),/항생제 1개/);
});
