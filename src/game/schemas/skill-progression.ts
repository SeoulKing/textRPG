import { z } from "zod";

export const SkillIdSchema = z.enum(["collection", "exploration", "fishing", "combat"]);

export const SkillUseSchema = z.object({
  // Combat experience is awarded by resolved combat turns, not timed content actions.
  skillId: SkillIdSchema.exclude(["combat"]),
});

export const SkillProgressEntrySchema = z.object({
  totalXp: z.number().int().min(0).max(320),
});

export const SkillProgressStateSchema = z.object({
  collection: SkillProgressEntrySchema,
  exploration: SkillProgressEntrySchema,
  fishing: SkillProgressEntrySchema,
  combat: SkillProgressEntrySchema.default({ totalXp: 0 }),
});

export const CombatSkillEffectsSchema = z.object({
  attackBonus: z.number().int().nonnegative(),
  hitChanceBonus: z.number().min(0).max(100),
  evasionBonus: z.number().min(0).max(100),
});

export const CombatSkillDetailsSchema = CombatSkillEffectsSchema.extend({
  turnXp: z.number().int().positive(),
  victoryXp: z.number().int().positive(),
  hitChanceCap: z.number().min(0).max(100),
  tiers: z.array(CombatSkillEffectsSchema.extend({
    level: z.number().int().min(1).max(5),
    totalXp: z.number().int().nonnegative(),
  })),
});

export type SkillId = z.infer<typeof SkillIdSchema>;
export type SkillUse = z.infer<typeof SkillUseSchema>;
export type SkillProgressEntry = z.infer<typeof SkillProgressEntrySchema>;
export type SkillProgressState = z.infer<typeof SkillProgressStateSchema>;
