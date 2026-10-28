import { skillMastery, trainArcanaSkill, equippedArcanaSkill, canChangeArcanaBuild } from "./arcana-skill-training";
import type { GameState } from "./schemas";

export const ARCANA_SPELLS = {
  fireball: { id: "fireball", name: "파이어볼", school: "fire", schoolName: "화염", unlockLevel: 1, cost: 4, cooldown: 3, ratio: .5, targeting: "projectile", thumbnail: "fireball", rangeTiles: 6, angle: 0, duration: 0 },
  flame_wave: { id: "flame_wave", name: "화염파", school: "fire", schoolName: "화염", unlockLevel: 2, cost: 8, cooldown: 8, ratio: 1, targeting: "cone", thumbnail: "flame-wave", rangeTiles: 2, angle: 90, duration: 0 },
  flame_guard: { id: "flame_guard", name: "불꽃 장막", school: "fire", schoolName: "화염", unlockLevel: 3, cost: 6, cooldown: 12, ratio: 1, targeting: "self", thumbnail: "flame-guard", rangeTiles: 0, angle: 0, duration: 4 },
} as const;
export type ArcanaSpellId = keyof typeof ARCANA_SPELLS;
export const ARCANA_COOLDOWN_IDS = ["fireball", "flame_wave", "flame_guard", "dodge", "potion"] as const;
export function isArcanaSpell(id: string): id is ArcanaSpellId {
  return Object.prototype.hasOwnProperty.call(ARCANA_SPELLS, id);
}
export function spellUnlocked(state: GameState, id: ArcanaSpellId) {
  const spell = ARCANA_SPELLS[id], c = state.arcanaCombat;
  return (c.learnedSpells ?? ["fireball"]).includes(id);
}
export function learnArcanaSpell(state: GameState, id: ArcanaSpellId) {
  const c = state.arcanaCombat, spell = ARCANA_SPELLS[id];
  if (!canChangeArcanaBuild(state)) throw new Error("전투와 대화·던전을 마친 뒤 배워 주세요.");
  c.learnedSpells ??= ["fireball"];
  if (!c.learnedSpells.includes(id)) c.learnedSpells.push(id);
}
export function spellMagnitude(state: GameState, id: ArcanaSpellId) {
  return Math.floor((10 + Math.floor(skillMastery(state, id) / 10) * 2) * ARCANA_SPELLS[id].ratio);
}
export function assertSpellReady(state: GameState, id: ArcanaSpellId) {
  const spell = ARCANA_SPELLS[id], c = state.arcanaCombat;
  if (!spellUnlocked(state, id)) throw new Error(`${spell.name}을 먼저 배워 주세요.`);
  if (!equippedArcanaSkill(state, id)) throw new Error(`${spell.name}을 액티브 슬롯에 장착해 주세요.`);
  if (c.cooldowns[id] > 1e-8) throw new Error(`${spell.name} 재사용 대기 중입니다.`);
  if (c.mp < spell.cost) throw new Error(`MP가 ${spell.cost} 이상 필요합니다.`);
}
export function spendSpell(state: GameState, id: ArcanaSpellId) {
  assertSpellReady(state, id);
  state.arcanaCombat.mp -= ARCANA_SPELLS[id].cost;
  state.arcanaCombat.cooldowns[id] = ARCANA_SPELLS[id].cooldown;
}
export function clearFlameGuard(state: GameState) {
  state.arcanaCombat.guard = { amount: 0, seconds: 0 };
}
export function tickSpellTimers(state: GameState, seconds: number) {
  const c = state.arcanaCombat;
  for (const id of ARCANA_COOLDOWN_IDS) c.cooldowns[id] = Math.max(0, c.cooldowns[id] - seconds);
  c.guard.seconds = Math.max(0, c.guard.seconds - seconds);
  if (c.guard.seconds <= 1e-8) clearFlameGuard(state);
}
export function castFlameGuard(state: GameState) {
  spendSpell(state, "flame_guard");
  state.arcanaCombat.guard = { amount: spellMagnitude(state, "flame_guard"), seconds: ARCANA_SPELLS.flame_guard.duration };
}
export function absorbArcanaDamage(state: GameState, damage: number) {
  const c = state.arcanaCombat;
  const absorbed = Math.min(damage, c.guard.seconds > 1e-8 ? c.guard.amount : 0);
  if (absorbed > 0) trainArcanaSkill(state, "flame_guard", absorbed);
  c.guard.amount -= absorbed;
  if (c.guard.amount <= 0) clearFlameGuard(state);
  const hurt = damage - absorbed;
  c.hp = Math.max(0, c.hp - hurt);
  return { absorbed, hurt };
}
export function buildArcanaSpells(state: GameState) {
  return Object.values(ARCANA_SPELLS).map(spell => ({ ...spell, unlockLevel: 0, unlocked: spellUnlocked(state, spell.id), learnable: !spellUnlocked(state, spell.id), schoolUnlocked: true, equipped: equippedArcanaSkill(state, spell.id), mastery: skillMastery(state, spell.id), masteryXp: state.arcanaCombat.skillTraining[spell.id]?.xp ?? 0, magnitude: spellMagnitude(state, spell.id) }));
}
