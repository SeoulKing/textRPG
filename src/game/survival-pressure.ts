import { AUTO_ENERGY_TICK_MS, EXHAUSTION_TICK_MS, GAME_MINUTE_MS } from "./base-data";
import { appendLogEntry } from "./game-log";
import type { GameState } from "./schemas";

export const MAX_EXHAUSTION_LEVEL = 4;
const EPSILON = 1e-7;

/** End each clock step at an energy or exhaustion boundary, including during sleep. */
export function millisecondsToSurvivalPressure(state: GameState, energyRate = 1) {
  const untilEnergy = energyRate > 0
    ? Math.max(0, AUTO_ENERGY_TICK_MS - state.autoEnergyElapsedMs) / energyRate : Infinity;
  const untilExhaustion = state.stats.energy === 0
    ? Math.max(0, EXHAUSTION_TICK_MS - state.exhaustionElapsedMs) : Infinity;
  return Math.min(untilEnergy, untilExhaustion);
}

/** The caller has already advanced time to the next boundary, but not applied its effects. */
export function advanceSurvivalPressure(state: GameState, elapsedMs: number, drainEnergy: () => void, energyRate = 1) {
  // Reaching zero at the end of this step does not make the preceding hour unfed.
  if (state.stats.energy === 0) state.exhaustionElapsedMs += elapsedMs;
  state.autoEnergyElapsedMs += elapsedMs * Math.max(0, energyRate);
  while (state.autoEnergyElapsedMs >= AUTO_ENERGY_TICK_MS - EPSILON) {
    state.autoEnergyElapsedMs = Math.max(0, state.autoEnergyElapsedMs - AUTO_ENERGY_TICK_MS);
    const before = state.stats.energy;
    // Preserve the shared energy → mind → HP cost rule when energy is empty.
    drainEnergy();
    if (before > 0 && state.stats.energy === 0) appendLogEntry(state, "기력이 바닥났다. 이 상태로 보낸 시간이 12시간 쌓일 때마다 탈진이 한 단계 깊어진다.");
  }
  while (state.exhaustionElapsedMs >= EXHAUSTION_TICK_MS - EPSILON && state.exhaustionLevel < MAX_EXHAUSTION_LEVEL) {
    state.exhaustionElapsedMs = Math.max(0, state.exhaustionElapsedMs - EXHAUSTION_TICK_MS);
    state.exhaustionLevel += 1;
    appendLogEntry(state, `탈진 Lv${state.exhaustionLevel}${state.exhaustionLevel === 3 ? ": 음식을 먹지 않으면 다음 단계에서 더는 버틸 수 없다." : ""}`);
  }
}

/** Food removes accumulated burden, including the unfinished part of a level. */
export function relieveExhaustion(state: GameState, amount: number) {
  if (amount <= 0) return;
  const burden = Math.max(0, state.exhaustionLevel * EXHAUSTION_TICK_MS + state.exhaustionElapsedMs - amount * EXHAUSTION_TICK_MS);
  state.exhaustionLevel = Math.floor(burden / EXHAUSTION_TICK_MS);
  state.exhaustionElapsedMs = burden % EXHAUSTION_TICK_MS;
}

export function exhaustionCard(state: GameState) {
  if (state.exhaustionLevel === 0) return null;
  return {
    kind: "exhaustion" as const, label: "탈진", level: Math.min(MAX_EXHAUSTION_LEVEL, state.exhaustionLevel),
    nextDamageMinutes: null,
    nextWorseningMinutes: state.stats.energy === 0
      ? Math.max(0, Math.ceil((EXHAUSTION_TICK_MS - state.exhaustionElapsedMs) / GAME_MINUTE_MS - EPSILON)) : null,
  };
}
