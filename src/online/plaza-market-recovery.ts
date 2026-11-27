import { z } from "zod";
import { baseItems } from "../game/data/items";
import { OnlineError } from "./accounts";
import type { Actor } from "./model";
import type { PlazaBuyOrders } from "./plaza-buy-orders";
import { marketReceivedQuantity, plazaMarketItemSchema, type PlazaMarket } from "./plaza-market";

export const plazaArchivedRecoverySchema = z.object({
  action: z.literal("recoverArchivedTrade"),
  sourceCharacterId: z.string().uuid(),
});
export type PlazaArchivedRecovery = z.infer<typeof plazaArchivedRecoverySchema>;

export function plazaAssetOwners(market: PlazaMarket, book: PlazaBuyOrders) {
  return new Set([
    ...market.listings.map(listing => listing.sellerId),
    ...Object.keys(market.proceeds),
    ...book.orders.map(order => order.buyerId),
    ...Object.keys(book.purchases),
  ]);
}

function recoverableGold(balance: number, amount: number) {
  const total = balance + amount;
  if (!Number.isSafeInteger(total)) {
    throw new OnlineError("plaza_market_balance_limit", "받을 수 있는 골드 한도를 넘었습니다.");
  }
  return total;
}

export function plazaArchivedAssets(market: PlazaMarket, book: PlazaBuyOrders, sourceCharacterId: string) {
  const listings = market.listings.filter(listing => listing.sellerId === sourceCharacterId);
  const orders = book.orders.filter(order => order.buyerId === sourceCharacterId);
  const pending = { ...book.purchases[sourceCharacterId] };
  let gold = market.proceeds[sourceCharacterId] ?? 0;
  for (const order of orders) gold = recoverableGold(gold, order.unitPrice * order.quantity);
  for (const listing of listings) {
    pending[listing.itemId] = marketReceivedQuantity(pending[listing.itemId], listing.quantity);
  }
  const items = plazaMarketItemSchema.options.flatMap(itemId => {
    const quantity = pending[itemId] ?? 0;
    return quantity ? [{ itemId, name: baseItems[itemId].name, quantity }] : [];
  });
  if (!gold && !items.length) return null;
  return { gold, items, listings: listings.length, orders: orders.length };
}

/** The caller authorizes the source as an archived character owned by the recipient's account. */
export function recoverPlazaArchivedAssets(market: PlazaMarket, book: PlazaBuyOrders, actor: Actor, sourceCharacterId: string) {
  if (sourceCharacterId === actor.character.id) throw new OnlineError("plaza_recovery_unavailable", "보관된 캐릭터의 거래만 여기서 회수할 수 있습니다.");
  const assets = plazaArchivedAssets(market, book, sourceCharacterId);
  if (!assets) throw new OnlineError("plaza_recovery_empty", "회수할 거래 자산이 없습니다.");
  const state = actor.game.state;
  const money = recoverableGold(state.money, assets.gold);
  const inventory = { ...state.inventory };
  for (const { itemId, quantity } of assets.items) {
    inventory[itemId] = marketReceivedQuantity(inventory[itemId], quantity);
  }

  state.money = money;
  state.inventory = inventory;
  market.listings = market.listings.filter(listing => listing.sellerId !== sourceCharacterId);
  book.orders = book.orders.filter(order => order.buyerId !== sourceCharacterId);
  delete market.proceeds[sourceCharacterId];
  delete book.purchases[sourceCharacterId];
  return "보관된 캐릭터의 장터 주문을 정리하고 남은 자산을 회수했습니다.";
}
