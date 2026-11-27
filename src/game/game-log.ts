import { REAL_DAY_MS } from "./base-data";
import type { GameState } from "./schemas";

/** 게임 내 시계(06:00를 하루 시작으로 하는 표시 시각) 기준, 자정 이후 경과 분(0–1439). */
export function getGameClockShiftedMinutes(worldElapsedMs: number) {
  const elapsedInDay = ((worldElapsedMs % REAL_DAY_MS) + REAL_DAY_MS) % REAL_DAY_MS;
  const totalMinutes = Math.floor((elapsedInDay / REAL_DAY_MS) * 24 * 60);
  return (totalMinutes + 6 * 60) % (24 * 60);
}

export function formatClockLabelFromElapsed(worldElapsedMs: number) {
  const shiftedMinutes = getGameClockShiftedMinutes(worldElapsedMs);
  const hours = String(Math.floor(shiftedMinutes / 60)).padStart(2, "0");
  const minutes = String(shiftedMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatLogTimestamp(day: number, worldElapsedMs: number) {
  return `${day}일차 ${formatClockLabelFromElapsed(worldElapsedMs)}`;
}

export function appendLogEntry(state: GameState, message: string) {
  state.log.unshift({
    timestampLabel: formatLogTimestamp(state.day, state.worldElapsedMs),
    message,
  });
  state.log = state.log.slice(0, 20);
}
