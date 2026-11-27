import { appendLogEntry } from "../game/game-log";
import type { GameState } from "../game/schemas";
import { OnlineError } from "./accounts";

const woodGoal = 16;
const woodPerVisit = 2;

export type InnTable = {
  woodCollected: number;
  contributions: Record<string, { day: number; wood: number }>;
};

export function emptyInnTable(): InnTable {
  return { woodCollected: 0, contributions: {} };
}

export function innTableBonuses(table: InnTable) {
  return table.woodCollected >= woodGoal
    ? { fishLimitBonus: 6, mealLimitBonus: 3 }
    : { fishLimitBonus: 0, mealLimitBonus: 0 };
}

export function innTableView(table: InnTable, state: GameState, characterId: string, day: number, canTrade: boolean) {
  const { woodCollected, contributions } = table;
  const ownedWood = state.inventory.wood ?? 0;
  const open = woodCollected >= woodGoal;
  const contributionSize = Math.min(woodPerVisit, Math.max(0, woodGoal - woodCollected));
  const contribution = contributions[characterId];
  const contributedToday = contribution?.day === day;
  return {
    woodGoal, woodCollected, ownedWood, contributionSize, open, contributedToday,
    contributedWood: contribution?.wood ?? 0,
    canContribute: canTrade && !open && !contributedToday && ownedWood >= contributionSize,
    ...innTableBonuses(table),
  };
}

export function contributeInnTable(table: InnTable, state: GameState, characterId: string, day: number) {
  const view = innTableView(table, state, characterId, day, true);
  if (view.open) throw new OnlineError("inn_table_completed", "공동 식탁을 만드는 데 필요한 목재가 모두 모였습니다.");
  if (view.contributedToday) throw new OnlineError("inn_table_already_contributed", "오늘은 이미 공동 식탁에 목재를 보탰습니다.");
  if (!view.canContribute) throw new OnlineError("inn_table_wood_required", `공동 식탁에 보탤 목재가 ${view.contributionSize}개 필요합니다.`);

  const { contributionSize } = view;
  const remaining = view.ownedWood - contributionSize;
  if (remaining) state.inventory.wood = remaining;
  else delete state.inventory.wood;
  table.woodCollected += contributionSize;
  table.contributions[characterId] = { day, wood: view.contributedWood + contributionSize };
  appendLogEntry(state, table.woodCollected >= woodGoal
    ? `목재 ${contributionSize}개를 보태 분수 광장 주민들이 함께 쓰는 여관 식탁이 열렸다.`
    : `여관 공동 식탁에 목재 ${contributionSize}개를 보탰다. ${table.woodCollected}/${woodGoal}개가 모였다.`);
}
