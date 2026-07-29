import { z } from "zod";
import { ConditionSchema } from "./condition-effect";
import { EffectSchema } from "./condition-effect";
import { ChoiceLoadingSchema, GameActionSchema } from "./action";
import { ActionPresentationModeSchema } from "./action";
import { SkillUseSchema } from "./skill-progression";

export const RiskHintSchema = z.enum(["low", "medium", "high"]);

export const CraftingRecipeRequirementSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  requiredAmount: z.number().int().positive(),
  ownedAmount: z.number().int().nonnegative(),
  met: z.boolean(),
});

export const CraftingRecipePrerequisiteSchema = z.object({
  label: z.string(),
  met: z.boolean(),
});

export const CraftingRecipeSchema = z.object({
  actionLabel: z.string().default("제작"),
  effect: z.string(),
  prerequisites: z.array(CraftingRecipePrerequisiteSchema).default([]),
  requirements: z.array(CraftingRecipeRequirementSchema),
});

export const StoryChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  outcomeHint: z.string(),
  showOutcomeHint: z.boolean().optional(),
  remainingUses: z.number().int().nonnegative().optional(),
  loading: ChoiceLoadingSchema.optional(),
  craftingRecipe: CraftingRecipeSchema.optional(),
  serverActionHint: GameActionSchema,
  isAvailable: z.boolean().default(true),
  descriptionTag: z.string().optional(),
  tags: z.array(z.string()).optional(),
  conditions: z.array(ConditionSchema).optional(),
  effects: z.array(EffectSchema).optional(),
  riskHint: RiskHintSchema.optional(),
  hidden: z.boolean().optional(),
  nextEventId: z.string().optional(),
  nextSceneId: z.string().optional(),
});

export const ActionChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  outcomeHint: z.string(),
  showOutcomeHint: z.boolean().optional(),
  remainingUses: z.number().int().nonnegative().optional(),
  loading: ChoiceLoadingSchema.optional(),
  craftingRecipe: CraftingRecipeSchema.optional(),
  action: GameActionSchema,
  isAvailable: z.boolean().default(true),
  statusLabel: z.string().optional(),
  nextSceneId: z.string().optional(),
});

export const ChoiceDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  outcomeHint: z.string(),
  showOutcomeHint: z.boolean().optional(),
  loading: ChoiceLoadingSchema.optional(),
  descriptionTag: z.string().optional(),
  tags: z.array(z.string()).optional(),
  presentationMode: ActionPresentationModeSchema.default("when_conditions_met"),
  conditions: z.array(ConditionSchema).default([]),
  effects: z.array(EffectSchema).default([]),
  failureEffects: z.array(EffectSchema).default([]),
  failureNote: z.string().optional(),
  systemNote: z.string().nullable().optional(),
  riskHint: RiskHintSchema.optional(),
  hidden: z.boolean().default(false),
  nextEventId: z.string().optional(),
  nextSceneId: z.string().optional(),
  skillUse: SkillUseSchema.optional(),
});

export type StoryChoice = z.infer<typeof StoryChoiceSchema>;
export type ActionChoice = z.infer<typeof ActionChoiceSchema>;
export type ChoiceDefinition = z.infer<typeof ChoiceDefinitionSchema>;
export type CraftingRecipe = z.infer<typeof CraftingRecipeSchema>;
