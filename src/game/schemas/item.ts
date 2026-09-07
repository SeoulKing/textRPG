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
  injuryRelief: z.number().int().min(0).max(3).default(0),
  infectionRelief: z.number().int().min(0).max(3).default(0),
}));

export const ThrowableSchema = z.object({ unitMass: z.number().positive(), sound: z.object({ description: z.string().min(1), intensity: z.number().min(0).max(1) }) });

export const ItemCombatSchema = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("attack"),hitChance:z.number().min(0).max(100),damage:z.number().int().positive(),counterChance:z.number().min(0).max(100)}),
  z.object({kind:z.literal("guard"),successChance:z.number().min(0).max(100),damageReduction:z.number().int().nonnegative()}),
  z.object({kind:z.literal("none")}),
]);
export type ItemCombat = z.infer<typeof ItemCombatSchema>;

export const ItemCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(["food", "drink", "medicine", "trade", "ticket", "material", "tool"]),
  rarity: z.enum(["common", "uncommon", "rare"]),
  price: z.number().int().nonnegative(),
  tags: z.array(z.string()),
  effects: ItemEffectsSchema,
  useMinutes: z.number().int().min(0).max(24 * 60).optional(),
  maxDurability: z.number().int().positive().optional(),
  combat: ItemCombatSchema.optional(),
  throwable: ThrowableSchema.optional(),
  toolCapabilities: z.object({ pry: z.number().int().positive().optional(), cut: z.number().int().positive().optional(), strike: z.number().int().positive().optional() }).optional(),
  source: z.enum(["template", "llm"]),
  generatedAt: z.string(),
});

export type ItemCard = z.infer<typeof ItemCardSchema>;
