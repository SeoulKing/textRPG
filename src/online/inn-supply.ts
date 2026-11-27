import { appendLogEntry, getGameClockShiftedMinutes } from "../game/game-log";
import type { GameState } from "../game/schemas";
import { OnlineError } from "./accounts";

const DAILY_FISH_LIMIT = 12;
const FISH_PRICE = 5;
const MEAL_PRICE = 8;
const EVENING_MINUTE = 18 * 60;
const MORNING_MINUTE = 6 * 60;

export const INN_SUPPLY_ACTIONS = ["deliver", "buyMeal"] as const;
export type InnSupplyAction = typeof INN_SUPPLY_ACTIONS[number];
export type InnSupplyRequest = { action: InnSupplyAction; actionId: string; day: number };
export type InnSupply = { day: number; delivered: number; fishStock: number; menuServings: number };

export function innMenuOpen(elapsedMs: number) {
  const minute = getGameClockShiftedMinutes(elapsedMs);
  return minute >= EVENING_MINUTE || minute < MORNING_MINUTE;
}

export function advanceInnSupply(saved: InnSupply | undefined, day: number, menuOpen: boolean): InnSupply {
  if (saved?.day !== day) return { day, delivered: 0, fishStock: 0, menuServings: 0 };
  if (menuOpen && saved.fishStock > 0) {
    saved.menuServings += saved.fishStock;
    saved.fishStock = 0;
  }
  return saved;
}

export function innSupplyView(supply: InnSupply, state: GameState, phaseIndex: number, menuOpen: boolean, canTrade: boolean) {
  const { day, fishStock, menuServings } = supply;
  const remaining = DAILY_FISH_LIMIT - supply.delivered;
  const owned = state.inventory.riverFish ?? 0;
  return {
    day, phaseIndex, fishStock, menuServings, remaining, owned, menuOpen,
    dailyLimit: DAILY_FISH_LIMIT, unitPrice: FISH_PRICE, mealPrice: MEAL_PRICE,
    canDeliver: canTrade && remaining > 0 && owned > 0 && Number.isSafeInteger(state.money + FISH_PRICE),
    canBuyMeal: canTrade && menuOpen && menuServings > 0 && state.money >= MEAL_PRICE
      && Number.isSafeInteger((state.inventory.grilledFish ?? 0) + 1),
  };
}

export function tradeInnSupply(supply: InnSupply, state: GameState, menuOpen: boolean, action: InnSupplyAction) {
  if (action === "deliver") {
    if (supply.delivered >= DAILY_FISH_LIMIT) {
      throw new OnlineError("inn_supply_order_filled", "오늘 여관 식재료 주문이 모두 찼습니다.");
    }
    const owned = state.inventory.riverFish ?? 0;
    if (owned < 1) {
      throw new OnlineError("inn_supply_fish_required", "납품할 민물고기가 한 마리 필요합니다.");
    }
    const money = state.money + FISH_PRICE;
    if (!Number.isSafeInteger(money)) {
      throw new OnlineError("inn_supply_balance_limit", "소지금이 너무 많아 납품 대금을 받을 수 없습니다.");
    }
    if (owned === 1) delete state.inventory.riverFish;
    else state.inventory.riverFish = owned - 1;
    state.money = money;
    supply.delivered++;
    if (menuOpen) supply.menuServings++;
    else supply.fishStock++;
    appendLogEntry(state, `여관에 민물고기 한 마리를 납품했다. +${FISH_PRICE}골드`);
    return;
  }

  if (!menuOpen || supply.menuServings < 1) {
    throw new OnlineError("inn_supply_no_servings", "지금 주문할 수 있는 생선구이가 없습니다.");
  }
  if (state.money < MEAL_PRICE) {
    throw new OnlineError("inn_supply_gold_required", `생선구이 한 접시에 ${MEAL_PRICE}골드가 필요합니다.`);
  }
  const bought = (state.inventory.grilledFish ?? 0) + 1;
  if (!Number.isSafeInteger(bought)) {
    throw new OnlineError("inn_supply_inventory_limit", "소지품에 생선구이를 더 담을 수 없습니다.");
  }
  state.money -= MEAL_PRICE;
  state.inventory.grilledFish = bought;
  supply.menuServings--;
  appendLogEntry(state, `여관에서 생선구이 한 접시를 샀다. -${MEAL_PRICE}골드`);
}
