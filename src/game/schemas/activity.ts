import { z } from "zod";

export const ActivityKindSchema = z.enum(["craft", "cook", "build", "rest"]);
export const RestActivityDefinitionSchema = z.object({
  kind: z.literal("rest"),
  startsAtHour: z.number().int().min(0).max(23),
  untilHour: z.number().int().min(1).max(24),
  recovery: z.object({
    intervalMinutes: z.number().int().min(1).max(120),
    hp: z.number().int().min(0).max(10),
    mind: z.number().int().min(0).max(10),
  }),
}).refine(value => value.untilHour > value.startsAtHour, "Rest must end after its starting hour.");
export type RestActivityDefinition = z.infer<typeof RestActivityDefinitionSchema>;
/** Recipes pay inputs before completion; rest advances in interruptible recovery intervals. */
export const ActivityDefinitionSchema = z.union([
  z.object({ kind: z.enum(["craft", "cook", "build"]) }),
  RestActivityDefinitionSchema,
]);
export const ActivityResultSchema = z.object({
  revision: z.number().int().nonnegative(),
  definitionId: z.string(),
  kind: ActivityKindSchema,
  status: z.enum(["completed", "interrupted"]),
  startedAtMinutes: z.number().nonnegative(),
  plannedMinutes: z.number().positive(),
  elapsedMinutes: z.number().nonnegative(),
  consumedItems: z.record(z.string(), z.number().int().positive()),
  storedConsumedItems: z.record(z.string(), z.number().int().positive()).optional(),
  workstation: z.object({ id: z.string(), name: z.string(), durationMultiplier: z.number().positive().max(1) }).optional(),
  producedItems: z.record(z.string(), z.number().int().positive()),
  moneySpent: z.number().int().nonnegative(),
  reason: z.string().optional(),
  paragraphs: z.array(z.string()).min(1).max(3).optional(),
  generatedAt: z.string().datetime().optional(),
});
