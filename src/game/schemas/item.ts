import { z } from "zod";

export const ItemEffectsSchema = z.object({
  hp: z.number().int().default(0),
  mind: z.number().int().default(0),
  fullness: z.number().int().default(0),
  starvationRelief: z.number().int().default(0),
});

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
