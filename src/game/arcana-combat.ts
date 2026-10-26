import { randomUUID } from "node:crypto";
import { GAME_HOUR_MS } from "./base-data";
import { ArcanaCombatSchema } from "./schemas/arcana-combat";
import type { ActionChoice, GameAction, GameState, SceneCard } from "./schemas";
import { appendLogEntry } from "./state-utils";
import { slimeMonster } from "./data/regions/arcana-hunting-ground/monsters";

type Command = Extract<GameAction, { type: "arcana_combat" }>;
const FIREBALL_POWER_RATIO = 0.5;
export function arcanaStats(state: GameState) {
  const level = state.arcanaCombat.level;
  return { maxHp: 100 + (level - 1) * 10, maxMp: 30 + (level - 1) * 3, attack: 10 + (level - 1) * 2, xpRequired: 30 + (level - 1) * 15 };
}
function fireballDamage(state: GameState) {
  return Math.floor(arcanaStats(state).attack * FIREBALL_POWER_RATIO);
}
export function usesArcanaStats(state: GameState) { return Boolean(state.flags.in_magic_world && !state.magicDungeon.run); }
export function normalizeArcanaCombat(raw: unknown) {
  const parsed = ArcanaCombatSchema.safeParse(raw);
  const value = parsed.success ? parsed.data : ArcanaCombatSchema.parse(undefined);
  value.hp = Math.min(value.hp, 100 + (value.level - 1) * 10);
  value.mp = Math.min(value.mp, 30 + (value.level - 1) * 3);
  return value;
}
export function recoverArcanaMana(state: GameState, elapsed: number) {
  if (usesArcanaStats(state)) state.arcanaCombat.mp = Math.min(arcanaStats(state).maxMp, state.arcanaCombat.mp + elapsed / GAME_HOUR_MS * state.arcanaCombat.manaRegenPerHour);
}
function line(state: GameState, text: string) {
  const battle = state.arcanaCombat.battle;
  if (battle) { battle.log.push(text); battle.log = battle.log.slice(-6); }
}
export function ensureArcanaEncounter(state: GameState) {
  if (!state.arcanaCombat.battle && state.location === "arcana_hunting_ground" && state.flags.arcana_slime_encounter_active && !state.magicDungeon.run) {
    state.arcanaCombat.battle = { id: randomUUID(), phase: "ready", enemyHp: slimeMonster.maxHp, attackIn: 6, paused: true, log: ["슬라임이 몸을 기울입니다. 준비되면 전투를 시작하세요."] };
  }
}
export function pauseArcanaCombat(state: GameState) {
  if (state.arcanaCombat.battle?.phase === "battle") state.arcanaCombat.battle.paused = true;
}
export function tickArcanaCombat(state: GameState, seconds: number) {
  const c = state.arcanaCombat, b = c.battle;
  if (b?.phase === "battle" && b.paused) return;
  let remaining = seconds;
  while (remaining > 1e-8) {
    const fighting = b?.phase === "battle";
    const step = fighting ? Math.min(remaining, b.attackIn) : remaining;
    for (const key of ["fireball", "dodge", "potion"] as const) c.cooldowns[key] = Math.max(0, c.cooldowns[key] - step);
    c.evadeSeconds = Math.max(0, c.evadeSeconds - step);
    remaining -= step;
    if (!fighting) break;
    b.attackIn = Math.max(0, b.attackIn - step);
    if (b.attackIn > 1e-8) continue;
    if (c.evadeSeconds > 1e-8) line(state, "회피 성공 · 슬라임의 도약을 피했습니다. 피해 0");
    else { c.hp = Math.max(0, c.hp - slimeMonster.attack); line(state, "슬라임의 도약 · HP −" + slimeMonster.attack); }
    b.attackIn = 6;
    if (c.hp === 0) {
      b.phase = "defeat"; b.paused = true;
      c.hp = Math.ceil(arcanaStats(state).maxHp * .3);
      state.location = "arcana_plaza"; state.sceneId = "arcana_plaza_repeat_intro"; state.activeEventId = null;
      state.flags.visited_arcana_plaza = true; state.flags.arcana_slime_encounter_active = false;
      line(state, "전투 불능 · 광장으로 귀환했습니다. HP 30% 복구 · 경험치와 레벨 유지");
      appendLogEntry(state, "슬라임에게 패배해 광장으로 귀환했다. 경험치와 레벨은 유지된다."); break;
    }
  }
}
export function useArcanaPotion(state: GameState) {
  const c = state.arcanaCombat;
  if (c.cooldowns.potion > 1e-8) throw new Error("마나 포션 재사용 대기 중입니다.");
  if (!(state.inventory.manaPotion > 0)) throw new Error("마나 포션이 없습니다. 상점에서 구입할 수 있습니다.");
  if (c.mp >= arcanaStats(state).maxMp - 1e-8) throw new Error("MP가 이미 가득 찼습니다.");
  state.inventory.manaPotion--; if (!state.inventory.manaPotion) delete state.inventory.manaPotion;
  const before = c.mp; c.mp = Math.min(arcanaStats(state).maxMp, c.mp + 20); c.cooldowns.potion = 5;
  const text = "마나 포션 · MP +" + Number((c.mp - before).toFixed(1));
  line(state, text); appendLogEntry(state, text);
}
export function performArcanaAction(state: GameState, action: Command) {
  const c = state.arcanaCombat;
  if (!usesArcanaStats(state) || state.isGameOver || state.subwayExpedition.active || state.npcDialogue.active) throw new Error("현재는 평원 전투 행동을 할 수 없습니다.");
  ensureArcanaEncounter(state);
  const b = c.battle;
  if (action.command === "buy_potion" || action.command === "rest") {
    const shop = action.command === "buy_potion";
    if (b || state.location !== (shop ? "arcana_shop" : "arcana_inn")) throw new Error("해당 시설에서 이용해 주세요.");
    if (!shop && c.hp >= arcanaStats(state).maxHp) throw new Error("HP가 이미 가득 찼습니다.");
    if (state.money < 100) throw new Error("소지금 100원이 필요합니다.");
    state.money -= 100;
    if (shop) state.inventory.manaPotion = (state.inventory.manaPotion || 0) + 1;
    else c.hp = arcanaStats(state).maxHp;
    appendLogEntry(state, shop ? "100원으로 마나 포션 1개를 구입했다." : "여관에서 상처를 치료했다. HP 완전 회복"); return;
  }
  if (action.command === "potion" && !b) { useArcanaPotion(state); return; }
  if (!b || action.battleId !== b.id) throw new Error("전투 상태가 바뀌었습니다. 화면을 갱신해 주세요.");
  if (action.command === "finish") {
    if (b.phase !== "victory" && b.phase !== "defeat") throw new Error("아직 전투가 끝나지 않았습니다.");
    c.battle = null; state.flags.arcana_slime_encounter_active = false;
    state.sceneId = state.location === "arcana_plaza" ? "arcana_plaza_repeat_intro" : "arcana_hunting_ground_repeat_intro"; return;
  }
  if (action.command === "retreat") {
    if (b.phase !== "ready" && b.phase !== "battle") throw new Error("전투 결과를 먼저 확인해 주세요.");
    c.battle = null; state.flags.arcana_slime_encounter_active = false; state.sceneId = "arcana_hunting_ground_repeat_intro";
    appendLogEntry(state, "슬라임과 거리를 벌려 평원 입구로 물러났다."); return;
  }
  if (action.command === "start") {
    if (b.phase !== "ready") throw new Error("이미 시작한 전투입니다.");
    b.phase = "battle"; b.paused = state.activeClock.paused; line(state, "전투 시작 · 도약 예고를 보고 회피하세요."); return;
  }
  if (action.command === "potion" && b.phase !== "battle") { useArcanaPotion(state); return; }
  if (b.phase !== "battle") throw new Error("진행 중인 전투가 아닙니다.");
  if (action.command === "pause") { b.paused = true; return; }
  if (action.command === "resume") { b.paused = false; return; }
  if (b.paused) throw new Error("전투를 재개해 주세요.");
  if (action.command === "potion") { useArcanaPotion(state); return; }
  if (action.command === "dodge") {
    if (c.cooldowns.dodge > 1e-8) throw new Error("회피 재사용 대기 중입니다.");
    c.evadeSeconds = .8; c.cooldowns.dodge = 5; line(state, "회피 · 0.8초 동안 적의 공격을 피합니다."); return;
  }
  if (action.command === "fireball") {
    if (c.cooldowns.fireball > 1e-8) throw new Error("파이어볼 재사용 대기 중입니다.");
    if (c.mp < 4) throw new Error("MP가 4 이상 필요합니다.");
    c.mp -= 4; c.cooldowns.fireball = 3;
    const damage = fireballDamage(state);
    const before = b.enemyHp; b.enemyHp = Math.max(0, b.enemyHp - damage);
    line(state, "파이어볼 · " + damage + " 피해 · 슬라임 HP " + before + " → " + b.enemyHp);
    if (b.enemyHp > 0) return;
    b.phase = "victory"; b.paused = true; state.flags.arcana_slime_encounter_active = false;
    c.xp += 10; state.money += 30;
    while (c.xp >= arcanaStats(state).xpRequired) {
      c.xp -= arcanaStats(state).xpRequired; c.level++; c.hp = Math.min(arcanaStats(state).maxHp, c.hp + 10);
      line(state, "레벨업 · Lv." + c.level + " · 최대 HP +10 · 최대 MP +3 · 마력 +2");
    }
    line(state, "승리 · 경험치 +10 · 소지금 +30원"); appendLogEntry(state, "슬라임 처치 · 경험치 +10 · 소지금 +30원"); return;
  }
  throw new Error("알 수 없는 전투 행동입니다.");
}
function choice(state: GameState, command: Command["command"], label: string, hint = "", available = true): ActionChoice {
  return { id: "arcana:" + command, label, outcomeHint: hint, showOutcomeHint: Boolean(hint), isAvailable: available,
    action: { type: "arcana_combat", command, ...(state.arcanaCombat.battle ? { battleId: state.arcanaCombat.battle.id } : {}) } };
}
export function buildArcanaActions(state: GameState): ActionChoice[] {
  const c = state.arcanaCombat, b = c.battle;
  if (!usesArcanaStats(state)) return [];
  if (!b) {
    if (state.location === "arcana_shop") return [choice(state, "buy_potion", "마나 포션을 구입한다", "100원 · MP 20 회복 · 보유 " + (state.inventory.manaPotion || 0) + "개", state.money >= 100)];
    if (state.location === "arcana_inn") return [choice(state, "rest", "여관에서 치료받는다", "100원 · 10분 · HP 완전 회복", state.money >= 100 && c.hp < arcanaStats(state).maxHp)];
    return [];
  }
  if (b.phase === "ready") return [choice(state, "start", "슬라임과 싸운다", "슬라임 HP 30 · 공격력 5"), choice(state, "retreat", "거리를 두고 물러난다")];
  if (b.phase === "victory" || b.phase === "defeat") return [choice(state, "finish", b.phase === "victory" ? "전투를 마친다" : "광장에서 다시 준비한다")];
  if (b.paused) return [choice(state, "resume", "전투를 재개한다"), choice(state, "retreat", "후퇴한다")];
  return [choice(state, "fireball", "파이어볼", "마력의 50% · 피해 " + fireballDamage(state) + " · MP 4 · 재사용 3초", c.mp >= 4 && c.cooldowns.fireball <= 1e-8),
    choice(state, "dodge", "회피", "0.8초 회피 · 재사용 5초", c.cooldowns.dodge <= 1e-8),
    choice(state, "potion", "마나 포션", "MP +20 · 보유 " + (state.inventory.manaPotion || 0) + "개", Boolean(state.inventory.manaPotion) && c.mp < arcanaStats(state).maxMp && c.cooldowns.potion <= 1e-8),
    choice(state, "retreat", "후퇴한다", "보상 없이 전투 종료")];
}
export function buildArcanaScene(state: GameState): SceneCard | null {
  const b = state.arcanaCombat.battle;
  if (!b) return null;
  return { id: "arcana-combat:" + b.id + ":" + b.phase, locationId: state.location,
    title: b.phase === "victory" ? "슬라임 처치" : b.phase === "defeat" ? "광장으로 귀환" : "별빛 초원의 슬라임",
    paragraphs: [b.phase === "ready" ? "초록빛 슬라임이 몸을 기울인다. 파이어볼을 준비하고 먼저 다가갈 순간을 고른다." : b.log.at(-1) || "슬라임과 맞선다."],
    choices: [], materialIds: { locationIds: [state.location], personIds: [], itemIds: ["manaPotion"] }, source: "template", generatedAt: new Date().toISOString() };
}
