import { z } from "zod";

export const CombatPointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
export const ArcanaSpatialSchema = z.object({
  encounterId: z.literal("plaza_slime"),
  enemy: CombatPointSchema,
  home: CombatPointSchema,
  player: CombatPointSchema,
  previousPlayer: CombatPointSchema,
  behavior: z.enum(["neutral", "chase", "prepare", "attack", "return"]),
  jumpFrom: CombatPointSchema,
  jumpTo: CombatPointSchema,
  jumpHit: z.boolean(),
  jumpElapsed: z.number().nonnegative().default(0),
  targetLocked: z.boolean(),
  elapsed: z.number().nonnegative(),
  revision: z.number().int().nonnegative(),
  projectiles: z.array(z.object({ id: z.string(), position: CombatPointSchema, direction: CombatPointSchema, remaining: z.number().nonnegative(), damage: z.number().nonnegative() })),
  events: z.array(z.object({ id: z.number().int(), kind: z.enum(["cast", "wave", "guard", "absorb", "hit", "miss", "hurt", "evade", "return", "reset", "victory", "defeat"]), position: CombatPointSchema, amount: z.number(), projectileId: z.string().optional(), targetPosition: CombatPointSchema.optional(), direction: CombatPointSchema.optional(), rewards: z.object({ xp: z.number().nonnegative(), money: z.number().nonnegative() }).optional() })),
});
export type CombatPoint = z.infer<typeof CombatPointSchema>;
export type ArcanaSpatial = z.infer<typeof ArcanaSpatialSchema>;
