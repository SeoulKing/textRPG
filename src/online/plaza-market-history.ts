import { createHash } from "node:crypto";
import type { MarketItem } from "./plaza-market";

export const plazaMarketHistoryKind = "plaza_market_history";
const recentTradesLimit = 20;

type Party = { id: string; name: string };

export type PlazaSale = {
  buyer: Party;
  seller: Party;
  source: "listing" | "buyOrder";
  itemId: MarketItem;
  unitPrice: number;
};

export type PlazaTradeResult = { message: string; sale?: PlazaSale };

export type PlazaHistoryEntry = {
  id: string;
  day: number;
  at: number;
  side: "buy" | "sell";
  source: PlazaSale["source"];
  itemId: MarketItem;
  unitPrice: number;
  quantity: number;
  counterparty: string;
};

export type PlazaHistoryWrite = { characterId: string; entry: PlazaHistoryEntry };

export function plazaHistoryWrites(sale: PlazaSale, initiatorId: string, actionId: string, day: number, at: number): PlazaHistoryWrite[] {
  const { buyer, seller, source, itemId, unitPrice } = sale;
  const id = createHash("sha256").update(`${day}:${initiatorId}:${actionId}`).digest("hex");
  const trade = { id, day, at, source, itemId, unitPrice, quantity: 1 };
  return [
    { characterId: buyer.id, entry: { ...trade, side: "buy", counterparty: seller.name } },
    { characterId: seller.id, entry: { ...trade, side: "sell", counterparty: buyer.name } },
  ];
}

export function appendPlazaHistory(previous: readonly PlazaHistoryEntry[], additions: readonly PlazaHistoryEntry[]) {
  const byId = new Map(previous.map(entry => [entry.id, entry]));
  for (const entry of additions) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  return [...byId.values()].slice(-recentTradesLimit);
}
