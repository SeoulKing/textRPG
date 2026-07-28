import { z } from "zod";

export const SkillIdSchema = z.enum(["collection", "exploration"]);

export const SkillUseSchema = z.object({
  skillId: SkillIdSchema,
});

export const SkillProgressEntrySchema = z.object({
  totalXp: z.number().int().min(0).max(320),
});

export const SkillProgressStateSchema = z.object({
  collection: SkillProgressEntrySchema,
  exploration: SkillProgressEntrySchema,
});

export type SkillId = z.infer<typeof SkillIdSchema>;
export type SkillUse = z.infer<typeof SkillUseSchema>;
export type SkillProgressEntry = z.infer<typeof SkillProgressEntrySchema>;
export type SkillProgressState = z.infer<typeof SkillProgressStateSchema>;
