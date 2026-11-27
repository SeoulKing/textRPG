import { z } from "zod";
import { baseItems } from "../game/data/items";
import { appendLogEntry, getGameClockShiftedMinutes } from "../game/game-log";
import type { GameState } from "../game/schemas";
import { OnlineError } from "./accounts";
import type { innTableBonuses } from "./inn-table";

const DAILY_FISH_LIMIT = 12;
const DAILY_MEAL_LIMIT = 6;
const FISH_PRICE = 5;
const EVENING_MINUTE = 18 * 60;
const MORNING_MINUTE = 6 * 60;
const NORMAL_MEAL = "grilledFish";
const mealIdSchema = z.enum([NORMAL_MEAL, "grilledFishFine", "grilledFishExcellent"]);
type MealId = z.infer<typeof mealIdSchema>;
type PremiumMealId = Exclude<MealId, typeof NORMAL_MEAL>;
const mealPrices = {
  grilledFish: { sellPrice: 6, buyPrice: 8 },
  grilledFishFine: { sellPrice: 8, buyPrice: 11 },
  grilledFishExcellent: { sellPrice: 10, buyPrice: 14 },
} satisfies Record<MealId, { sellPrice: number; buyPrice: number }>;

export const innSupplyActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("deliver") }),
  z.object({ action: z.literal("buyMeal"), itemId: mealIdSchema.optional() }),
  z.object({ action: z.literal("sellMeal"), itemId: mealIdSchema }),
  z.object({ action: z.literal("donateWood") }),
]);
type InnSupplyAction = z.infer<typeof innSupplyActionSchema>;
type InnStockAction = Exclude<InnSupplyAction, { action: "donateWood" }>;
type InnSupplyBonuses = ReturnType<typeof innTableBonuses>;
export type InnSupplyRequest = InnSupplyAction & { actionId: string; day: number };
export type InnSupply = {
  day: number;
  delivered: number;
  fishStock: number;
  menuServings: number;
  mealDelivered?: number;
  premiumMealServings?: Partial<Record<PremiumMealId, number>>;
};

export function innSupplyFingerprint(request: InnSupplyRequest) {
  const { action, day } = request;
  const itemId = action === "sellMeal" || (action === "buyMeal" && request.itemId !== NORMAL_MEAL)
    ? request.itemId : undefined;
  // The existing receipt fingerprint omits undefined values, including the default meal.
  return { type: "inn_supply", action, day, itemId };
}

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

function mealServings(supply: InnSupply, itemId: MealId) {
  return itemId === NORMAL_MEAL ? supply.menuServings : supply.premiumMealServings?.[itemId] ?? 0;
}

function setMealServings(supply: InnSupply, itemId: MealId, servings: number) {
  if (itemId === NORMAL_MEAL) supply.menuServings = servings;
  else (supply.premiumMealServings ??= {})[itemId] = servings;
}

function deliveryLimits({ fishLimitBonus, mealLimitBonus }: InnSupplyBonuses) {
  return { dailyLimit: DAILY_FISH_LIMIT + fishLimitBonus, mealDeliveryLimit: DAILY_MEAL_LIMIT + mealLimitBonus };
}

export function innSupplyView(supply: InnSupply, state: GameState, phaseIndex: number, menuOpen: boolean, canTrade: boolean, bonuses: InnSupplyBonuses) {
  const { day, fishStock, menuServings } = supply;
  const { dailyLimit, mealDeliveryLimit } = deliveryLimits(bonuses);
  const remaining = dailyLimit - supply.delivered;
  const owned = state.inventory.riverFish ?? 0;
  const mealDeliveryRemaining = mealDeliveryLimit - (supply.mealDelivered ?? 0);
  const meals = mealIdSchema.options.map(itemId => {
    const { sellPrice, buyPrice } = mealPrices[itemId];
    const owned = state.inventory[itemId] ?? 0;
    const servings = mealServings(supply, itemId);
    return {
      itemId, name: baseItems[itemId].name, owned, servings, sellPrice, buyPrice,
      canSell: canTrade && mealDeliveryRemaining > 0 && owned > 0 && Number.isSafeInteger(state.money + sellPrice),
      canBuy: canTrade && menuOpen && servings > 0 && state.money >= buyPrice && Number.isSafeInteger(owned + 1),
    };
  });
  return {
    day, phaseIndex, fishStock, menuServings, remaining, owned, menuOpen,
    dailyLimit, unitPrice: FISH_PRICE, mealPrice: mealPrices[NORMAL_MEAL].buyPrice,
    mealDeliveryRemaining, mealDeliveryLimit, meals,
    canDeliver: canTrade && remaining > 0 && owned > 0 && Number.isSafeInteger(state.money + FISH_PRICE),
    canBuyMeal: meals[0].canBuy,
  };
}

export function tradeInnSupply(supply: InnSupply, state: GameState, menuOpen: boolean, request: InnStockAction, bonuses: InnSupplyBonuses) {
  const { dailyLimit, mealDeliveryLimit } = deliveryLimits(bonuses);
  if (request.action === "deliver") {
    if (supply.delivered >= dailyLimit) {
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

  const itemId = request.itemId ?? NORMAL_MEAL;
  const { sellPrice, buyPrice } = mealPrices[itemId];
  const name = baseItems[itemId].name;
  const owned = state.inventory[itemId] ?? 0;
  const servings = mealServings(supply, itemId);
  if (request.action === "sellMeal") {
    const delivered = supply.mealDelivered ?? 0;
    if (delivered >= mealDeliveryLimit) {
      throw new OnlineError("inn_supply_meal_order_filled", "오늘 여관 생선구이 주문이 모두 찼습니다.");
    }
    if (owned < 1) {
      throw new OnlineError("inn_supply_meal_required", `납품할 ${name} 한 접시가 필요합니다.`);
    }
    const money = state.money + sellPrice;
    if (!Number.isSafeInteger(money)) {
      throw new OnlineError("inn_supply_balance_limit", "소지금이 너무 많아 납품 대금을 받을 수 없습니다.");
    }
    if (owned === 1) delete state.inventory[itemId];
    else state.inventory[itemId] = owned - 1;
    state.money = money;
    supply.mealDelivered = delivered + 1;
    setMealServings(supply, itemId, servings + 1);
    appendLogEntry(state, `여관에 ${name} 한 접시를 납품했다. +${sellPrice}골드`);
    return;
  }

  if (!menuOpen || servings < 1) {
    throw new OnlineError("inn_supply_no_servings", `지금 주문할 수 있는 ${name}가 없습니다.`);
  }
  if (state.money < buyPrice) {
    throw new OnlineError("inn_supply_gold_required", `${name} 한 접시에 ${buyPrice}골드가 필요합니다.`);
  }
  const bought = owned + 1;
  if (!Number.isSafeInteger(bought)) {
    throw new OnlineError("inn_supply_inventory_limit", `소지품에 ${name}를 더 담을 수 없습니다.`);
  }
  state.money -= buyPrice;
  state.inventory[itemId] = bought;
  setMealServings(supply, itemId, servings - 1);
  appendLogEntry(state, `여관에서 ${name} 한 접시를 샀다. -${buyPrice}골드`);
}
