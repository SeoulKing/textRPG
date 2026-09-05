import { z } from "zod";

export const HealthConditionKindSchema = z.enum(["injury", "infection"]);
const ConditionStateSchema = z.object({
  level: z.number().int().min(0).max(4).default(0),
  damageProgress: z.number().min(0).max(1).default(0),
});
export const HealthConditionsSchema = z.object({
  injury: ConditionStateSchema.default(() => ({ level: 0, damageProgress: 0 })),
  infection: ConditionStateSchema.extend({
    worseningElapsedMinutes: z.number().min(0).max(360).default(0),
  }).default(() => ({ level: 0, damageProgress: 0, worseningElapsedMinutes: 0 })),
}).default(() => ({
  injury: { level: 0, damageProgress: 0 },
  infection: { level: 0, damageProgress: 0, worseningElapsedMinutes: 0 },
}));
export type HealthConditionKind = z.infer<typeof HealthConditionKindSchema>;
export type HealthConditions = z.infer<typeof HealthConditionsSchema>;
