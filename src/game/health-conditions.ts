import type { GameState, ItemCard } from "./schemas";
import { HealthConditionsSchema, type HealthConditionKind } from "./schemas/health-condition";
import { setSystemNote } from "./system-note";
import { appendLogEntry } from "./game-log";

export const CONDITION_LABELS = { injury: "부상", infection: "감염" } as const;
export const CONDITION_BASE_MINUTES = { injury: 60, infection: 120 } as const;
export const INFECTION_WORSENING_MINUTES = 360;
export const SLEEP_CONDITION_RATE = 0.25;
const KINDS = ["injury", "infection"] as const;
const EPSILON = 1e-9;

export function normalizeHealthConditions(raw: unknown) {
  const parsed = HealthConditionsSchema.safeParse(raw);
  const conditions = parsed.success ? parsed.data : HealthConditionsSchema.parse({});
  for (const kind of KINDS) {
    if (!conditions[kind].level) conditions[kind].damageProgress = 0;
  }
  if (!conditions.infection.level) conditions.infection.worseningElapsedMinutes = 0;
  return conditions;
}

export function healthFailureReason(state: GameState) {
  for (const kind of KINDS) {
    if (state.conditions[kind].level >= 4) return `${CONDITION_LABELS[kind]}이 Lv4에 도달해 더는 버틸 수 없었다.`;
  }
  return state.stats.hp <= 0 ? "몸이 더는 생존을 버티지 못했다." : "";
}

export function checkHealthFailure(state: GameState) {
  const reason = healthFailureReason(state);
  if (!reason || state.isGameOver || state.stageClear) return;
  state.isGameOver = true;
  state.gameOverReason = reason;
  setSystemNote(state, [{ type: "text", text: reason, tone: "negative" }]);
  appendLogEntry(state, `생존 실패: ${reason}`);
}

export function addHealthCondition(state: GameState, kind: HealthConditionKind, chancePercent: number, rng = Math.random) {
  if (state.isGameOver || state.stageClear || chancePercent <= 0) return;
  if (chancePercent < 100 && rng() * 100 >= chancePercent) return;
  const condition = state.conditions[kind];
  condition.level = Math.min(4, condition.level + 1);
  appendLogEntry(state, `${CONDITION_LABELS[kind]} Lv${condition.level}`);
  checkHealthFailure(state);
}

type TreatmentEffects = Partial<Pick<ItemCard["effects"], "injuryRelief" | "infectionRelief">>;
export function canApplyTreatment(state: GameState, effects: TreatmentEffects) {
  const hasTreatment = (effects.injuryRelief ?? 0) > 0 || (effects.infectionRelief ?? 0) > 0;
  return !hasTreatment || ((effects.injuryRelief ?? 0) > 0 && state.conditions.injury.level > 0)
    || ((effects.infectionRelief ?? 0) > 0 && state.conditions.infection.level > 0);
}

export function applyTreatment(state: GameState, effects: TreatmentEffects) {
  if (state.isGameOver || state.stageClear) return;
  for (const kind of KINDS) {
    const amount = effects[kind === "injury" ? "injuryRelief" : "infectionRelief"] ?? 0;
    if (amount <= 0 || state.conditions[kind].level === 0) continue;
    const condition = state.conditions[kind];
    condition.level = Math.max(0, condition.level - amount);
    if (condition.level === 0) condition.damageProgress = 0;
    if (kind === "infection") state.conditions.infection.worseningElapsedMinutes = 0;
    appendLogEntry(state, `${CONDITION_LABELS[kind]} 치료: Lv${condition.level}`);
  }
}

/** Minutes at full condition speed until the next damage or worsening event. */
export function minutesToConditionEvent(state: GameState) {
  let minutes = Infinity;
  for (const kind of KINDS) {
    const condition = state.conditions[kind];
    if (condition.level > 0) minutes = Math.min(minutes,
      Math.max(0, 1 - condition.damageProgress) * CONDITION_BASE_MINUTES[kind] / condition.level);
  }
  if (state.conditions.infection.level > 0) minutes = Math.min(minutes,
    Math.max(0, INFECTION_WORSENING_MINUTES - state.conditions.infection.worseningElapsedMinutes));
  return minutes;
}

/** Caller advances the world clock first, in steps ending at the next event. */
export function advanceConditions(state: GameState, minutes: number) {
  let damage = 0;
  for (const kind of KINDS) {
    const condition = state.conditions[kind];
    if (condition.level > 0) condition.damageProgress += minutes * condition.level / CONDITION_BASE_MINUTES[kind];
  }
  const infection = state.conditions.infection;
  if (infection.level > 0) {
    infection.worseningElapsedMinutes += minutes;
    if (infection.worseningElapsedMinutes >= INFECTION_WORSENING_MINUTES - EPSILON) {
      infection.worseningElapsedMinutes = Math.max(0, infection.worseningElapsedMinutes - INFECTION_WORSENING_MINUTES);
      addHealthCondition(state, "infection", 100);
    }
  }
  for (const kind of KINDS) {
    if (state.isGameOver) break;
    const condition = state.conditions[kind];
    if (condition.level > 0 && condition.damageProgress >= 1 - EPSILON) {
      condition.damageProgress = Math.max(0, condition.damageProgress - 1);
      state.stats.hp = Math.max(0, state.stats.hp - 1);
      damage += 1;
      appendLogEntry(state, `${CONDITION_LABELS[kind]} 지속 피해: 체력 -1`);
      checkHealthFailure(state);
    }
  }
  // Both conditions may have reached their damage boundary on the fatal tick.
  for (const kind of KINDS) state.conditions[kind].damageProgress = Math.min(1, state.conditions[kind].damageProgress);
  return damage;
}

export function conditionCards(state: GameState) {
  return KINDS.filter(kind => state.conditions[kind].level > 0).map(kind => {
    const condition = state.conditions[kind];
    return {
      kind, label: CONDITION_LABELS[kind], level: condition.level,
      nextDamageMinutes: Math.max(0, Math.ceil((1 - condition.damageProgress) * CONDITION_BASE_MINUTES[kind] / condition.level - EPSILON)),
      nextWorseningMinutes: kind === "infection" ? Math.max(0, Math.ceil(INFECTION_WORSENING_MINUTES - state.conditions.infection.worseningElapsedMinutes)) : null,
    };
  });
}
