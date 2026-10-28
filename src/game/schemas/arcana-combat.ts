import { z } from "zod";
import { ArcanaSpatialSchema } from "./arcana-spatial";

export const ArcanaCombatSchema = z.object({
  level: z.number().int().min(1).default(1),
  xp: z.number().int().nonnegative().default(0),
  hp: z.number().nonnegative().default(100),
  mp: z.number().nonnegative().default(30),
  manaRegenPerHour: z.number().nonnegative().default(12),
  unlockedSchools: z.array(z.string().min(1)).default(["fire"]),
  learnedSpells: z.array(z.enum(["fireball", "flame_wave", "flame_guard"])).optional(),
  skillSystemVersion: z.literal(1).optional(),
  skillTraining: z.record(z.string(), z.object({ xp: z.number().finite().min(0).max(10000), specializations: z.array(z.string()).default([]), activeSpecialization: z.string().nullable().default(null) })).default({}),
  activeSkills: z.array(z.string().nullable()).length(6).optional(),
  passiveSkills: z.array(z.string().nullable()).length(2).default([null, null]),
  cooldowns: z.object({ fireball: z.number().nonnegative().default(0), flame_wave: z.number().nonnegative().default(0), flame_guard: z.number().nonnegative().default(0), dodge: z.number().nonnegative().default(0), teleport: z.number().nonnegative().default(0), potion: z.number().nonnegative().default(0) }).default({ fireball: 0, flame_wave: 0, flame_guard: 0, dodge: 0, teleport: 0, potion: 0 }),
  guard: z.object({ amount: z.number().nonnegative().default(0), seconds: z.number().nonnegative().default(0) }).default({ amount: 0, seconds: 0 }),
  evadeSkill: z.enum(["dodge", "teleport"]).default("dodge"),
  evadeSeconds: z.number().nonnegative().default(0),
  battle: z.object({
    id: z.string(),
    phase: z.enum(["ready", "battle", "victory", "defeat"]),
    enemyHp: z.number().nonnegative(),
    attackIn: z.number().nonnegative(),
    paused: z.boolean(),
    log: z.array(z.string()),
    spatial: ArcanaSpatialSchema.optional(),
  }).nullable().default(null),
}).default({ skillSystemVersion: 1, skillTraining: {}, activeSkills: ["fireball", null, null, null, null, null], passiveSkills: [null, null], level: 1, xp: 0, hp: 100, mp: 30, manaRegenPerHour: 12, unlockedSchools: ["fire"], cooldowns: { fireball: 0, flame_wave: 0, flame_guard: 0, dodge: 0, teleport: 0, potion: 0 }, guard: { amount: 0, seconds: 0 }, evadeSkill: "dodge", evadeSeconds: 0, battle: null });

export const ActiveClockSchema = z.object({
  ownerId: z.string().nullable().default(null),
  heartbeatAt: z.number().nonnegative().default(0),
  sequence: z.number().int().nonnegative().default(0),
  paused: z.boolean().default(true),
}).default({ ownerId: null, heartbeatAt: 0, sequence: 0, paused: true });
