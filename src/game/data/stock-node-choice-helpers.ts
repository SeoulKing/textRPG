import type { Condition, Effect } from "../schemas";

type StockItemEffectInput = {
  itemId: string;
  locationId: string;
  nodeId: string;
};

type StockItemChoicePartsInput = StockItemEffectInput & {
  extraEffects?: Effect[];
  logMessage?: string;
  minutes?: number;
};

export function activeStockNodeCondition(nodeId: string): Condition {
  return { type: "active_stock_node", nodeId };
}

export function inactiveStockNodeCondition(nodeId: string): Condition {
  return { type: "active_stock_node_not", nodeId };
}

export function stockItemAvailableConditions({ itemId, locationId, nodeId }: StockItemEffectInput): Condition[] {
  return [
    activeStockNodeCondition(nodeId),
    { type: "stock_item_gte", locationId, nodeId, itemId, amount: 1 },
  ];
}

// Stock-node item pickups always sweep the remaining stack in one action.
export function collectStockItemEffect({ itemId, locationId, nodeId }: StockItemEffectInput): Effect {
  return {
    type: "collect_stock_item_all",
    locationId,
    nodeId,
    itemId,
  };
}

export function collectStockItemChoiceParts(input: StockItemChoicePartsInput): {
  skillUse: { skillId: "collection" };
  conditions: Condition[];
  effects: Effect[];
} {
  const effects: Effect[] = [collectStockItemEffect(input), ...(input.extraEffects ?? [])];
  if (input.logMessage) {
    effects.push({ type: "log", message: input.logMessage });
  }
  if (input.minutes && input.minutes > 0) {
    effects.push({ type: "advance_time", minutes: input.minutes });
  }
  return {
    skillUse: { skillId: "collection" },
    conditions: stockItemAvailableConditions(input),
    effects,
  };
}

export function leaveStockNodeChoiceParts(nodeId: string, logMessage?: string): {
  conditions: Condition[];
  effects: Effect[];
} {
  const effects: Effect[] = [{ type: "clear_stock_node_focus" }];
  if (logMessage) {
    effects.push({ type: "log", message: logMessage });
  }
  return {
    conditions: [activeStockNodeCondition(nodeId)],
    effects,
  };
}
