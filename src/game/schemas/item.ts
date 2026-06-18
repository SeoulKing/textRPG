import { z } from "zod";

export const ItemEffectsSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") {
    return raw;
  }

  const effects = raw as Record<string, unknown>;
  const legacyEnergyKey = "full" + "ness";
  const legacyExhaustionReliefKey = "star" + "vationRelief";
  return {
    ...effects,
    energy: effects.energy ?? effects[legacyEnergyKey],
    exhaustionRelief: effects.exhaustionRelief ?? effects[legacyExhaustionReliefKey],
  };
}, z.object({
  hp: z.number().int().default(0),
  mind: z.number().int().default(0),
  energy: z.number().int().default(0),
  exhaustionRelief: z.number().int().default(0),
}));

export const ItemCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(["food", "drink", "medicine", "trade", "ticket", "material"]),
  rarity: z.enum(["common", "uncommon", "rare"]),
  price: z.number().int().nonnegative(),
  tags: z.array(z.string()),
  effects: ItemEffectsSchema,
  source: z.enum(["template", "llm"]),
  generatedAt: z.string(),
});

export type ItemCard = z.infer<typeof ItemCardSchema>;
