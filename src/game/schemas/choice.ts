import { z } from "zod";
import { ConditionSchema } from "./condition-effect";
import { EffectSchema } from "./condition-effect";
import { GameActionSchema } from "./action";
import { ActionPresentationModeSchema } from "./action";

export const RiskHintSchema = z.enum(["low", "medium", "high"]);

export const StoryChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  outcomeHint: z.string(),
  serverActionHint: GameActionSchema,
  isAvailable: z.boolean().default(true),
  descriptionTag: z.string().optional(),
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
  action: GameActionSchema,
  isAvailable: z.boolean().default(true),
  nextSceneId: z.string().optional(),
});

export const ChoiceDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  outcomeHint: z.string(),
  descriptionTag: z.string().optional(),
  presentationMode: ActionPresentationModeSchema.default("when_conditions_met"),
  conditions: z.array(ConditionSchema).default([]),
  effects: z.array(EffectSchema).default([]),
  failureEffects: z.array(EffectSchema).default([]),
  failureNote: z.string().optional(),
  riskHint: RiskHintSchema.optional(),
  hidden: z.boolean().default(false),
  nextEventId: z.string().optional(),
  nextSceneId: z.string().optional(),
});

export type StoryChoice = z.infer<typeof StoryChoiceSchema>;
export type ActionChoice = z.infer<typeof ActionChoiceSchema>;
export type ChoiceDefinition = z.infer<typeof ChoiceDefinitionSchema>;
