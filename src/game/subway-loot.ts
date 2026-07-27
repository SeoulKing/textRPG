import { baseItems } from "./data/items";
import type { GameState } from "./schemas";

export type SubwayLootItemId =
  | "scrapMetal"
  | "cordage"
  | "clothScrap"
  | "waterBottle"
  | "staleBread"
  | "emergencySnack"
  | "cannedFood"
  | "painRelief"
  | "radioAntenna";

export type SubwayLootTableEntry = {
  itemId: SubwayLootItemId;
  floorChance: number;
  minAmount: number;
  maxAmount: number;
  unique?: boolean;
};

export type SubwayLootManifestSpot = {
  slotId: string;
  contents: Array<{
    itemId: SubwayLootItemId;
    amount: number;
  }>;
};

export const SUBWAY_LOOT_TABLES: Array<{
  id: string;
  minDepth: number;
  maxDepth: number | null;
  entries: SubwayLootTableEntry[];
}> = [
  {
    id: "section-1",
    minDepth: 1,
    maxDepth: 10,
    entries: [
      { itemId: "scrapMetal", floorChance: 0.5, minAmount: 1, maxAmount: 2 },
      { itemId: "cordage", floorChance: 0.35, minAmount: 1, maxAmount: 1 },
      { itemId: "clothScrap", floorChance: 0.3, minAmount: 1, maxAmount: 2 },
      { itemId: "waterBottle", floorChance: 0.25, minAmount: 1, maxAmount: 1 },
      { itemId: "staleBread", floorChance: 0.2, minAmount: 1, maxAmount: 1 },
      { itemId: "emergencySnack", floorChance: 0.1, minAmount: 1, maxAmount: 1 },
      { itemId: "painRelief", floorChance: 0.08, minAmount: 1, maxAmount: 1 },
      { itemId: "radioAntenna", floorChance: 0.06, minAmount: 1, maxAmount: 1, unique: true },
    ],
  },
  {
    id: "section-2",
    minDepth: 11,
    maxDepth: 20,
    entries: [
      { itemId: "scrapMetal", floorChance: 0.7, minAmount: 2, maxAmount: 3 },
      { itemId: "cordage", floorChance: 0.5, minAmount: 1, maxAmount: 2 },
      { itemId: "clothScrap", floorChance: 0.45, minAmount: 1, maxAmount: 2 },
      { itemId: "waterBottle", floorChance: 0.4, minAmount: 1, maxAmount: 2 },
      { itemId: "emergencySnack", floorChance: 0.3, minAmount: 1, maxAmount: 1 },
      { itemId: "cannedFood", floorChance: 0.22, minAmount: 1, maxAmount: 1 },
      { itemId: "painRelief", floorChance: 0.25, minAmount: 1, maxAmount: 1 },
      { itemId: "radioAntenna", floorChance: 0.12, minAmount: 1, maxAmount: 1, unique: true },
    ],
  },
  {
    id: "section-3",
    minDepth: 21,
    maxDepth: null,
    entries: [
      { itemId: "scrapMetal", floorChance: 0.8, minAmount: 2, maxAmount: 4 },
      { itemId: "cordage", floorChance: 0.65, minAmount: 1, maxAmount: 3 },
      { itemId: "clothScrap", floorChance: 0.55, minAmount: 1, maxAmount: 3 },
      { itemId: "waterBottle", floorChance: 0.5, minAmount: 1, maxAmount: 2 },
      { itemId: "emergencySnack", floorChance: 0.4, minAmount: 1, maxAmount: 2 },
      { itemId: "cannedFood", floorChance: 0.4, minAmount: 1, maxAmount: 2 },
      { itemId: "painRelief", floorChance: 0.4, minAmount: 1, maxAmount: 2 },
      { itemId: "radioAntenna", floorChance: 0.18, minAmount: 1, maxAmount: 1, unique: true },
    ],
  },
];

export function subwayLootTableForDepth(depth: number) {
  return SUBWAY_LOOT_TABLES.find((table) =>
    depth >= table.minDepth && (table.maxDepth === null || depth <= table.maxDepth)
  ) ?? SUBWAY_LOOT_TABLES[SUBWAY_LOOT_TABLES.length - 1];
}

function ownsUniqueItem(state: GameState, itemId: SubwayLootItemId) {
  return (
    (state.inventory[itemId] ?? 0) > 0 ||
    (state.subwayExpedition.carriedLoot[itemId] ?? 0) > 0 ||
    Boolean(
      state.subwayExpedition.currentFloor?.lootSpots.some((spot) =>
        spot.contents.some((entry) => entry.itemId === itemId)
      ),
    )
  );
}

function randomAmount(entry: SubwayLootTableEntry, random: () => number) {
  if (entry.minAmount === entry.maxAmount) {
    return entry.minAmount;
  }
  return entry.minAmount + Math.floor(random() * (entry.maxAmount - entry.minAmount + 1));
}

export function rollSubwayFloorLoot(
  state: GameState,
  depth: number,
  random: () => number = Math.random,
): SubwayLootManifestSpot[] {
  const table = subwayLootTableForDepth(depth);
  const rolled = table.entries.flatMap((entry) => {
    if (entry.unique && ownsUniqueItem(state, entry.itemId)) {
      return [];
    }
    if (random() >= entry.floorChance) {
      return [];
    }
    return [{
      itemId: entry.itemId,
      amount: randomAmount(entry, random),
    }];
  });

  const spots: SubwayLootManifestSpot[] = Array.from({ length: 3 }, (_, index) => ({
    slotId: `loot-${depth}-${index + 1}`,
    contents: [],
  }));
  rolled.forEach((entry, index) => {
    const targetIndex = (index + Math.floor(random() * spots.length)) % spots.length;
    spots[targetIndex].contents.push(entry);
  });
  return spots;
}

export function subwayLootItemDescription(itemId: SubwayLootItemId) {
  const item = baseItems[itemId];
  return {
    itemId,
    name: item.name,
    description: item.description,
  };
}
