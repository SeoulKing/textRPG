import { GAME_MINUTE_MS } from "./base-data";
import type { GameState } from "./schemas";
import type { RestActivityDefinition } from "./schemas/activity";

export function plannedRestMinutes(state: GameState, rest: RestActivityDefinition) {
  const clockMinutes = (((state.worldElapsedMs + (state.clockRemainderMs ?? 0)) / GAME_MINUTE_MS + 360) % 1440 + 1440) % 1440;
  const remaining = clockMinutes >= rest.startsAtHour * 60 && clockMinutes < rest.untilHour * 60 ? rest.untilHour * 60 - clockMinutes : 0;
  return remaining > 1e-7 ? remaining : 0;
}

export function restDanger(state: GameState) {
  if (state.isGameOver || state.stageClear) return state.gameOverReason || "상황이 종료되었다.";
  if (state.stats.hp <= 3) return "체력이 너무 낮아 몸 상태부터 돌봐야 한다.";
  if (state.exhaustionLevel >= 3) return "탈진이 깊어 음식을 먼저 확보해야 한다.";
  if (state.conditions.injury.level >= 3) return "부상이 심해 치료부터 해야 한다.";
  if (state.conditions.infection.level >= 3) return "감염이 심해 치료부터 해야 한다.";
  return null;
}

export function restInterruption(before: GameState, now: GameState) {
  const danger = restDanger(now);
  if (danger) return danger;
  if (now.conditions.injury.level > before.conditions.injury.level) return "부상이 악화되어 몸 상태부터 살펴야 한다.";
  if (now.conditions.infection.level > before.conditions.infection.level) return "감염이 악화되어 치료가 필요하다.";
  if (now.exhaustionLevel > before.exhaustionLevel) return "탈진이 한 단계 깊어져 음식을 챙겨야 한다.";
  if (before.stats.energy > 0 && now.stats.energy === 0) return "기력이 바닥나 끼니를 챙길 때가 되었다.";
  return null;
}

export function restChoiceHint(state: GameState, rest: RestActivityDefinition) {
  const minutes = Math.ceil(plannedRestMinutes(state, rest));
  return `${String(rest.untilHour % 24).padStart(2, "0")}:00까지 · 최대 ${minutes}분 / ${state.stats.energy > 0 ? "기력 0·상태 악화 시 멈춤" : "상태가 더 악화되면 멈춤"}`;
}

export function restParagraphs(rest: RestActivityDefinition, elapsedMinutes: number, reason?: string) {
  const duration = elapsedMinutes < 1 ? "잠깐" : `${Number.isInteger(elapsedMinutes) ? "" : "약 "}${Math.round(elapsedMinutes)}분 동안`;
  return [
    `자리를 잡고 움직임을 멈춘다. ${duration} 쉬며 천천히 숨을 고른다.`,
    reason ? `${reason} 더 기다리지 않고 휴식을 멈춘다.`
      : `${String(rest.untilHour % 24).padStart(2, "0")}:00이 되어 휴식을 마친다. 쉬는 동안에도 시간은 흘렀다.`,
  ];
}
