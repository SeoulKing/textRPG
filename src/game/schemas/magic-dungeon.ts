import { z } from "zod";

export const DungeonClassSchema = z.enum(["guardian", "archer", "rogue", "mage"]);
export const MagicDungeonRunSchema = z.object({
  phase: z.enum(["prepare", "battle", "reward", "route", "event", "shop", "defeat", "settled"]),
  classId: DungeonClassSchema,
  floor: z.number().int().positive(),
  hp: z.number().nonnegative(), maxHp: z.number().positive(),
  mp: z.number().nonnegative(), maxMp: z.number().positive(),
  shield: z.number().nonnegative(), shieldSeconds: z.number().nonnegative(),
  damageBonus: z.number().nonnegative(), cooldownBonus: z.number().min(0).max(.45),
  cooldowns: z.array(z.number().nonnegative()).length(4),
  ultimate: z.number().min(0).max(100),
  autoSeconds: z.number().nonnegative(), elapsed: z.number().nonnegative(),
  lastTick: z.number().nonnegative(), paused: z.boolean(), revision: z.number().int().nonnegative(),
  coins: z.number().int().nonnegative(), shards: z.number().int().nonnegative(), dust: z.number().int().nonnegative(),
  relics: z.array(z.string()), purchased: z.array(z.string()), paragraphs: z.array(z.string()),
  enemy: z.object({
    name: z.string(), boss: z.boolean(), hp: z.number().nonnegative(), maxHp: z.number().positive(),
    attack: z.number().positive(), attackSeconds: z.number().nonnegative(),
    casting: z.boolean(), castSeconds: z.number().nonnegative(), castMax: z.number().positive(),
    cycle: z.number().int().nonnegative(), intent: z.enum(["strike", "wave", "drain"]),
    mark: z.number().nonnegative(), poison: z.number().nonnegative(), smoke: z.number().nonnegative(),
  }),
});
export const MagicDungeonStateSchema = z.object({
  level: z.number().int().min(1).max(50).default(1),
  xp: z.number().int().nonnegative().default(0),
  bestFloor: z.number().int().nonnegative().default(0),
  runNumber: z.number().int().nonnegative().default(0),
  run: MagicDungeonRunSchema.nullable().default(null),
}).default({ level: 1, xp: 0, bestFloor: 0, runNumber: 0, run: null });
export type MagicDungeonRun = z.infer<typeof MagicDungeonRunSchema>;
