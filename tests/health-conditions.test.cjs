const test = require('node:test');
const assert = require('node:assert/strict');
const { createInitialGameState, advanceGameMinutes, performAction, syncClock, forecastShelterSleep } = require('../.server-dist/game/rules');
const { GAME_MINUTE_MS, GAME_HOUR_MS, REAL_DAY_MS } = require('../.server-dist/game/base-data');
const { addHealthCondition, applyTreatment, conditionCards } = require('../.server-dist/game/health-conditions');
const { applyEffect, derivePlayer } = require('../.server-dist/game/state-utils');
const { GameStateSchema, EffectSchema } = require('../.server-dist/game/schemas');
const { normalizeGameSession } = require('../.server-dist/game/repository');
const { getEffectiveContentStudioDocument, buildWorldRegistryFromStudio } = require('../.server-dist/game/data/registry');
const { parseContentStudioDocument } = require('../.server-dist/game/content-studio');
const { setPreviewContentVersion, releasePreviewContentVersion } = require('../.server-dist/game/content-versions');
const { StudioPreviewService } = require('../.server-dist/game/studio-preview');
const { studioSetConditionChance, studioCreateRegionAction } = require('../content-outcome-editor');
const { studioSyncAction } = require('../content-story-library');
const { formatOutcomeHint } = require('../.server-dist/game/outcome-hint');
const { createSubwayBanditEncounter, setSubwayEncounterScene } = require('../.server-dist/game/subway-encounter');

function fresh() {
  const state = createInitialGameState();
  state.stats = { hp: 10, mind: 10, energy: 15 };
  state.flags.opening_seen = true;
  return state;
}
const close = (actual, expected) => assert(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function inflict(state, condition, level = 1) {
  for (let i=0;i<level;i++) addHealthCondition(state,condition,100);
}
function authored(effects) {
  const document = getEffectiveContentStudioDocument();
  const { action } = studioCreateRegionAction(document,'shelter','health_test_action','상태 시험');
  action.effects = effects;
  studioSyncAction(document,action);
  return { document, action };
}

test('new games and schema defaults never share mutable condition objects', () => {
  const first=fresh(),second=fresh();inflict(first,'injury');
  assert.equal(second.conditions.injury.level,0);
  const third=fresh();assert.equal(third.conditions.injury.level,0);
  const raw=structuredClone(second);delete raw.conditions;
  const a=GameStateSchema.parse(raw),b=GameStateSchema.parse(raw);
  a.conditions.infection.level=2;assert.equal(b.conditions.infection.level,0);
});

test('probability bounds, exact boundary and independent condition rolls', () => {
  for (const chancePercent of [-1,101,NaN,Infinity]) assert.equal(EffectSchema.safeParse({type:'add_condition',condition:'injury',chancePercent}).success,false);
  const state=fresh();
  const noRoll=()=>{throw Error('should not roll');};
  addHealthCondition(state,'injury',0,noRoll);
  assert.equal(state.conditions.injury.level,0);
  addHealthCondition(state,'injury',100,noRoll);
  addHealthCondition(state,'injury',20,()=>.2);
  assert.equal(state.conditions.injury.level,1);
  addHealthCondition(state,'injury',20,()=>.199999);
  assert.equal(state.conditions.injury.level,2);
  const rolls=[.19,.049];
  for (const [condition,chancePercent] of [['injury',20],['infection',5]]) applyEffect({type:'add_condition',condition,chancePercent},state,{rng:()=>rolls.shift(),skillUse:{skillId:'exploration'}});
  assert.equal(state.conditions.injury.level,3);
  assert.equal(state.conditions.infection.level,1);
  assert.equal(state.stats.hp,10);
});

test('every injury and infection level uses the specified one-HP interval', () => {
  for (const [kind,base] of [['injury',60],['infection',120]]) {
    for(let level=1;level<=3;level++){
      const state=fresh();inflict(state,kind,level);
      const interval=base/level;
      advanceGameMinutes(state,interval-1);assert.equal(state.stats.hp,10);
      advanceGameMinutes(state,1);assert.equal(state.stats.hp,9);
      assert.equal(conditionCards(state)[0].nextDamageMinutes,interval);
      GameStateSchema.parse(state);
    }
  }
});

test('condition pressure adds independently and is invariant to action subdivision', () => {
  const one=fresh();inflict(one,'injury');inflict(one,'infection');
  const split=structuredClone(one);
  advanceGameMinutes(one,120);
  for(const minutes of [5,17,33,25,40])advanceGameMinutes(split,minutes);
  assert.equal(one.stats.hp,7);assert.equal(split.stats.hp,7);
  close(one.conditions.injury.damageProgress,split.conditions.injury.damageProgress);
  close(one.conditions.infection.damageProgress,split.conditions.infection.damageProgress);
  close(one.conditions.infection.worseningElapsedMinutes,120);
});

test('infection worsens every six effective hours, never on another exposure or wall-clock sync', () => {
  const state=fresh();inflict(state,'infection');
  advanceGameMinutes(state,359);
  assert.equal(state.conditions.infection.level,1);
  advanceGameMinutes(state,1);
  assert.equal(state.conditions.infection.level,2);assert.equal(state.stats.hp,7);
  close(state.conditions.infection.worseningElapsedMinutes,0);
  advanceGameMinutes(state,20);inflict(state,'infection');
  close(state.conditions.infection.worseningElapsedMinutes,20);
  const conditions=structuredClone(state.conditions),hp=state.stats.hp,time=state.worldElapsedMs;
  syncClock(state,Date.now()+86400000);
  assert.deepEqual(state.conditions,conditions);assert.equal(state.stats.hp,hp);assert.equal(state.worldElapsedMs,time);
});

test('sleep applies 25% condition pressure and preserves the existing energy discount', () => {
  const state=fresh();state.worldElapsedMs=12*GAME_HOUR_MS;inflict(state,'injury');inflict(state,'infection');
  state.log=Array.from({length:20},()=>({timestampLabel:'1일차 06:00',message:'이전 기록'}));
  const before=structuredClone(state),forecast=forecastShelterSleep(state);
  assert.deepEqual(state,before);
  performAction(state,{type:'content_action',actionId:'sleep_at_shelter'});
  assert.equal(state.worldElapsedMs,REAL_DAY_MS);
  assert.equal(state.stats.hp,6);assert.equal(state.stats.energy,9);
  close(state.conditions.infection.worseningElapsedMinutes,180);
  assert.equal(forecast.conditionDamage,4);assert.equal(forecast.hpAfter,6);
  const normal=fresh();normal.worldElapsedMs=12*GAME_HOUR_MS;
  performAction(normal,{type:'content_action',actionId:'sleep_at_shelter'});
  assert.equal(normal.stats.energy,9);
});

test('short rest keeps full condition speed and never cures levels', () => {
  const state=fresh();inflict(state,'injury',3);
  performAction(state,{type:'content_action',actionId:'rest_light_at_shelter'});
  close(state.conditions.injury.damageProgress,.75);
  assert.equal(state.conditions.injury.level,3);
});

test('partial treatment preserves damage progress, antibiotics reset worsening, full cure clears progress', () => {
  const state=fresh();inflict(state,'injury',2);inflict(state,'infection',2);
  advanceGameMinutes(state,15);
  close(state.conditions.injury.damageProgress,.5);
  const infectionProgress=state.conditions.infection.damageProgress;
  applyTreatment(state,{injuryRelief:1,infectionRelief:1});
  close(state.conditions.injury.damageProgress,.5);
  close(state.conditions.infection.damageProgress,infectionProgress);
  assert.equal(state.conditions.infection.worseningElapsedMinutes,0);
  advanceGameMinutes(state,29);assert.equal(state.stats.hp,10);
  advanceGameMinutes(state,1);assert.equal(state.stats.hp,9);
  applyTreatment(state,{injuryRelief:1,infectionRelief:1});
  assert.deepEqual(state.conditions,fresh().conditions);
});

test('medicine consumes once, treats before its five minutes, and cannot be wasted at Lv0', () => {
  const state=fresh();state.inventory={bandage:2,antibiotics:1,painRelief:1};
  for(const itemId of ['bandage','antibiotics']){
    const before=structuredClone(state);
    assert.throws(()=>performAction(state,{type:'use_item',itemId}),/치료할/);
    assert.deepEqual(state.inventory,before.inventory);assert.equal(state.worldElapsedMs,before.worldElapsedMs);
  }
  inflict(state,'injury');state.conditions.injury.damageProgress=.99;state.stats.hp=1;
  performAction(state,{type:'use_item',itemId:'bandage'});
  assert.equal(state.stats.hp,1);assert.equal(state.isGameOver,false);assert.equal(state.inventory.bandage,1);
  assert.equal(state.worldElapsedMs,5*GAME_MINUTE_MS);assert.equal(state.conditions.injury.level,0);
  inflict(state,'infection',2);state.conditions.infection.worseningElapsedMinutes=359;
  performAction(state,{type:'use_item',itemId:'antibiotics'});
  assert.equal(state.conditions.infection.level,1);close(state.conditions.infection.worseningElapsedMinutes,5);
  performAction(state,{type:'use_item',itemId:'painRelief'});
  assert.equal(state.conditions.infection.level,1);assert.equal(state.stats.hp,3);
});

test('Lv4 is immediately fatal and effects after the fatal effect cannot heal or reward', () => {
  const state=fresh();inflict(state,'injury',3);
  applyEffect({type:'random_outcome',outcomes:[{weight:1,effects:[
    {type:'add_condition',condition:'injury',chancePercent:100},
    {type:'change_stat',stat:'hp',value:10},{type:'add_item',itemId:'bandage',amount:9}
  ]}]},state,{rng:()=>0});
  assert.equal(state.isGameOver,true);assert.match(state.gameOverReason,/부상.*Lv4/);
  assert.equal(state.stats.hp,10);assert.equal(state.inventory.bandage,undefined);
  assert.throws(()=>performAction(state,{type:'use_item',itemId:'bandage'}),/Lv4/);
  GameStateSchema.parse(state);
});

test('fatal sleep stops at the worsening instant and cannot grant the shelter bonus', () => {
  const state=fresh();state.worldElapsedMs=12*GAME_HOUR_MS;state.flags.shelter_wall_patch=true;
  inflict(state,'infection',3);state.conditions.infection.worseningElapsedMinutes=355;state.stats.hp=5;
  const forecast=forecastShelterSleep(state);
  performAction(state,{type:'content_action',actionId:'sleep_at_shelter'});
  assert.equal(state.isGameOver,true);assert.match(state.gameOverReason,/감염.*Lv4/);
  assert.equal(state.worldElapsedMs,12*GAME_HOUR_MS+20*GAME_MINUTE_MS);
  assert.equal(state.stats.hp,6);
  assert.equal(forecast.isFatal,true);assert.equal(forecast.hpAfter,6);
});

test('fatal continuous HP damage stops time and subsequent authored rewards', () => {
  const {document,action}=authored([{type:'advance_time',minutes:120},{type:'change_stat',stat:'hp',value:10},{type:'add_item',itemId:'bandage',amount:1}]);
  const id='health-fatal-order';const state=fresh();state.contentVersionId=setPreviewContentVersion(id,buildWorldRegistryFromStudio(document));
  inflict(state,'injury',3);state.stats.hp=1;
  try {
    performAction(state,{type:'content_action',actionId:action.id});
    assert.equal(state.stats.hp,0);assert.equal(state.isGameOver,true);
    assert.equal(state.worldElapsedMs,20*GAME_MINUTE_MS);assert.equal(state.inventory.bandage,undefined);
  } finally {releasePreviewContentVersion(id);}
});

test('old saves start healthy; new saves preserve both progress counters and player projection', () => {
  const state=fresh();inflict(state,'injury',2);inflict(state,'infection');
  advanceGameMinutes(state,17);
  const raw={id:'health-save',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{}};
  const restored=normalizeGameSession(JSON.parse(JSON.stringify(raw))).state;
  assert.deepEqual(restored.conditions,state.conditions);
  assert.deepEqual(derivePlayer(restored).conditions,state.conditions);
  assert(derivePlayer(restored).statusEffects.includes('injury'));
  delete raw.state.conditions;raw.state.saveVersion=19;
  assert.deepEqual(normalizeGameSession(raw).state.conditions,fresh().conditions);
});

test('Studio risk controls preserve order, serialize, and execute on an injected published registry', () => {
  const {document,action}=authored([{type:'advance_time',minutes:15}]);
  studioSetConditionChance(action,'injury',100);studioSetConditionChance(action,'infection',100);
  const order=action.effects.map(effect=>effect.type);
  studioSetConditionChance(action,'injury',25);assert.deepEqual(action.effects.map(effect=>effect.type),order);
  assert.throws(()=>studioSetConditionChance(action,'injury',101));
  studioSetConditionChance(action,'injury',100);studioSyncAction(document,action);
  const saved=parseContentStudioDocument(JSON.parse(JSON.stringify(document)));
  const registry=buildWorldRegistryFromStudio(saved),id='health-studio',state=fresh();
  state.contentVersionId=setPreviewContentVersion(id,registry);
  try{
    performAction(state,{type:'content_action',actionId:action.id});
    assert.equal(state.conditions.injury.level,1);assert.equal(state.conditions.infection.level,1);
    assert.equal(state.conditions.injury.damageProgress,0);
    assert.match(state.systemNote,/부상 Lv0 → Lv1/);
    assert.equal(registry.items.bandage.effects.injuryRelief,1);
    assert.equal(registry.items.antibiotics.effects.infectionRelief,1);
  }finally{releasePreviewContentVersion(id);}
});

test('branch-only risks execute only inside the selected branch and show conditional hints', () => {
  const effect={type:'random_outcome',outcomes:[
    {weight:50,result:'success',effects:[]},
    {weight:50,result:'failure',effects:[{type:'add_condition',condition:'infection',chancePercent:20}]}
  ]};
  const success=fresh();applyEffect(effect,success,{rng:()=>0});
  assert.equal(success.conditions.infection.level,0);
  const failure=fresh(),rolls=[.9,.1];applyEffect(effect,failure,{rng:()=>rolls.shift()});
  assert.equal(failure.conditions.infection.level,1);
  assert.match(formatOutcomeHint([effect],fresh()),/실패 시 감염 \+1단계 20%/);
});

test('Studio preview executes condition effects, preserves them on refresh, and supports undo', () => {
  const {document,action}=authored([{type:'add_condition',condition:'injury',chancePercent:100},{type:'advance_time',minutes:15}]);
  const service=new StudioPreviewService();
  try{
    const start=service.start(document,{locationId:'shelter',flags:{opening_seen:true,prologue_old_woman_seen:true,intro_seen_shelter:true,first_canned_food_started:true}});
    const next=service.step(start.id,{action:{type:'content_action',actionId:action.id}});
    assert.equal(next.conditionCards[0].level,1);
    const refresh=service.step(start.id,{document});
    assert.deepEqual(refresh.conditionCards,next.conditionCards);
    const undo=service.step(start.id,{undo:true});
    assert.deepEqual(undo.conditionCards,[]);
  }finally{service.dispose();}
});

test('combat accepts a condition-only medicine and applies the same five-minute treatment', () => {
  const state=fresh();state.location='subway';state.subwayExpedition.active=true;
  state.subwayExpedition.currentFloorProgress.phase='encounter';
  state.subwayExpedition.depth=1;
  state.subwayExpedition.currentFloorProgress.encounter=createSubwayBanditEncounter(1);
  const encounter=state.subwayExpedition.currentFloorProgress.encounter;
  state.inventory.bandage=1;inflict(state,'injury',2);
  setSubwayEncounterScene(state,{
    scenarioId:encounter.id,turnNumber:encounter.turnNumber,kind:encounter.kind,phase:encounter.stage,
    title:'치료 시험',paragraphs:['붕대를 꺼낸다.'],source:'template',generatedAt:new Date().toISOString(),
    choices:[{id:'treat',label:'붕대를 감는다',effectDescription:'부상 -1',postChoiceNarrative:['붕대를 감는다.'],
      intent:{primary:'use_item',style:'careful',target:'self',itemId:'bandage'},legacyActionToken:'use_item:bandage'}],
  });
  performAction(state,{type:'use_item',itemId:'bandage'});
  assert.equal(state.conditions.injury.level,1);assert.equal(state.inventory.bandage,undefined);
  close(state.conditions.injury.damageProgress,5/60);
  assert.equal(state.worldElapsedMs,5*GAME_MINUTE_MS);
});

test('fractional event boundaries remain serializable across repeated level changes', () => {
  const state=fresh();inflict(state,'injury');inflict(state,'infection');
  for(let i=0;i<24;i++){
    state.stats.hp=10;
    state.conditions.injury.level=i%3+1;
    state.conditions.infection.level=(i+1)%3+1;
    advanceGameMinutes(state,7);
    GameStateSchema.parse(state);
    assert.equal(Number.isInteger(state.worldElapsedMs),true);
  }
  assert(state.log.length<=20);
  assert.match(state.log[0].timestampLabel,/일차 \d\d:\d\d/);
});
