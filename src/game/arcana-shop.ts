import type { ActionChoice, GameState } from "./schemas";
import { appendLogEntry } from "./state-utils";

export const ARCANA_SHOP_GOODS = [
  { itemId: "manaPotion", name: "마나 포션", buy: 10, sell: 4, detail: "MP 20 회복" },
  { itemId: "moonHerb", name: "달빛 약초", buy: 30, sell: 10, detail: "연금 재료" },
  { itemId: "arcaneDust", name: "비전 가루", buy: 60, sell: 20, detail: "마도구 제작 재료" },
  { itemId: "manaShard", name: "마력 결정 파편", buy: 0, sell: 80, detail: "매입 전용 · 제작 재료" },
] as const;

export function tradeArcanaShop(state: GameState, side: "buy_item" | "sell_item", itemId: string, quantity: number) {
  if (!state.flags.in_magic_world || state.location !== "arcana_shop" || state.arcanaCombat.battle) throw new Error("전투를 마친 뒤 상점에서 거래해 주세요.");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("거래 수량은 1~99개로 선택해 주세요.");
  const good = ARCANA_SHOP_GOODS.find(entry => entry.itemId === itemId);
  if (!good) throw new Error("이 상점에서 거래하지 않는 물품입니다.");
  const buying = side === "buy_item";
  const unitPrice = buying ? good.buy : good.sell;
  if (unitPrice <= 0) throw new Error("이 물품은 상점에서 판매하지 않습니다.");
  const count = state.inventory[itemId] ?? 0;
  const total = unitPrice * quantity;
  if (buying && state.money < total) throw new Error("소지금이 부족합니다.");
  if (!buying && count < quantity) throw new Error("판매할 물품이 부족합니다.");
  state.money += buying ? -total : total;
  const remaining = count + (buying ? quantity : -quantity);
  if (remaining > 0) state.inventory[itemId] = remaining;
  else delete state.inventory[itemId];
  appendLogEntry(state, `${good.name} ${quantity}개를 ${total}골드에 ${buying ? "구입했다" : "판매했다"}.`);
}

export function buildArcanaShopActions(state: GameState): ActionChoice[] {
  const actions: ActionChoice[] = [];
  for (const good of ARCANA_SHOP_GOODS) {
    const count = state.inventory[good.itemId] ?? 0;
    if (good.buy > 0) actions.push({
      id: "arcana:shop:buy:" + good.itemId, label: good.name + " 구매",
      outcomeHint: `${good.buy}골드/개 · ${good.detail} · 보유 ${count}개 · 상시 판매`, showOutcomeHint: true,
      isAvailable: state.money >= good.buy,
      action: { type: "arcana_combat", command: "buy_item", itemId: good.itemId, quantity: 1 },
    });
    if (count > 0) actions.push({
      id: "arcana:shop:sell:" + good.itemId, label: good.name + " 판매",
      outcomeHint: `${good.sell}골드/개 · 보유 ${count}개`, showOutcomeHint: true, isAvailable: true,
      action: { type: "arcana_combat", command: "sell_item", itemId: good.itemId, quantity: 1 },
    });
  }
  return actions;
}
