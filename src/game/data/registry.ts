/**
 * 게임 세계 객체 레지스트리
 * - 종류별로 객체를 관리하고, 추가/수정이 쉽도록 구성
 * - LLM 확장 시 이 레지스트리를 참조
 */

export { baseItems } from "./items";
export { basePeople } from "./people";
export { baseLocations, type BaseLocation } from "./locations";
export { questDefinitions } from "../quest-definitions";
export { baseSkills } from "../base-data";

import { baseItems } from "./items";
import { basePeople } from "./people";
import { baseLocations } from "./locations";
import { questDefinitions } from "../quest-definitions";
import { baseSkills } from "../base-data";

export const worldRegistry = {
  items: baseItems,
  people: basePeople,
  locations: baseLocations,
  quests: Object.fromEntries(questDefinitions.map((q) => [q.id, q])),
  skills: baseSkills,
} as const;

export type ItemId = keyof typeof baseItems;
export type PersonId = keyof typeof basePeople;
export type LocationId = keyof typeof baseLocations;
