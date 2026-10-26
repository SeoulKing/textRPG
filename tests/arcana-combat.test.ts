import assert from "node:assert/strict";
import test from "node:test";
import { arcanaStats, ensureArcanaEncounter, performArcanaAction, tickArcanaCombat, useArcanaPotion } from "../src/game/arcana-combat";
import { GAME_HOUR_MS, REAL_DAY_MS, SAVE_VERSION } from "../src/game/base-data";
import { advanceGameMinutes, createInitialGameState, performWorldClockAction, syncClock } from "../src/game/rules";
import { normalizeGameSession } from "../src/game/repository";
import { formatClockLabelFromElapsed } from "../src/game/state-utils";
import type { GameAction, GameState } from "../src/game/schemas";

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

test("레벨업은 초과 경험치와 현재 MP를 유지하며 마력과 주문 피해를 높인다", () => {
  const s = hunting(); s.arcanaCombat.xp = 25; s.arcanaCombat.hp = 50;
  act(s, "start"); act(s, "fireball");
  for (let hit = 1; hit < 6; hit++) {
    if (hit % 2 === 0) {
      tickArcanaCombat(s, 2.4); act(s, "dodge"); tickArcanaCombat(s, .6);
    } else tickArcanaCombat(s, 3);
    act(s, "fireball");
  }
  assert.equal(s.arcanaCombat.level, 2); assert.equal(s.arcanaCombat.xp, 5);
  assert.deepEqual(arcanaStats(s), { maxHp: 110, maxMp: 33, attack: 12, xpRequired: 45 });
  assert.equal(s.arcanaCombat.hp, 60); assert.equal(s.arcanaCombat.mp, 6);
  act(s, "finish"); tickArcanaCombat(s, 3); s.arcanaCombat.level = 3; s.flags.arcana_slime_encounter_active = true; ensureArcanaEncounter(s);
  act(s, "start"); act(s, "fireball"); assert.equal(s.arcanaCombat.battle!.enemyHp, 23);
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