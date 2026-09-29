const test = require('node:test');
const assert = require('node:assert/strict');
const { createInitialGameState } = require('../.server-dist/game/rules');
const { evaluateCondition } = require('../.server-dist/game/state-utils');
const { GameStateSchema } = require('../.server-dist/game/schemas');
const { SkillProgressStateSchema, SkillUseSchema, CombatSkillDetailsSchema } = require('../.server-dist/game/schemas/skill-progression');
const { buildSkillProgressCards, normalizeSkillProgress } = require('../.server-dist/game/skill-progression');
const { createSubwayBanditEncounter, setSubwayEncounterScene, resolveSubwayBanditChoice, subwaySituationActionCatalog, acknowledgeSubwayBanditResult } = require('../.server-dist/game/subway-encounter');
const { returnFromSubwayExpedition } = require('../.server-dist/game/subway-expedition');

const thresholds = [0,50,120,210,320];
const threat = { id:'attack', kind:'attack', target:'player', method:'쇠막대를 휘두른다.', profile:'standard_attack' };
function fixture(xp = 0) {
  const state = createInitialGameState();
  state.location = 'subway';
  state.stats = {hp:10, mind:10, energy:15};
  state.skillProgress.combat.totalXp = xp;
  state.subwayExpedition.active = true;
  state.subwayExpedition.depth = 1;
  const progress = state.subwayExpedition.currentFloorProgress;
  progress.phase = 'encounter';
  progress.encounter = createSubwayBanditEncounter(1);
  return state;
}
function choose(state, token, rolls = [0], { primary, incoming = true } = {}) {
  const encounter = state.subwayExpedition.currentFloorProgress.encounter;
  encounter.pendingThreat = incoming ? structuredClone(threat) : null;
  const action = primary || (token === 'talk' ? 'persuade' : token === 'flee' ? 'retreat' : token === 'guard' ? 'defend' : token === 'observe' ? 'observe' : 'attack');
  setSubwayEncounterScene(state, {
    scenarioId:encounter.id,turnNumber:encounter.turnNumber,kind:encounter.kind,phase:encounter.stage,
    title:'전투 숙련도 시험',paragraphs:['상대가 거리를 좁힌다.'],source:'template',generatedAt:'2026-09-05T00:00:00.000Z',
    choices:[{id:token,label:'행동한다',effectDescription:'',postChoiceNarrative:['상대에게 맞서 움직인다.'],intent:{primary:action,style:'careful',target:'enemy'},legacyActionToken:token}],
  });
  let index = 0;
  return resolveSubwayBanditChoice(state, token, encounter.turnNumber, () => rolls[index++] ?? 0.99);
}

test('legacy saves add combat Lv.1 without losing existing XP; malformed XP is normalized', () => {
  const legacy = {collection:{totalXp:120}, exploration:{totalXp:210}, fishing:{totalXp:50}};
  assert.deepEqual(normalizeSkillProgress(legacy), {...legacy, combat:{totalXp:0}});
  assert.deepEqual(SkillProgressStateSchema.parse(legacy), {...legacy, combat:{totalXp:0}});
  for (const value of [-1, NaN, Infinity, '50', null]) {
    assert.equal(normalizeSkillProgress({...legacy,combat:{totalXp:value}}).combat.totalXp,0);
  }
  assert.equal(normalizeSkillProgress({...legacy,combat:{totalXp:999.9}}).combat.totalXp,320);
  const saved=fixture(120);
  assert.equal(GameStateSchema.parse(saved).skillProgress.combat.totalXp,120);
  assert.equal(SkillUseSchema.safeParse({skillId:'combat'}).success,false);
});

test('five tiers expose cumulative bonuses, thresholds, and MAX in the snapshot contract', () => {
  for (let i=0;i<5;i++) {
    const state=fixture(thresholds[i]);
    const card=buildSkillProgressCards(state.skillProgress).find(card=>card.id==='combat');
    assert.equal(card.level,i+1);
    assert.equal(card.combat.attackBonus,i);
    assert.equal(card.combat.hitChanceBonus,i*3);
    assert.equal(card.combat.evasionBonus,i*3);
    assert.deepEqual(card.combat.tiers.map(tier=>tier.totalXp),thresholds);
    assert.equal(card.combat.turnXp,2);
    assert.equal(card.combat.victoryXp,10);
    assert.equal(card.isMaxLevel,i===4);
    assert.equal(CombatSkillDetailsSchema.safeParse(card.combat).success,true);
    assert.equal(evaluateCondition({type:'skill_gte',skillId:'combat',value:i+1},state),true);
    assert.equal(evaluateCondition({type:'skill_gte',skillId:'combat',value:i+2},state),false);
  }
});

test('every tier changes real attack damage and the exact hit boundary, matching mechanical hints', () => {
  for(let i=0;i<5;i++) {
    const hitChance=80+i*3;
    const state=fixture(thresholds[i]);
    state.subwayExpedition.currentFloorProgress.encounter.enemy.hp=40;
    const hint=subwaySituationActionCatalog(state).find(row=>row.actionToken==='fight').mechanicalHint;
    assert.match(hint,new RegExp(`명중 ${hitChance}%: 적 ${2+i}피해`));
    assert.match(hint,new RegExp(`반격 ${60-i*3}%`));
    assert.equal(choose(state,'fight',[(hitChance-0.5)/100,0.99]).damageDealt,2+i);
    const miss=fixture(thresholds[i]);
    assert.equal(choose(miss,'fight',[(hitChance+0.5)/100,0.99]).damageDealt,0);
    assert.equal(miss.skillProgress.combat.totalXp,Math.min(320,thresholds[i]+2));
  }
});

test('evasion lowers incoming attack chance and still permits hits at its boundary', () => {
  assert.equal(choose(fixture(),'fight',[0.99,0.55]).damageTaken,1);
  assert.equal(choose(fixture(320),'fight',[0.99,0.55]).damageTaken,0);
  assert.equal(choose(fixture(320),'fight',[0.99,0.475]).damageTaken,1);
  assert.equal(choose(fixture(320),'fight',[0.99,0.485]).damageTaken,0);
  // Failed defense and failed evasion also benefit from the passive bonus.
  assert.equal(choose(fixture(320),'guard',[0.99,0.9]).damageTaken,0);
  assert.equal(choose(fixture(320),'flee',[0.99,0.9],{primary:'evade'}).damageTaken,0);
});

test('XP is granted once per real combat turn, victory adds ten, and returning keeps it', () => {
  const state=fixture();
  choose(state,'fight',[0,0.99]);
  assert.equal(state.skillProgress.combat.totalXp,2);
  assert.throws(()=>resolveSubwayBanditChoice(state,'fight',0,()=>0),/이미 지난 상황/);
  assert.equal(state.skillProgress.combat.totalXp,2);
  assert.equal(choose(state,'close_attack',[0]).resolution,'victory');
  assert.equal(state.skillProgress.combat.totalXp,14);
  assert.match(state.systemNote,/전투 숙련도 \+12 XP/);
  assert.throws(()=>resolveSubwayBanditChoice(state,'close_attack',2,()=>0),/현재는/);
  acknowledgeSubwayBanditResult(state);
  assert.equal(state.skillProgress.combat.totalXp,14);
  state.subwayExpedition.currentFloor = { depth: 1 };
  returnFromSubwayExpedition(state);
  assert.equal(state.skillProgress.combat.totalXp,14);
});

test('defense and evasion earn XP only against a threat, including failures; talk and escape do not', () => {
  for(const primary of ['defend','evade']) {
    for(const roll of [0,0.99]) {
      const state=fixture();
      choose(state,primary==='defend'?'guard':'flee',[roll,0.99],{primary});
      assert.equal(state.skillProgress.combat.totalXp,2);
    }
    const idle=fixture();
    choose(idle,primary==='defend'?'guard':'flee',[0],{primary,incoming:false});
    assert.equal(idle.skillProgress.combat.totalXp,0);
  }
  for(const token of ['talk','flee','observe']) {
    const state=fixture();choose(state,token,[0]);
    assert.equal(state.skillProgress.combat.totalXp,0);
  }
  const social=fixture();social.subwayExpedition.currentFloorProgress.encounter.kind='social';
  choose(social,'talk',[0]);assert.equal(social.skillProgress.combat.totalXp,0);
});

test('level-up applies from the next turn, logs once, and XP stops at MAX', () => {
  const state=fixture(49);
  state.subwayExpedition.currentFloorProgress.encounter.enemy.hp=40;
  assert.equal(choose(state,'fight',[0,0.99]).damageDealt,2);
  assert.equal(state.skillProgress.combat.totalXp,51);
  assert.match(state.systemNote,/전투 숙련도 Lv.2 달성/);
  assert.equal(choose(state,'close_attack',[0,0.99]).damageDealt,3);
  assert.equal(state.log.filter(entry=>entry.message==='전투 숙련도가 Lv.2로 올랐습니다.').length,1);
  const max=fixture(319);
  choose(max,'fight',[0.99,0.99]);
  assert.equal(max.skillProgress.combat.totalXp,320);
  assert.match(max.systemNote,/전투 숙련도 \+1 XP/);
  choose(max,'close_attack',[0.99,0.99]);
  assert.equal(max.skillProgress.combat.totalXp,320);
  assert.doesNotMatch(max.systemNote,/전투 숙련도 \+/);
});

test('permanent proficiency stacks with run upgrades and hit chance stays capped at 95%', () => {
  const state=fixture(320);
  state.subwayExpedition.currentFloorProgress.encounter.enemy.hp=40;
  state.subwayExpedition.runBuild.skillRanks.power_strike=2;
  assert.equal(choose(state,'fight',[0,0.99]).damageDealt,8);
  state.subwayExpedition.runBuild.skillRanks.improvised_mastery=5;
  const hint=subwaySituationActionCatalog(state).find(row=>row.actionToken==='throw_improvised').mechanicalHint;
  assert.match(hint,/명중 95%: 적 7피해/);
  assert.equal(choose(state,'throw_improvised',[0.945,0.99]).damageDealt,7);
  assert.equal(choose(state,'throw_improvised',[0.955,0.99]).damageDealt,0);
});
