import { z } from "zod";

/** Authored life rules; neither destinations nor food may be invented by prose. */
export const ActorRoutineSchema = z.object({
  homeZone: z.string(), roamZones: z.array(z.string()).min(1),
  foodItemIds: z.array(z.string()).default(["cannedFood"]),
  decisionSeconds: z.number().int().min(5).max(3600).default(60),
  hungerIntervalSeconds: z.number().int().min(60).default(600),
  initialHunger: z.number().int().min(0).max(100).default(40),
  initialFatigue: z.number().int().min(0).max(100).default(25),
  mealRelief: z.number().int().min(1).max(100).default(35),
});
export const ActorLifeSchema = z.object({
  mode: z.enum(["REST", "SEARCH_FOOD", "ESCAPE", "INTERACT"]).default("REST"),
  hunger: z.number().int().min(0).max(100), fatigue: z.number().int().min(0).max(100),
  remainingSeconds: z.number().int().nonnegative(), hungerClock: z.number().int().nonnegative().default(0), fatigueClock: z.number().int().nonnegative().default(0),
  searched: z.array(z.string()).default([]), inspected: z.array(z.string()).default([]),
  threats: z.array(z.object({ zone:z.string(), until:z.number().nonnegative() })).default([]),
  retryAt: z.number().nonnegative().default(0),
});
export type ActorLife = z.infer<typeof ActorLifeSchema>;
