/**
 * Base game data exports.
 */

export const PHASES = ["morning", "late morning", "afternoon", "evening", "night"] as const;
export const SAVE_VERSION = 7;
export const REAL_DAY_MS = 15 * 60 * 1000;
export const PHASE_DURATION_MS = REAL_DAY_MS / PHASES.length;
export const AUTO_FULLNESS_TICK_MS = REAL_DAY_MS / 4;
export const STARVATION_TICK_MS = REAL_DAY_MS / 2;

export const baseSkills = {
  keenEye: {
    id: "keenEye",
    name: "예리한 눈",
    description: "작은 물자와 놓치기 쉬운 단서를 남들보다 먼저 발견한다.",
  },
  endure: {
    id: "endure",
    name: "버티기",
    description: "고된 이동과 수색 속에서도 쉽게 무너지지 않는다.",
  },
  barter: {
    id: "barter",
    name: "흥정",
    description: "거래가 필요한 순간, 손해를 조금 덜 본다.",
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
