/**
 * 게임 기본 데이터 - 통합 re-export
 * 아이템/장소/인물은 src/game/data/ 에서 분리 관리
 */

export const PHASES = ["아침", "낮", "저녁", "밤", "새벽"] as const;
export const SAVE_VERSION = 6;
export const REAL_DAY_MS = 15 * 60 * 1000;
export const PHASE_DURATION_MS = REAL_DAY_MS / PHASES.length;
export const AUTO_FULLNESS_TICK_MS = REAL_DAY_MS / 4;
export const STARVATION_TICK_MS = REAL_DAY_MS / 2;

export const baseSkills = {
  keenEye: {
    id: "keenEye",
    name: "눈썰미",
    description: "숨은 물자, 낙서, 이상한 기척을 먼저 발견합니다.",
  },
  endure: {
    id: "endure",
    name: "버티기",
    description: "거친 수색과 이동에서 체력 손실을 덜 받습니다.",
  },
  barter: {
    id: "barter",
    name: "흥정",
    description: "거래 비용을 낮추고 사람들의 경계를 조금 더 빨리 풉니다.",
  },
} as const;

import { questDefinitions } from "./quest-definitions";
import { baseItems } from "./data/items";
import { basePeople } from "./data/people";
import { baseLocations } from "./data/locations";

export { baseItems, basePeople, baseLocations };

export function getQuestEntries() {
  return questDefinitions.map((q) => ({
    id: q.id,
    name: q.title,
    summary: q.description,
  }));
}

export function getSkillEntries() {
  return Object.values(baseSkills);
}

export function getPeopleEntries() {
  return Object.values(basePeople);
}
