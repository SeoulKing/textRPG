import type { GameState } from "./schemas";

// Prototype tuning: 100 XP per mastery point, 0..100. Effective contribution,
// capped by remaining HP/shield, prevents overkill and empty casts farming XP.
// Legacy mastery remains 0..100; fireball uses its own rising level thresholds.
export const ARCANA_MASTERY_XP_PER_POINT = 100;
export const ARCANA_MASTERY_XP_CAP = Number.MAX_SAFE_INTEGER;
export function skillMastery(state: GameState, id: string) {
  return Math.min(100, (state.arcanaCombat.skillTraining[id]?.xp ?? 0) / ARCANA_MASTERY_XP_PER_POINT);
}
export function trainArcanaSkill(state: GameState, id: string, contribution: number) {
  if (!Number.isFinite(contribution) || contribution <= 0) return;
  const entry = state.arcanaCombat.skillTraining[id] ??= { xp: 0, specializations: [], activeSpecialization: null };
  entry.xp = Math.min(ARCANA_MASTERY_XP_CAP, entry.xp + contribution);
}
export function equippedArcanaSkill(state: GameState, id: string) {
  return (state.arcanaCombat.activeSkills ?? state.arcanaCombat.learnedSpells ?? ["fireball"]).includes(id);
}
export function canChangeArcanaBuild(state: GameState) {
  const b = state.arcanaCombat.battle;
  return b?.phase !== "battle" && !b?.spatial?.projectiles.length && !state.npcDialogue.active && !state.subwayExpedition.active;
}
export function equipArcanaSkill(state: GameState, slot: number, id?: string) {
  if (!canChangeArcanaBuild(state)) throw new Error("전투와 대화·던전을 마친 뒤 장착을 변경해 주세요.");
  if (!Number.isInteger(slot) || slot < 0 || slot >= 6) throw new Error("액티브 슬롯을 선택해 주세요.");
  if (id && !state.arcanaCombat.learnedSpells?.some(skill => skill === id)) throw new Error("먼저 스킬을 배워 주세요.");
  const slots = state.arcanaCombat.activeSkills ??= [...(state.arcanaCombat.learnedSpells ?? ["fireball"]), null, null, null, null, null, null].slice(0, 6);
  if (id) for (let i = 0; i < slots.length; i++) if (slots[i] === id) slots[i] = null;
  slots[slot] = id ?? null;
  if (!slots.includes("flame_guard")) state.arcanaCombat.guard = { amount: 0, seconds: 0 };
}
