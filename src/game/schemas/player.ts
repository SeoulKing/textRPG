import { z } from "zod";

export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  hp: z.number().int().min(0).max(10),
  sanity: z.number().int().min(0).max(10),
  energy: z.number().int().min(0).max(15),
  money: z.number().int().nonnegative(),
  inventory: z.record(z.string(), z.number().int().nonnegative()),
  skills: z.array(z.string()),
  flags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  statusEffects: z.array(z.string()).default([]),
});

export type Player = z.infer<typeof PlayerSchema>;
