import { randomUUID } from "node:crypto";
import { z } from "zod";
import { baseItems } from "../game/data/items";
import { OnlineError } from "./accounts";
import type { Actor } from "./model";
import type { PlazaTradeResult } from "./plaza-market-history";

const goods = [
  "riverFish", "grilledFish", "grilledFishFine", "grilledFishExcellent", "wood",
  "campfire", "campfireFine", "campfireExcellent",
] as const;
export const plazaMarketItemSchema = z.enum(goods);
const listingId = z.string().uuid();
const perSellerLimit = 4;
const experiencedSellerLimit = 6;
const expandedShelfAt = 5;
const openListingLimit = 80;
export const plazaMarketListingDays = 48;
const quantityLimit = 10;
const priceLimit = 200;
export const plazaMarketQuantitySchema = z.number().int().min(1).max(quantityLimit);
export const plazaMarketPriceSchema = z.number().int().min(1).max(priceLimit);

export const plazaMarketActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list"), itemId: plazaMarketItemSchema,
    quantity: plazaMarketQuantitySchema,
    unitPrice: plazaMarketPriceSchema,
  }),
  z.object({ action: z.literal("buy"), listingId }),
  z.object({ action: z.literal("withdraw"), listingId }),
  z.object({ action: z.literal("collect") }),
]);

export type PlazaMarketAction = z.infer<typeof plazaMarketActionSchema>;
export type MarketItem = z.infer<typeof plazaMarketItemSchema>;
type Listing = {
  id: string;
  sellerId: string;
  sellerName: string;
  itemId: MarketItem;
  quantity: number;
  unitPrice: number;
  expiresDay: number;
};

export type PlazaMarket = {
  listings: Listing[];
  proceeds: Record<string, number>;
  soldUnits?: Record<string, number>;
};

export function emptyPlazaMarket(): PlazaMarket {
  return { listings: [], proceeds: {} };
}

export function marketSellerProgress(market: PlazaMarket | undefined, sellerId: string) {
  const soldUnits = market?.soldUnits?.[sellerId] ?? 0;
  return {
    soldUnits,
    listingLimit: soldUnits >= expandedShelfAt ? experiencedSellerLimit : perSellerLimit,
    expandedShelfAt,
  };
}

export function recordPlazaSale(market: PlazaMarket, sellerId: string) {
  const soldUnits = market.soldUnits ??= {};
  soldUnits[sellerId] = Math.min((soldUnits[sellerId] ?? 0) + 1, Number.MAX_SAFE_INTEGER);
}

export function plazaMarketView(market: PlazaMarket, actor: Actor, day: number) {
  const sellerId = actor.character.id;
  const { inventory, money } = actor.game.state;
  const myListings = market.listings.filter(listing => listing.sellerId === sellerId);
  const seller = marketSellerProgress(market, sellerId);
  const openListings = market.listings.filter(listing => listing.expiresDay > day);
  const listingView = ({ id, sellerName, itemId, quantity, unitPrice, expiresDay }: Listing) => ({
    id, sellerName, itemId, quantity, unitPrice, expired: expiresDay <= day,
  });
  return {
    day,
    money,
    proceeds: market.proceeds[sellerId] ?? 0,
    quantityLimit,
    priceLimit,
    canList: myListings.length < seller.listingLimit && openListings.length < openListingLimit,
    goods: goods.map(id => ({ id, name: baseItems[id].name, owned: inventory[id] ?? 0 })),
    offers: openListings.filter(listing => listing.sellerId !== sellerId)
      .sort((left, right) => left.unitPrice - right.unitPrice).map(listingView),
    myListings: myListings.map(listingView),
  };
}

export function marketReceivedQuantity(owned: number | undefined, received: number) {
  const total = (owned ?? 0) + received;
  if (!Number.isSafeInteger(total)) throw new OnlineError("plaza_market_inventory_limit", "소지품에 이 물건을 더 담을 수 없습니다.");
  return total;
}

export function transactPlazaMarket(market: PlazaMarket, actor: Actor, day: number, action: PlazaMarketAction): PlazaTradeResult {
  const { id: characterId, name } = actor.character;
  const state = actor.game.state;

  if (action.action === "list") {
    const { listingLimit } = marketSellerProgress(market, characterId);
    if (market.listings.filter(listing => listing.sellerId === characterId).length >= listingLimit) {
      throw new OnlineError("plaza_market_seller_full", "내 진열대가 가득 찼습니다. 남은 물건을 먼저 회수해 주세요.");
    }
    if (market.listings.filter(listing => listing.expiresDay > day).length >= openListingLimit) {
      throw new OnlineError("plaza_market_full", "광장 장터에 빈 진열 자리가 없습니다.");
    }
    const { itemId, quantity, unitPrice } = action;
    const remaining = (state.inventory[itemId] ?? 0) - quantity;
    if (remaining < 0) throw new OnlineError("plaza_market_missing_item", "등록할 물건이 부족합니다.");
    const listing: Listing = {
      id: randomUUID(), sellerId: characterId, sellerName: name || "모험가", itemId, quantity, unitPrice, expiresDay: day + plazaMarketListingDays,
    };
    if (remaining) state.inventory[itemId] = remaining;
    else delete state.inventory[itemId];
    market.listings.push(listing);
    return { message: `${baseItems[itemId].name} ${quantity}개를 개당 ${unitPrice}골드에 등록했습니다.` };
  }

  if (action.action === "collect") {
    const proceeds = market.proceeds[characterId] ?? 0;
    if (!proceeds) throw new OnlineError("plaza_market_no_proceeds", "받을 판매 대금이 없습니다.");
    const money = state.money + proceeds;
    if (!Number.isSafeInteger(money)) throw new OnlineError("plaza_market_balance_limit", "소지금이 너무 많아 대금을 받을 수 없습니다.");
    state.money = money;
    delete market.proceeds[characterId];
    return { message: `판매 대금 ${proceeds}골드를 받았습니다.` };
  }

  const index = market.listings.findIndex(listing => listing.id === action.listingId);
  const listing = market.listings[index];
  if (!listing) throw new OnlineError("plaza_market_offer_unavailable", "이미 팔렸거나 회수된 물건입니다.");
  const { itemId, unitPrice } = listing;

  if (action.action === "withdraw") {
    if (listing.sellerId !== characterId) throw new OnlineError("plaza_market_offer_unavailable", "내가 맡긴 물건만 회수할 수 있습니다.");
    state.inventory[itemId] = marketReceivedQuantity(state.inventory[itemId], listing.quantity);
    market.listings.splice(index, 1);
    return { message: `${baseItems[itemId].name} ${listing.quantity}개를 소지품에 돌려받았습니다.` };
  }

  if (listing.expiresDay <= day) throw new OnlineError("plaza_market_offer_unavailable", "등록 기한이 지난 물건입니다.");
  if (listing.sellerId === characterId) throw new OnlineError("plaza_market_own_offer", "내가 등록한 물건은 내 진열대에서 회수할 수 있습니다.");
  if (state.money < unitPrice) throw new OnlineError("plaza_market_missing_gold", "소지금이 부족합니다.");
  const proceeds = (market.proceeds[listing.sellerId] ?? 0) + unitPrice;
  if (!Number.isSafeInteger(proceeds)) throw new OnlineError("plaza_market_balance_limit", "판매자가 대금을 받은 뒤 구매할 수 있습니다.");
  const owned = marketReceivedQuantity(state.inventory[itemId], 1);
  state.money -= unitPrice;
  state.inventory[itemId] = owned;
  market.proceeds[listing.sellerId] = proceeds;
  recordPlazaSale(market, listing.sellerId);
  listing.quantity--;
  if (!listing.quantity) market.listings.splice(index, 1);
  return {
    message: `${baseItems[itemId].name} 1개를 ${unitPrice}골드에 구입했습니다.`,
    sale: {
      buyer: { id: characterId, name: name || "모험가" },
      seller: { id: listing.sellerId, name: listing.sellerName },
      source: "listing", itemId, unitPrice,
    },
  };
}
