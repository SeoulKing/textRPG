import type { ItemCard } from "../schemas";

export type ItemDefinition = Omit<ItemCard, "source" | "generatedAt" | "effects"> & {
  effects?: Partial<ItemCard["effects"]>;
};

const ZERO_ITEM_EFFECTS: ItemCard["effects"] = {
  hp: 0,
  mind: 0,
  energy: 0,
  exhaustionRelief: 0,
};

export function defineItem(input: ItemDefinition): Omit<ItemCard, "source" | "generatedAt"> {
  return {
    ...input,
    effects: {
      ...ZERO_ITEM_EFFECTS,
      ...input.effects,
    },
  };
}
