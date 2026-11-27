import assert from "node:assert/strict";
import test from "node:test";
import { arcanaStats, ensureArcanaEncounter, normalizeArcanaCombat, performArcanaAction, tickArcanaCombat, useArcanaPotion } from "../src/game/arcana-combat";
import { equipArcanaSkill, trainArcanaSkill } from "../src/game/arcana-skill-training";
import { buildArcanaSpells, learnArcanaSpell, spellMagnitude } from "../src/game/arcana-spells";
import { circleIntersectsCone, createSpatialBattle, spatialLayout } from "../src/game/arcana-spatial";
import { GameService } from "../src/game/service";
import type { GameRepository } from "../src/game/repository";
import { GAME_HOUR_MS, REAL_DAY_MS, SAVE_VERSION } from "../src/game/base-data";
import { advanceGameMinutes, createInitialGameState, performWorldClockAction, syncClock } from "../src/game/rules";
import { normalizeGameSession } from "../src/game/repository";
import { formatClockLabelFromElapsed } from "../src/game/state-utils";
import type { GameAction, GameSession, GameState } from "../src/game/schemas";

type Command = Extract<GameAction, { type: "arcana_combat" }>["command"];
function hunting() {
  const state = createInitialGameState();
  state.flags.in_magic_world = true;
  state.flags.arcana_slime_encounter_active = true;
  state.location = "arcana_hunting_ground";
  state.lastRealTimestamp = 0;
  performWorldClockAction(state, { type: "world_clock", command: "tick", clientId: "tab-a", sequence: 0 }, 0);
  ensureArcanaEncounter(state);
  return state;
}
function act(state: GameState, command: Command) {
  performArcanaAction(state, { type: "arcana_combat", command, battleId: state.arcanaCombat.battle?.id });
}
function pulse(state: GameState, now: number, clientId = "tab-a", sequence = now) {
  syncClock(state, now);
  performWorldClockAction(state, { type: "world_clock", command: "tick", clientId, sequence }, now);
}

test("파이어볼은 마력의 50% 피해를 주고 MP와 재사용 제한을 지킨다", () => {
  const s = hunting(); act(s, "start"); act(s, "fireball");
  assert.equal(arcanaStats(s).attack, 10);
  assert.equal(s.arcanaCombat.battle!.enemyHp, 25);
  assert.equal(s.arcanaCombat.mp, 26);
  assert.throws(() => act(s, "fireball"), /대기/);
  assert.equal(s.arcanaCombat.mp, 26);
  for (let hit = 1; hit < 6; hit++) {
    tickArcanaCombat(s, 3); act(s, "fireball");
    assert.equal(s.arcanaCombat.battle!.enemyHp, 30 - (hit + 1) * 5);
  }
  assert.equal(s.arcanaCombat.battle!.phase, "victory");
  assert.equal(s.arcanaCombat.mp, 6);
  const xp = s.arcanaCombat.xp, money = s.money, hp = s.arcanaCombat.hp;
  assert.throws(() => act(s, "fireball"));
  tickArcanaCombat(s, 20);
  assert.equal(s.arcanaCombat.xp, xp); assert.equal(s.money, money); assert.equal(s.arcanaCombat.hp, hp);
});

test("공격 순간의 회피만 피해를 막고 이후 공격은 HP를 깎는다", () => {
  const s = hunting(); act(s, "start"); tickArcanaCombat(s, 5.4); act(s, "dodge"); tickArcanaCombat(s, .6);
  assert.equal(s.arcanaCombat.hp, 100);
  assert.match(s.arcanaCombat.battle!.log.at(-1)!, /회피 성공/);
  tickArcanaCombat(s, 6); assert.equal(s.arcanaCombat.hp, 95);
});

test("패배 시 광장 HP 30% 귀환, 레벨과 XP 유지, 보상 없음", () => {
  const s = hunting(); s.arcanaCombat.hp = 5; s.arcanaCombat.xp = 20;
  const money = s.money; act(s, "start"); tickArcanaCombat(s, 6);
  assert.equal(s.location, "arcana_plaza"); assert.equal(s.arcanaCombat.hp, 30);
  assert.equal(s.arcanaCombat.battle!.phase, "defeat"); assert.equal(s.arcanaCombat.xp, 20); assert.equal(s.money, money);
});

test("성장은 캐릭터 레벨 대신 개별 스킬 숙련도에만 적용된다", () => {
  const s = hunting(); s.arcanaCombat.level = 20;
  assert.equal(spellMagnitude(s,"fireball"),5);
  trainArcanaSkill(s,"fireball",1000);
  assert.equal(spellMagnitude(s,"fireball"),6);
  assert.equal(spellMagnitude(s,"flame_wave"),10);
  trainArcanaSkill(s,"fireball",100000);
  assert.equal(buildArcanaSpells(s)[0].mastery,100);
  assert.deepEqual(arcanaStats(s), {maxHp:100,maxMp:30,attack:10,xpRequired:100});
});

test("실제 75초는 게임 1시간, 시간당 MP 12와 이동 시간 회복을 합산한다", () => {
  const s = hunting(); s.arcanaCombat.mp = 0;
  for (let now = 1000; now <= 75000; now += 1000) pulse(s, now);
  assert.equal(REAL_DAY_MS, 30 * 60 * 1000); assert.equal(s.worldElapsedMs, GAME_HOUR_MS);
  assert.ok(Math.abs(s.arcanaCombat.mp - 12) < 1e-8);
  advanceGameMinutes(s, 15); assert.ok(Math.abs(s.arcanaCombat.mp - 15) < 1e-8);
});

test("오래 끊긴 연결은 미처리 시간을 버리고 남은 공격 시간을 보존한다", () => {
  const s = hunting(); act(s, "start"); pulse(s, 1000);
  const world = s.worldElapsedMs, remaining = s.arcanaCombat.battle!.attackIn;
  pulse(s, 61000);
  assert.equal(s.worldElapsedMs, world); assert.equal(s.arcanaCombat.battle!.paused, true);
  assert.equal(s.arcanaCombat.battle!.attackIn, remaining);
  act(s, "resume"); pulse(s, 62000);
  assert.equal(s.arcanaCombat.battle!.attackIn, remaining - 1);
});

test("다른 탭은 유효한 시간 소유권을 빼앗거나 시간을 중복 반영하지 않는다", () => {
  const s = hunting(); pulse(s, 1000); pulse(s, 1000, "tab-b");
  assert.equal(s.activeClock.ownerId, "tab-a"); assert.equal(s.worldElapsedMs, 1000);
  performWorldClockAction(s, { type: "world_clock", command: "pause", clientId: "tab-a", sequence: 2000 }, 1000);
  performWorldClockAction(s, { type: "world_clock", command: "tick", clientId: "tab-a", sequence: 1000 }, 1000);
  assert.equal(s.activeClock.paused, true);
});

test("마나 포션은 최대치를 넘지 않고 한 개만 소모하며 게임 시간을 소모하지 않는다", () => {
  const s = hunting(); s.arcanaCombat.mp = 29; s.inventory.manaPotion = 2;
  const world = s.worldElapsedMs; useArcanaPotion(s);
  assert.equal(s.arcanaCombat.mp, 30); assert.equal(s.inventory.manaPotion, 1); assert.equal(s.worldElapsedMs, world);
  assert.throws(() => useArcanaPotion(s), /대기/);
});

test("상점 구매와 여관 치료는 소지금을 차감하고 여관 시간만 MP를 회복한다", () => {
  const s = hunting(); act(s, "retreat"); s.location = "arcana_shop";
  const before = s.money; act(s, "buy_potion");
  assert.equal(s.money, before - 100); assert.equal(s.inventory.manaPotion, 1);
  s.location = "arcana_inn"; s.arcanaCombat.hp = 10; s.arcanaCombat.mp = 0;
  act(s, "rest"); advanceGameMinutes(s, 10);
  assert.equal(s.arcanaCombat.hp, 100); assert.equal(s.arcanaCombat.mp, 2); assert.equal(s.money, before - 200);
});

test("구버전 시간은 일차와 표시 시각을 보존하며 한 번만 환산한다", () => {
  const state = createInitialGameState(); state.saveVersion = 18; state.day = 2;
  state.worldElapsedMs = 15 * 60 * 1000 + 3 * 37500;
  state.autoEnergyElapsedMs = 18750; state.exhaustionElapsedMs = 5000;
  const raw = { id: "old-save", createdAt: "2026-10-26", updatedAt: "2026-10-26", state,
    world: { locationCards: {}, personCards: {}, itemCards: {}, eventCards: {}, sceneCards: {}, protagonistCard: null } };
  const migrated = normalizeGameSession(raw);
  assert.equal(migrated.state.saveVersion, SAVE_VERSION); assert.equal(migrated.state.day, 2);
  assert.equal(formatClockLabelFromElapsed(migrated.state.worldElapsedMs), "09:00");
  assert.equal(migrated.state.autoEnergyElapsedMs, 37500); assert.equal(migrated.state.exhaustionElapsedMs, 10000);
  assert.equal(normalizeGameSession(migrated).state.worldElapsedMs, migrated.state.worldElapsedMs);
});

test("기본 주문은 레벨 없이 배우고 장착한 주문만 사용할 수 있다", () => {
  const s = hunting(); s.arcanaCombat.battle = null;
  learnArcanaSpell(s,"flame_wave");
  assert.equal(buildArcanaSpells(s).find(v=>v.id==="flame_wave")!.unlocked,true);
  assert.throws(()=>act(s,"flame_wave"),/장착/);
  equipArcanaSkill(s,1,"flame_wave");
  equipArcanaSkill(s,4,"flame_wave");
  assert.equal(s.arcanaCombat.activeSkills!.filter(v=>v==="flame_wave").length,1);
  ensureArcanaEncounter(s); act(s,"start");
  assert.throws(()=>equipArcanaSkill(s,0),/전투/);
  act(s,"flame_wave");
  assert.equal(s.arcanaCombat.skillTraining.flame_wave.xp,10);
});

test("구 저장 이관은 습득·장착·경험치를 보존하고 재적용하지 않는다", () => {
  const old = { level:3, xp:15, learnedSpells:["fireball","flame_wave"] };
  const migrated = normalizeArcanaCombat(old);
  assert.deepEqual(migrated.activeSkills,["fireball","flame_wave",null,null,null,null]);
  assert.equal(migrated.skillTraining.fireball.xp,45);
  assert.deepEqual(normalizeArcanaCombat(migrated),migrated);
  migrated.activeSkills = [null,null,null,null,null,null];
  assert.deepEqual(normalizeArcanaCombat(migrated).activeSkills,migrated.activeSkills);
});

test("이전 저장은 레벨·자원·전투·기존 쿨타임을 보존하며 새 주문 필드를 보완한다", () => {
  const s = hunting(); s.arcanaCombat.level = 3; s.arcanaCombat.learnedSpells = ["fireball","flame_wave","flame_guard"]; s.arcanaCombat.activeSkills = ["fireball","flame_wave","flame_guard",null,null,null]; s.arcanaCombat.skillTraining.flame_guard = {xp:2000,specializations:[],activeSpecialization:null}; s.arcanaCombat.hp = 67; s.arcanaCombat.mp = 19;
  const old = JSON.parse(JSON.stringify(s.arcanaCombat));
  delete old.unlockedSchools; delete old.guard; delete old.cooldowns.flame_wave; delete old.cooldowns.flame_guard;
  old.cooldowns.fireball = 1.5;
  const restored = normalizeArcanaCombat(old);
  assert.equal(restored.level,3); assert.equal(restored.hp,67); assert.equal(restored.mp,19);
  assert.deepEqual(restored.battle,s.arcanaCombat.battle);
  assert.deepEqual(restored.unlockedSchools,["fire"]);
  assert.equal(restored.cooldowns.fireball,1.5);
  assert.equal(restored.cooldowns.flame_wave,0); assert.deepEqual(restored.guard,{amount:0,seconds:0});
});

test("잠금·MP 부족·쿨타임 거절은 화염파 자원과 적 상태를 변경하지 않는다", () => {
  const s = hunting(); act(s,"start");
  let before = structuredClone(s.arcanaCombat);
  assert.throws(() => act(s,"flame_wave"),/배워/);
  assert.deepEqual(s.arcanaCombat,before);
  s.arcanaCombat.learnedSpells = ["fireball","flame_wave"]; s.arcanaCombat.activeSkills = ["fireball","flame_wave",null,null,null,null]; s.arcanaCombat.skillTraining.flame_wave = {xp:1000,specializations:[],activeSpecialization:null}; s.arcanaCombat.mp = 7; before = structuredClone(s.arcanaCombat);
  assert.throws(() => act(s,"flame_wave"),/MP/); assert.deepEqual(s.arcanaCombat,before);
  s.arcanaCombat.mp = 30; act(s,"flame_wave");
  assert.equal(s.arcanaCombat.mp,22); assert.equal(s.arcanaCombat.battle!.enemyHp,18);
  assert.equal(s.arcanaCombat.cooldowns.flame_wave,8);
  before = structuredClone(s.arcanaCombat);
  assert.throws(() => act(s,"flame_wave"),/대기/); assert.deepEqual(s.arcanaCombat,before);
});

test("화염파는 부채꼴 바깥에 걸친 충돌 원까지 판정하되 사거리와 후방을 구분한다", () => {
  const origin = {x:0,y:0}, direction = {x:1,y:0};
  assert.equal(circleIntersectsCone(origin,direction,{x:34,y:0},3,32),true);
  assert.equal(circleIntersectsCone(origin,direction,{x:36,y:0},3,32),false);
  assert.equal(circleIntersectsCone(origin,direction,{x:15,y:18},3,32),true);
  assert.equal(circleIntersectsCone(origin,direction,{x:15,y:21},3,32),false);
  assert.equal(circleIntersectsCone(origin,direction,{x:-10,y:0},3,32),false);
});

function plaza(level = 3) {
  const s = hunting(); s.location = "arcana_plaza"; s.arcanaCombat.battle = null;
  s.flags.arcana_slime_encounter_active = false; s.arcanaCombat.learnedSpells = ["fireball","flame_wave","flame_guard"]; s.arcanaCombat.activeSkills = ["fireball","flame_wave","flame_guard",null,null,null]; for (const id of ["fireball","flame_wave","flame_guard"]) s.arcanaCombat.skillTraining[id] = {xp:(level-1)*1000,specializations:[],activeSpecialization:null};
  return s;
}
function spatialWaveState() {
  const s = plaza(2), home = spatialLayout().home;
  createSpatialBattle(s,{x:home.x,y:home.y+24});
  return s;
}
function wave(s: GameState, sequence = 1) {
  const spatial = s.arcanaCombat.battle!.spatial!;
  performArcanaAction(s,{type:"arcana_combat",command:"flame_wave",battleId:s.arcanaCombat.battle!.id,spatial:{encounterId:"plaza_slime",clientId:"spell-test",sequence,position:spatial.player,aim:{x:0,y:-1},paused:false,developerSpeed:false}});
}

test("공간 화염파는 즉시 명중하며 벽 너머에는 피해와 선공을 발생시키지 않는다", () => {
  const s = spatialWaveState(); wave(s);
  assert.equal(s.arcanaCombat.battle!.enemyHp,18);
  assert.equal(s.arcanaCombat.battle!.phase,"battle");
  assert.ok(s.arcanaCombat.battle!.spatial!.events.some(event => event.kind === "wave" && event.direction?.y === -1));
  const blocked = spatialWaveState(), layout = spatialLayout();
  layout.rectangles.push({x:layout.home.x-12,y:layout.home.y+10,w:24,h:2});
  try {
    wave(blocked);
    assert.equal(blocked.arcanaCombat.battle!.enemyHp,30);
    assert.equal(blocked.arcanaCombat.battle!.phase,"ready");
    assert.equal(blocked.arcanaCombat.mp,22);
  } finally { layout.rectangles.pop(); }
});

test("전투 전 장막은 적을 만들지 않고 4초 만료하며 저장 복원에도 잔량을 유지한다", () => {
  const s = plaza(); act(s,"flame_guard");
  assert.equal(s.arcanaCombat.battle,null); assert.equal(s.arcanaCombat.mp,24);
  assert.deepEqual(s.arcanaCombat.guard,{amount:14,seconds:4});
  tickArcanaCombat(s,1);
  assert.deepEqual(normalizeArcanaCombat(JSON.parse(JSON.stringify(s.arcanaCombat))).guard,{amount:14,seconds:3});
  tickArcanaCombat(s,3); assert.deepEqual(s.arcanaCombat.guard,{amount:0,seconds:0});
});

test("장막은 피격을 흡수하고 회피 성공에는 소모되지 않으며 재시전 시 교체된다", () => {
  const s = hunting(); s.arcanaCombat.level = 3; s.arcanaCombat.learnedSpells = ["fireball","flame_wave","flame_guard"]; s.arcanaCombat.activeSkills = ["fireball","flame_wave","flame_guard",null,null,null]; s.arcanaCombat.skillTraining.flame_guard = {xp:2000,specializations:[],activeSpecialization:null}; act(s,"start");
  tickArcanaCombat(s,4); act(s,"flame_guard"); tickArcanaCombat(s,2);
  assert.equal(s.arcanaCombat.hp,100); assert.equal(s.arcanaCombat.guard.amount,9);
  s.arcanaCombat.cooldowns.flame_guard = 0; act(s,"flame_guard");
  assert.equal(s.arcanaCombat.guard.amount,14);
  const evading = hunting(); evading.arcanaCombat.learnedSpells = ["fireball","flame_guard"]; evading.arcanaCombat.activeSkills = ["fireball","flame_guard",null,null,null,null]; act(evading,"start");
  tickArcanaCombat(evading,5.4); act(evading,"flame_guard"); act(evading,"dodge"); tickArcanaCombat(evading,.6);
  assert.equal(evading.arcanaCombat.guard.amount,10); assert.equal(evading.arcanaCombat.hp,100);
});

test("장막 초과 피해만 HP에 적용되고 만료·후퇴·패배 때 제거된다", () => {
  const s = hunting(); s.arcanaCombat.level = 3; s.arcanaCombat.learnedSpells = ["fireball","flame_wave","flame_guard"]; s.arcanaCombat.activeSkills = ["fireball","flame_wave","flame_guard",null,null,null]; s.arcanaCombat.skillTraining.flame_guard = {xp:2000,specializations:[],activeSpecialization:null}; act(s,"start"); tickArcanaCombat(s,4); act(s,"flame_guard");
  s.arcanaCombat.guard.amount = 2; tickArcanaCombat(s,2);
  assert.equal(s.arcanaCombat.hp,97); assert.equal(s.arcanaCombat.guard.amount,0);
  const expired = hunting(); expired.arcanaCombat.learnedSpells = ["fireball","flame_guard"]; expired.arcanaCombat.activeSkills = ["fireball","flame_guard",null,null,null,null]; act(expired,"start"); act(expired,"flame_guard"); tickArcanaCombat(expired,6);
  assert.equal(expired.arcanaCombat.hp,95);
  const retreating = hunting(); retreating.arcanaCombat.learnedSpells = ["fireball","flame_guard"]; retreating.arcanaCombat.activeSkills = ["fireball","flame_guard",null,null,null,null]; act(retreating,"flame_guard"); act(retreating,"retreat");
  assert.deepEqual(retreating.arcanaCombat.guard,{amount:0,seconds:0});
  const defeated = hunting(); defeated.arcanaCombat.learnedSpells = ["fireball","flame_guard"]; defeated.arcanaCombat.activeSkills = ["fireball","flame_guard",null,null,null,null]; defeated.arcanaCombat.hp = 1; act(defeated,"start");
  tickArcanaCombat(defeated,4); act(defeated,"flame_guard"); defeated.arcanaCombat.guard.amount = 2; tickArcanaCombat(defeated,2);
  assert.equal(defeated.arcanaCombat.battle!.phase,"defeat"); assert.equal(defeated.arcanaCombat.guard.amount,0);
});

test("장막과 새 쿨타임은 일시정지·긴 재접속 동안 보존된다", () => {
  const s = hunting(); s.arcanaCombat.level = 3; s.arcanaCombat.learnedSpells = ["fireball","flame_wave","flame_guard"]; s.arcanaCombat.activeSkills = ["fireball","flame_wave","flame_guard",null,null,null]; s.arcanaCombat.skillTraining.flame_guard = {xp:2000,specializations:[],activeSpecialization:null}; act(s,"start"); act(s,"flame_guard");
  act(s,"pause"); const before = structuredClone(s.arcanaCombat);
  tickArcanaCombat(s,100); assert.deepEqual(s.arcanaCombat,before);
  pulse(s,61000);
  assert.deepEqual(s.arcanaCombat.guard,before.guard);
  assert.equal(s.arcanaCombat.cooldowns.flame_guard,12);
});

test("화염파 처치는 장막을 지우며 숙련 기여와 보상을 한 번만 적용한다", () => {
  const s = spatialWaveState(); s.arcanaCombat.xp = 44; s.arcanaCombat.battle!.enemyHp = 1;
  s.arcanaCombat.guard = {amount:12,seconds:3}; const money = s.money;
  wave(s);
  assert.equal(s.arcanaCombat.level,1); assert.equal(s.arcanaCombat.xp,44); assert.equal(s.arcanaCombat.skillTraining.flame_wave.xp,1001); assert.equal(s.money,money+30);
  assert.equal(s.arcanaCombat.guard.amount,0); assert.ok(buildArcanaSpells(s).find(spell => spell.id === "flame_guard")!.unlocked);
  const terminal = structuredClone(s.arcanaCombat);
  assert.throws(() => wave(s)); tickArcanaCombat(s,10);
  assert.deepEqual(s.arcanaCombat,terminal); assert.equal(s.money,money+30);
});

test("공간 API의 같은 sequence는 장막 비용을 중복 차감하지 않고 거절도 저장하지 않는다", async context => {
  const now = 100000; context.mock.method(Date,"now",() => now);
  const state = plaza(); state.lastRealTimestamp = now;
  let stored: GameSession = {id:"spell-api",createdAt:"2026-10-28",updatedAt:"2026-10-28",state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}};
  let logs = 0;
  const repository = {
    withGameLock: async (_id: string,operation: () => Promise<unknown>) => operation(),
    loadGame: async () => structuredClone(stored),
    saveGame: async (session: GameSession) => { stored = structuredClone(session); },
    appendActionLog: async () => { logs++; },
  } as unknown as GameRepository;
  const service = new GameService(repository);
  const action: Extract<GameAction,{type:"arcana_combat"}> = {type:"arcana_combat",command:"flame_guard",spatial:{encounterId:"plaza_slime",clientId:"spell-api-client",sequence:1,position:spatialLayout().spawn,paused:false,developerSpeed:false}};
  const first = await service.performAction(stored.id,action);
  const duplicate = await service.performAction(stored.id,action);
  assert.equal(first.state.arcanaCombat.mp,24); assert.equal(duplicate.state.arcanaCombat.mp,24);
  assert.equal(logs,1);
  const before = structuredClone(stored.state.arcanaCombat);
  await assert.rejects(() => service.performAction(stored.id,{...action,spatial:{...action.spatial!,sequence:2}}),/대기/);
  assert.deepEqual(stored.state.arcanaCombat,before);
});
