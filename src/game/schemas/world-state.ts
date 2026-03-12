import { z } from "zod";

export const WorldStateSchema = z.object({
  currentTime: z.string(),
  currentDay: z.number().int().positive(),
  phaseIndex: z.number().int().nonnegative(),
  globalFlags: z.array(z.string()),
  unlockedLocationIds: z.array(z.string()),
  visitedLocationIds: z.array(z.string()),
  worldElapsedMs: z.number().int().nonnegative(),
});

export type WorldState = z.infer<typeof WorldStateSchema>;
