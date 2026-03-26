import type { Effect } from "../schemas";

type StockItemEffectInput = {
  itemId: string;
  locationId: string;
  nodeId: string;
};

// Stock-node item pickups always sweep the remaining stack in one action.
export function collectStockItemEffect({ itemId, locationId, nodeId }: StockItemEffectInput): Effect {
  return {
    type: "collect_stock_item_all",
    locationId,
    nodeId,
    itemId,
  };
}
