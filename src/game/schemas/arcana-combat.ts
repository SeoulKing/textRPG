import { z } from "zod";

export const ArcanaCombatSchema = z.object({
  level: z.number().int().min(1).default(1),
  xp: z.number().int().nonnegative().default(0),
  hp: z.number().nonnegative().default(100),
  mp: z.number().nonnegative().default(30),
  manaRegenPerHour: z.number().nonnegative().default(12),
  cooldowns: z.object({ fireball: z.number().nonnegative(), dodge: z.number().nonnegative(), potion: z.number().nonnegative() }).default({ fireball: 0, dodge: 0, potion: 0 }),
  evadeSeconds: z.number().nonnegative().default(0),
  battle: z.object({
    id: z.string(),
    phase: z.enum(["ready", "battle", "victory", "defeat"]),
    enemyHp: z.number().nonnegative(),
    attackIn: z.number().nonnegative(),
    paused: z.boolean(),
    log: z.array(z.string()),
  }).nullable().default(null),
}).default({ level: 1, xp: 0, hp: 100, mp: 30, manaRegenPerHour: 12, cooldowns: { fireball: 0, dodge: 0, potion: 0 }, evadeSeconds: 0, battle: null });

export const ActiveClockSchema = z.object({
  ownerId: z.string().nullable().default(null),
  heartbeatAt: z.number().nonnegative().default(0),
  sequence: z.number().int().nonnegative().default(0),
  paused: z.boolean().default(true),
}).default({ ownerId: null, heartbeatAt: 0, sequence: 0, paused: true });
