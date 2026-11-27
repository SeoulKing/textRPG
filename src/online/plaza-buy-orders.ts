import { randomUUID } from "node:crypto";
import { z } from "zod";
import { baseItems } from "../game/data/items";
import { OnlineError } from "./accounts";
import type { Actor } from "./model";
import type { PlazaTradeResult } from "./plaza-market-history";
import {
  marketReceivedQuantity, plazaMarketItemSchema, plazaMarketListingDays, plazaMarketPriceSchema,
  plazaMarketQuantitySchema, recordPlazaSale, type MarketItem, type PlazaMarket,
} from "./plaza-market";

const ordersPerBuyer = 4;
const openOrderLimit = 80;
const orderId = z.string().uuid();

export const plazaBuyOrderActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("placeBuyOrder"), itemId: plazaMarketItemSchema,
    quantity: plazaMarketQuantitySchema, unitPrice: plazaMarketPriceSchema,
  }),
  z.object({ action: z.literal("fillBuyOrder"), orderId }),
  z.object({ action: z.literal("cancelBuyOrder"), orderId }),
  z.object({ action: z.literal("collectPurchases") }),
]);

export type PlazaBuyOrderAction = z.infer<typeof plazaBuyOrderActionSchema>;
type BuyOrder = {
  id: string;
  buyerId: string;
  buyerName: string;
  itemId: MarketItem;
  quantity: number;
  unitPrice: number;
  expiresDay: number;
};

export type PlazaBuyOrders = {
  orders: BuyOrder[];
  purchases: Record<string, Partial<Record<MarketItem, number>>>;
};

export function emptyPlazaBuyOrders(): PlazaBuyOrders {
  return { orders: [], purchases: {} };
}

export function plazaBuyOrderView(book: PlazaBuyOrders, actor: Actor, day: number) {
  const buyerId = actor.character.id;
  const own = book.orders.filter(order => order.buyerId === buyerId);
  const open = book.orders.filter(order => order.expiresDay > day);
  const describe = ({ id, buyerName, itemId, quantity, unitPrice, expiresDay }: BuyOrder) => ({
    id, buyerName, itemId, quantity, unitPrice, expired: expiresDay <= day, reservedGold: quantity * unitPrice,
  });
  const pending = book.purchases[buyerId] ?? {};
  return {
    canOrder: own.length < ordersPerBuyer && open.length < openOrderLimit,
    orders: open.filter(order => order.buyerId !== buyerId)
      .sort((left, right) => right.unitPrice - left.unitPrice).map(describe),
    myOrders: own.map(describe),
    purchases: plazaMarketItemSchema.options.flatMap(itemId => {
      const quantity = pending[itemId] ?? 0;
      return quantity ? [{ itemId, name: baseItems[itemId].name, quantity }] : [];
    }),
  };
}

export function transactPlazaBuyOrder(book: PlazaBuyOrders, market: PlazaMarket, actor: Actor, day: number, action: PlazaBuyOrderAction): PlazaTradeResult {
  const { id: characterId, name } = actor.character;
  const state = actor.game.state;

  if (action.action === "placeBuyOrder") {
    if (book.orders.filter(order => order.buyerId === characterId).length >= ordersPerBuyer) {
      throw new OnlineError("plaza_buy_order_limit", "내 구매 주문이 가득 찼습니다. 남은 주문을 확인해 주세요.");
    }
    if (book.orders.filter(order => order.expiresDay > day).length >= openOrderLimit) {
      throw new OnlineError("plaza_buy_orders_full", "광장 장터에 구매 주문이 가득 찼습니다.");
    }
    const { itemId, quantity, unitPrice } = action;
    const reservedGold = quantity * unitPrice;
    if (state.money < reservedGold) throw new OnlineError("plaza_market_missing_gold", "예치할 골드가 부족합니다.");
    const order: BuyOrder = {
      id: randomUUID(), buyerId: characterId, buyerName: name || "모험가", itemId, quantity, unitPrice,
      expiresDay: day + plazaMarketListingDays,
    };
    state.money -= reservedGold;
    book.orders.push(order);
    return { message: `${baseItems[itemId].name} ${quantity}개를 주문하고 ${reservedGold}골드를 맡겼습니다.` };
  }

  if (action.action === "collectPurchases") {
    const pending = book.purchases[characterId];
    if (!pending) throw new OnlineError("plaza_buy_order_empty", "받을 물품이 없습니다.");
    const updated = { ...state.inventory };
    for (const itemId of plazaMarketItemSchema.options) {
      const count = pending[itemId] ?? 0;
      if (count) updated[itemId] = marketReceivedQuantity(updated[itemId], count);
    }
    state.inventory = updated;
    delete book.purchases[characterId];
    return { message: "주문으로 구매한 물품을 소지품에 받았습니다." };
  }

  const index = book.orders.findIndex(order => order.id === action.orderId);
  const order = book.orders[index];
  if (!order) throw new OnlineError("plaza_buy_order_unavailable", "이미 채워졌거나 취소된 구매 주문입니다.");

  if (action.action === "cancelBuyOrder") {
    if (order.buyerId !== characterId) throw new OnlineError("plaza_buy_order_unavailable", "내 구매 주문만 취소할 수 있습니다.");
    const refund = order.quantity * order.unitPrice;
    const money = state.money + refund;
    if (!Number.isSafeInteger(money)) throw new OnlineError("plaza_market_balance_limit", "소지금이 너무 많아 예치금을 받을 수 없습니다.");
    state.money = money;
    book.orders.splice(index, 1);
    return { message: `남은 구매 주문을 취소하고 ${refund}골드를 돌려받았습니다.` };
  }

  if (order.expiresDay <= day) throw new OnlineError("plaza_buy_order_unavailable", "기한이 지난 구매 주문입니다.");
  if (order.buyerId === characterId) throw new OnlineError("plaza_buy_order_own", "다른 모험가의 구매 주문에만 납품할 수 있습니다.");
  const { buyerId, itemId, unitPrice } = order;
  const owned = state.inventory[itemId] ?? 0;
  if (owned < 1) throw new OnlineError("plaza_market_missing_item", "납품할 물건이 없습니다.");
  const money = state.money + unitPrice;
  if (!Number.isSafeInteger(money)) throw new OnlineError("plaza_market_balance_limit", "소지금이 너무 많아 판매 대금을 받을 수 없습니다.");
  const pending = book.purchases[buyerId] ?? {};
  const quantity = marketReceivedQuantity(pending[itemId], 1);

  if (owned === 1) delete state.inventory[itemId];
  else state.inventory[itemId] = owned - 1;
  state.money = money;
  book.purchases[buyerId] = { ...pending, [itemId]: quantity };
  recordPlazaSale(market, characterId);
  order.quantity--;
  if (!order.quantity) book.orders.splice(index, 1);
  return {
    message: `${baseItems[itemId].name} 1개를 납품하고 ${unitPrice}골드를 받았습니다.`,
    sale: {
      buyer: { id: buyerId, name: order.buyerName },
      seller: { id: characterId, name: name || "모험가" },
      source: "buyOrder", itemId, unitPrice,
    },
  };
}
