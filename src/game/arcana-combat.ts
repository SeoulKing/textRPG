import { awardSlimeLoot, performSlimeQuest, SLIME_QUEST_ID, slimeQuestProgress } from "./arcana-economy";
import { buildArcanaShopActions, tradeArcanaShop } from "./arcana-shop";
import { investSkillTree, resetSkillTree, normalizeFireballTraining } from "./arcana-skill-tree";
import { equipArcanaSkill, trainArcanaSkill, equippedArcanaSkill } from "./arcana-skill-training";
import { randomUUID } from "node:crypto";
import { moveSpatialSkill, castSpatialFireball, castSpatialUltimate, ensureSpatialEnemies, castSpatialFlameWave, createSpatialBattle, returnSpatialBattle, spatialEvent, tickSpatialCombat } from "./arcana-spatial";
import { GAME_HOUR_MS } from "./base-data";
import { ArcanaCombatSchema } from "./schemas/arcana-combat";
import type { ActionChoice, GameAction, GameState, SceneCard } from "./schemas";
import { appendLogEntry } from "./state-utils";
import { slimeMonster } from "./data/regions/arcana-hunting-ground/monsters";
import { ARCANA_SPELLS, isUltimate, absorbArcanaDamage, assertSpellReady, buildArcanaSpells, castFlameGuard, clearFlameGuard, isArcanaSpell, learnArcanaSpell, spellUnlocked, spellMagnitude, spendSpell, tickSpellTimers } from "./arcana-spells";

type Command = Extract<GameAction, { type: "arcana_combat" }>;
export function arcanaStats(state: GameState) {
  return { maxHp: 100, maxMp: 30, attack: 10, xpRequired: 100 };
}
export function usesArcanaStats(state: GameState) { return Boolean(state.flags.in_magic_world); }
export function normalizeArcanaCombat(raw: unknown) {
  const parsed = ArcanaCombatSchema.safeParse(raw);
  const value = parsed.success ? parsed.data : ArcanaCombatSchema.parse(undefined);
  value.learnedSpells ??= Object.values(ARCANA_SPELLS).filter(spell => !isUltimate(spell.id) && value.unlockedSchools.includes(spell.school) && value.level >= spell.unlockLevel).map(spell => spell.id);
  if (!value.skillSystemVersion) {
    const earned = value.xp + 30 * (value.level - 1) + 15 * (value.level - 1) * (value.level - 2) / 2;
    for (const id of value.learnedSpells) value.skillTraining[id] ??= { xp: Math.min(10000, earned / Math.max(1, value.learnedSpells.length)), specializations: [], activeSpecialization: null };
    value.skillSystemVersion = 1;
  }
  normalizeFireballTraining(value);
  const seen = new Set<string>();
  value.activeSkills = (value.activeSkills ?? [...value.learnedSpells, null, null, null, null, null, null].slice(0, 6)).map(id => {
    if (!id || !value.learnedSpells!.some(skill => skill === id) || seen.has(id)) return null;
    seen.add(id); return id;
  });
  if(value.battle?.spatial) ensureSpatialEnemies(value.battle);
  value.hp = Math.min(value.hp, 100);
  value.mp = Math.min(value.mp, 30);
  if (value.guard.seconds <= 1e-8 || value.guard.amount <= 0 || ["victory","defeat"].includes(value.battle?.phase ?? "")) value.guard = { amount: 0, seconds: 0 };
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
  if (!state.arcanaCombat.battle && state.location === "arcana_hunting_ground" && state.flags.arcana_slime_encounter_active) {
    state.arcanaCombat.battle = { id: randomUUID(), phase: "ready", enemyHp: slimeMonster.maxHp, attackIn: 6, paused: true, log: ["슬라임이 몸을 기울입니다. 준비되면 전투를 시작하세요."] };
  }
}
export function pauseArcanaCombat(state: GameState) {
  if (state.arcanaCombat.battle && (state.arcanaCombat.battle.phase === "battle" || state.arcanaCombat.battle.spatial)) state.arcanaCombat.battle.paused = true;
}
export function tickArcanaCombat(state: GameState, seconds: number) {
  const c = state.arcanaCombat, b = c.battle;
  if (b?.spatial) { tickSpatialCombat(state, seconds); return; }
  if (b?.phase === "battle" && b.paused) return;
  let remaining = seconds;
  while (remaining > 1e-8) {
    const fighting = b?.phase === "battle";
    const step = fighting ? Math.min(remaining, b.attackIn) : remaining;
    tickSpellTimers(state,step);
    c.evadeSeconds = Math.max(0, c.evadeSeconds - step);
    remaining -= step;
    if (!fighting) break;
    b.attackIn = Math.max(0, b.attackIn - step);
    if (b.attackIn > 1e-8) continue;
    if (c.evadeSeconds > 1e-8) { trainArcanaSkill(state, c.evadeSkill, 10); line(state, "회피 성공 · 슬라임의 도약을 피했습니다. 피해 0"); }
    else {
      const damage = absorbArcanaDamage(state,slimeMonster.attack);
      line(state, "슬라임의 도약 · " + (damage.absorbed ? "장막 흡수 " + damage.absorbed + " · " : "") + "HP −" + damage.hurt);
    }
    b.attackIn = 6;
    if (c.hp === 0) {
      b.phase = "defeat"; b.paused = true;
      clearFlameGuard(state);
      c.hp = Math.ceil(arcanaStats(state).maxHp * .3);
      state.location = "arcana_plaza"; state.sceneId = "arcana_plaza_repeat_intro"; state.activeEventId = null;
      state.flags.visited_arcana_plaza = true; state.flags.arcana_slime_encounter_active = false;
      line(state, "전투 불능 · 광장으로 귀환했습니다. HP 30% 복구 · 스킬 숙련도 유지");
      appendLogEntry(state, "슬라임에게 패배해 광장으로 귀환했다. 스킬 숙련도는 유지된다."); break;
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
  if (action.command === "accept_slime_quest" || action.command === "claim_slime_quest") { performSlimeQuest(state, action.command === "claim_slime_quest"); return; }
  if (action.command === "dev_sofa_rest") {
    if (process.env.NODE_ENV === "production") throw new Error("개발 환경에서만 사용할 수 있습니다.");
    if (state.location !== "arcana_inn" || c.battle) throw new Error("전투를 마친 뒤 여관 로비의 소파에서 쉬어 주세요.");
    const stats = arcanaStats(state);
    const changed = c.hp < stats.maxHp || c.mp < stats.maxMp;
    c.hp = stats.maxHp; c.mp = stats.maxMp;
    if (changed) appendLogEntry(state, "벽난로 곁 소파에서 쉬었다. HP와 MP가 모두 회복되었다.");
    return;
  }
  if (action.command === "invest_skill" || action.command === "reset_skill_tree") {
    if (!action.spellId || !isArcanaSpell(action.spellId)) throw new Error("스킬을 선택해 주세요.");
    if (action.command === "invest_skill") investSkillTree(state,action.spellId,action.nodeId ?? "");
    else resetSkillTree(state,action.spellId);
    return;
  }
  if (action.command === "equip_spell") {
    if (action.slotIndex === undefined) throw new Error("변경할 슬롯을 선택해 주세요.");
    equipArcanaSkill(state, action.slotIndex, action.spellId);
    return;
  }
  if (action.command === "learn_spell") {
    if (!action.spellId || !isArcanaSpell(action.spellId)) throw new Error("배울 스킬을 선택해 주세요.");
    const known = spellUnlocked(state,action.spellId);
    learnArcanaSpell(state,action.spellId);
    if (!known) appendLogEntry(state,`${ARCANA_SPELLS[action.spellId].name}을 배웠다.`);
    return;
  }
  if (isArcanaSpell(action.command)) assertSpellReady(state,action.command);
  if (action.spatial && !isUltimate(action.command) && (action.command === "fireball" || action.command === "flame_wave" || isUltimate(action.command)) && (!action.spatial.aim || Math.hypot(action.spatial.aim.x,action.spatial.aim.y) < .001)) throw new Error("발사 방향을 선택해 주세요.");
  const movementSkill = action.command === "teleport" ? "teleport" : "dodge";
  const movementName = movementSkill === "teleport" ? "텔레포트" : "대시";
  ensureArcanaEncounter(state);
  if (!c.battle && action.spatial && (action.command === "fireball" || action.command === "flame_wave" || isUltimate(action.command))) {
    if (state.location !== "arcana_plaza") throw new Error("광장에서만 이 슬라임을 상대할 수 있습니다.");
    createSpatialBattle(state, action.spatial.position);
    action = { ...action, battleId: c.battle!.id };
  }
  const b = c.battle;
  if (action.command === "spatial_sync") return;
  if (isUltimate(action.command) && !b?.spatial) throw new Error("궁극기는 공간 전투에서 사용해 주세요.");
  if (action.command === "buy_item" || action.command === "sell_item") {
    tradeArcanaShop(state, action.command, action.itemId ?? "", action.quantity ?? 1);
    return;
  }
  if (action.command === "buy_potion" || action.command === "rest") {
    const shop = action.command === "buy_potion";
    if (b || state.location !== (shop ? "arcana_shop" : "arcana_inn")) throw new Error("해당 시설에서 이용해 주세요.");
    if (!shop && c.hp >= arcanaStats(state).maxHp) throw new Error("HP가 이미 가득 찼습니다.");
    if (state.money < (shop ? 10 : 100)) throw new Error(`소지금 ${shop ? 10 : 100}골드가 필요합니다.`);
    state.money -= shop ? 10 : 100;
    if (shop) state.inventory.manaPotion = (state.inventory.manaPotion || 0) + 1;
    else c.hp = arcanaStats(state).maxHp;
    appendLogEntry(state, shop ? "10골드로 마나 포션 1개를 구입했다." : "여관에서 상처를 치료했다. HP 완전 회복"); return;
  }
  if (action.command === "potion" && !b) { useArcanaPotion(state); return; }
  if (action.command === "flame_guard" && !b) { castFlameGuard(state); return; }
  if ((action.command === "dodge" || action.command === "teleport") && !b) {
    if (c.cooldowns[movementSkill] > 1e-8) throw new Error(`${movementName} 재사용 대기 중입니다.`);
    c.evadeSeconds = .3; c.evadeSkill = movementSkill; c.cooldowns[movementSkill] = movementSkill === "teleport" ? 0 : 5; return;
  }
  if (!b || action.battleId !== b.id) throw new Error("전투 상태가 바뀌었습니다. 화면을 갱신해 주세요.");
  if (action.command === "finish") {
    if (b.phase !== "victory" && b.phase !== "defeat") throw new Error("아직 전투가 끝나지 않았습니다.");
    c.battle = null; state.flags.arcana_slime_encounter_active = false;
    clearFlameGuard(state);
    state.sceneId = state.location === "arcana_plaza" ? "arcana_plaza_repeat_intro" : "arcana_hunting_ground_repeat_intro"; return;
  }
  if (b.spatial) {
    if (action.spatial?.visibleEnemyIds) b.spatial.visibleEnemyIds=action.spatial.visibleEnemyIds;
    if (isUltimate(action.command)) {castSpatialUltimate(state,action.command,action.spatial?.aim,action.spatial?.target);return;}
    if ((action.command === "dodge" || action.command === "teleport")) {
      if (b.paused || ["victory","defeat"].includes(b.phase)) throw new Error(`현재는 ${movementName}를 사용할 수 없습니다.`);
      if (c.cooldowns[movementSkill] > 1e-8) throw new Error(`${movementName} 재사용 대기 중입니다.`);
      if (!action.spatial?.aim) throw new Error("이동 방향을 선택해 주세요.");
      moveSpatialSkill(state, action.spatial.aim);
      c.evadeSeconds = .3; c.evadeSkill = movementSkill; c.cooldowns[movementSkill] = movementSkill === "teleport" ? 0 : 5; return;
    }
    if (action.command === "pause") { b.paused = true; return; }
    if (action.command === "resume") { b.paused = false; return; }
    if (action.command === "retreat" && !["victory", "defeat"].includes(b.phase)) { clearFlameGuard(state); returnSpatialBattle(b); return; }
    if (action.command === "flame_wave") {
      if (!action.spatial?.aim) throw new Error("발사 방향을 선택해 주세요.");
      castSpatialFlameWave(state,action.spatial.aim); return;
    }
    if (action.command === "flame_guard") {
      if (b.paused || b.spatial.behavior === "return" || ["victory","defeat"].includes(b.phase)) throw new Error("현재는 장막을 사용할 수 없습니다.");
      castFlameGuard(state); spatialEvent(b,"guard",b.spatial.player,c.guard.amount); return;
    }
    if (action.command === "fireball") {
      if (!action.spatial?.aim) throw new Error("발사 방향을 선택해 주세요.");
      castSpatialFireball(state, action.spatial.aim); return;
    }
  }
  if (action.command === "retreat") {
    if (b.phase !== "ready" && b.phase !== "battle") throw new Error("전투 결과를 먼저 확인해 주세요.");
    c.battle = null; state.flags.arcana_slime_encounter_active = false; state.sceneId = "arcana_hunting_ground_repeat_intro";
    clearFlameGuard(state);
    appendLogEntry(state, "슬라임과 거리를 벌려 평원 입구로 물러났다."); return;
  }
  if (action.command === "start") {
    if (b.phase !== "ready") throw new Error("이미 시작한 전투입니다.");
    b.phase = "battle"; b.paused = state.activeClock.paused; line(state, "전투 시작 · 도약 예고를 보고 회피하세요."); return;
  }
  if (action.command === "potion" && b.phase !== "battle") { useArcanaPotion(state); return; }
  if (action.command === "flame_guard" && b.phase === "ready") { castFlameGuard(state); line(state,"불꽃 장막 · 보호막 " + c.guard.amount); return; }
  if (b.phase !== "battle") throw new Error("진행 중인 전투가 아닙니다.");
  if (action.command === "pause") { b.paused = true; return; }
  if (action.command === "resume") { b.paused = false; return; }
  if (b.paused) throw new Error("전투를 재개해 주세요.");
  if (action.command === "potion") { useArcanaPotion(state); return; }
  if (action.command === "flame_guard") { castFlameGuard(state); line(state,"불꽃 장막 · 보호막 " + c.guard.amount); return; }
  if ((action.command === "dodge" || action.command === "teleport")) {
    if (c.cooldowns[movementSkill] > 1e-8) throw new Error(`${movementName} 재사용 대기 중입니다.`);
    c.evadeSeconds = .3; c.evadeSkill = movementSkill; c.cooldowns[movementSkill] = movementSkill === "teleport" ? 0 : 5; line(state, `${movementName} · 진행 방향으로 이동하며 0.3초 동안 공격을 피합니다.`); return;
  }
  if (action.command === "fireball" || action.command === "flame_wave" || isUltimate(action.command)) {
    spendSpell(state,action.command);
    const damage = spellMagnitude(state,action.command);
    const before = b.enemyHp; b.enemyHp = Math.max(0, b.enemyHp - damage);
    trainArcanaSkill(state, action.command, action.command === "fireball" ? (before>0 ? 10 : 0) : Math.min(before, damage));
    line(state, ARCANA_SPELLS[action.command].name + " · " + damage + " 피해 · 슬라임 HP " + before + " → " + b.enemyHp);
    if (b.enemyHp > 0) return;
    b.phase = "victory"; b.paused = true; state.flags.arcana_slime_encounter_active = false;
    clearFlameGuard(state);
    awardSlimeLoot(state);
    line(state, "승리 · +1 슬라임의 점액질"); appendLogEntry(state, "슬라임 처치 · +1 슬라임의 점액질"); return;
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
    if (state.location === "arcana_shop") return buildArcanaShopActions(state);
    if (state.location === "arcana_inn") return [
      ...(state.quests[SLIME_QUEST_ID] === "completed" ? [] : [state.quests[SLIME_QUEST_ID] === "active"
        ? choice(state, "claim_slime_quest", "마르텐에게 슬라임 퇴치 보고", `${slimeQuestProgress(state)}/10마리 · 보상 10골드`, slimeQuestProgress(state) >= 10)
        : choice(state, "accept_slime_quest", "퀘스트판 · 슬라임 퇴치 의뢰", "수락 후 10마리 처치 · 보상 10골드")]),
      ...(process.env.NODE_ENV !== "production" ? [choice(state, "dev_sofa_rest", "로비 소파에서 쉰다", "개발용 · 무료 · HP / MP 완전 회복")] : []),
      choice(state, "rest", "여관에서 치료받는다", "100골드 · 10분 · HP 완전 회복", state.money >= 100 && c.hp < arcanaStats(state).maxHp),
    ];
    return [];
  }
  if (b.spatial && b.phase === "ready") return [choice(state, "retreat", "추격을 끊고 물러난다")];
  if (b.phase === "ready") return [choice(state, "start", "슬라임과 싸운다", "슬라임 HP 30 · 공격력 5"), choice(state, "retreat", "거리를 두고 물러난다")];
  if (b.phase === "victory" || b.phase === "defeat") return [choice(state, "finish", b.phase === "victory" ? "전투를 마친다" : "광장에서 다시 준비한다")];
  if (b.paused) return [choice(state, "resume", "전투를 재개한다"), choice(state, "retreat", "후퇴한다")];
  return [...buildArcanaSpells(state).map(spell => choice(state,spell.id,spell.name,
      (spell.unlocked ? "" : "스킬 탭에서 습득 · ") + (spell.targeting === "self" ? spell.duration + "초간 보호막 " + spell.magnitude : (spell.targeting === "cone" ? "전방 90도 · 2칸 · " : "") + "피해 " + spell.magnitude) + " · MP " + spell.cost + " · 재사용 " + spell.cooldown + "초",
      spell.unlocked && equippedArcanaSkill(state, spell.id) && c.mp >= spell.cost && c.cooldowns[spell.id] <= 1e-8)),
    choice(state, "teleport", "텔레포트", "즉시 순간이동 · 0.3초 회피 · MP 0 · 재사용 0초", c.cooldowns.teleport <= 1e-8),
    choice(state, "dodge", "대시", "즉시 전방 이동 · 0.3초 회피 · 재사용 5초", c.cooldowns.dodge <= 1e-8),
    choice(state, "potion", "마나 포션", "MP +20 · 보유 " + (state.inventory.manaPotion || 0) + "개", Boolean(state.inventory.manaPotion) && c.mp < arcanaStats(state).maxMp && c.cooldowns.potion <= 1e-8),
    choice(state, "retreat", "후퇴한다", "보상 없이 전투 종료")];
}
export function buildArcanaScene(state: GameState): SceneCard | null {
  const b = state.arcanaCombat.battle;
  if (!b) return null;
  return { id: "arcana-combat:" + b.id + ":" + b.phase, locationId: state.location,
    title: b.phase === "victory" ? "슬라임 처치" : b.phase === "defeat" ? "광장으로 귀환" : b.spatial ? "광장의 슬라임" : "별빛 초원의 슬라임",
    paragraphs: [b.spatial && b.phase === "ready" ? (b.spatial.behavior === "return" ? "슬라임이 몸을 튕기며 원래 있던 자리로 돌아간다." : "초록빛 슬라임이 몸을 부풀렸다 줄인다. 아직 이쪽을 향해 달려들지는 않는다.") : b.phase === "ready" ? "초록빛 슬라임이 몸을 기울인다. 불꽃탄을 준비하고 먼저 다가갈 순간을 고른다." : b.log.at(-1) || "슬라임과 맞선다."],
    choices: [], materialIds: { locationIds: [state.location], personIds: [], itemIds: ["manaPotion"] }, source: "template", generatedAt: new Date().toISOString() };
}
