import { z } from "zod";
export const CombatPointSchema = z.object({x:z.number().finite(),y:z.number().finite()});
const behavior = z.enum(["neutral","chase","prepare","attack","return"]);
export const SpatialEnemySchema = z.object({id:z.string(),position:CombatPointSchema,home:CombatPointSchema,hp:z.number().nonnegative(),maxHp:z.number().positive().default(30),attackIn:z.number().nonnegative(),behavior,jumpFrom:CombatPointSchema,jumpTo:CombatPointSchema,jumpHit:z.boolean(),jumpElapsed:z.number().nonnegative(),targetLocked:z.boolean(),rewarded:z.boolean().default(false)});
export const ArcanaSpatialSchema = z.object({
  encounterId:z.literal("plaza_slime"),
  // Legacy primary-enemy projection, derived from enemies for existing scene consumers.
  enemy:CombatPointSchema,home:CombatPointSchema,behavior,jumpFrom:CombatPointSchema,jumpTo:CombatPointSchema,jumpHit:z.boolean(),jumpElapsed:z.number().nonnegative().default(0),targetLocked:z.boolean(),
  visibleEnemyIds:z.array(z.string()).optional(),enemies:z.array(SpatialEnemySchema).default([]),primaryEnemyId:z.string().default("slime_0"),
  player:CombatPointSchema,previousPlayer:CombatPointSchema,elapsed:z.number().nonnegative(),revision:z.number().int().nonnegative(),
  projectiles:z.array(z.object({id:z.string(),position:CombatPointSchema,direction:CombatPointSchema,remaining:z.number().nonnegative(),damage:z.number().nonnegative(),spellId:z.enum(["fireball","giant_fireball","flame_barrage"]).default("fireball"),radius:z.number().positive().optional(),hitIds:z.array(z.string()).default([]),masteryAwarded:z.boolean().default(false),pierce:z.number().int().positive().default(1),explode:z.boolean().default(false),targetId:z.string().optional(),origin:CombatPointSchema.optional()})),
  meteors:z.array(z.object({id:z.string(),position:CombatPointSchema,remaining:z.number().nonnegative(),damage:z.number().nonnegative()})).default([]),
  barrage:z.object({remaining:z.number().int().nonnegative(),nextIn:z.number(),damage:z.number().nonnegative()}).nullable().default(null),
  events:z.array(z.object({id:z.number().int(),kind:z.enum(["cast","wave","guard","absorb","hit","miss","hurt","evade","return","reset","victory","defeat","explosion","meteor","meteor_warning","enemy_down"]),position:CombatPointSchema,amount:z.number(),projectileId:z.string().optional(),enemyId:z.string().optional(),targetPosition:CombatPointSchema.optional(),direction:CombatPointSchema.optional(),rewards:z.object({xp:z.number().nonnegative(),money:z.number().nonnegative()}).optional()})),
});
export type ArcanaSpatial = z.infer<typeof ArcanaSpatialSchema>;
export type SpatialEnemy = z.infer<typeof SpatialEnemySchema>;
export type CombatPoint = z.infer<typeof CombatPointSchema>;
