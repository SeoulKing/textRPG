import { z } from "zod";
import { ConditionSchema } from "./condition-effect";
import { EffectSchema } from "./condition-effect";

export const GameActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("travel"), targetId: z.string() }),
  z.object({ type: z.literal("use_item"), itemId: z.string() }),
  z.object({ type: z.literal("content_action"), actionId: z.string() }),
  z.object({ type: z.literal("content_choice"), choiceId: z.string() }),
  z.object({ type: z.literal("rest") }),
  z.object({ type: z.literal("cook") }),
  z.object({ type: z.literal("buy_meal") }),
  z.object({ type: z.literal("generate_event"), locationId: z.string().optional() }),
]);

export const ActionTypeSchema = z.enum(["travel", "search", "rest", "use", "talk", "explore"]);
export const ActionVisibilitySchema = z.enum(["scene", "event"]);

export const ActionDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: ActionTypeSchema,
  outcomeHint: z.string().default("Push the situation forward."),
  visibility: ActionVisibilitySchema.default("scene"),
  locationIds: z.array(z.string()).default([]),
  conditions: z.array(ConditionSchema).default([]),
  effects: z.array(EffectSchema).default([]),
  nextEventId: z.string().optional(),
  nextSceneId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  riskHint: z.enum(["low", "medium", "high"]).optional(),
});

export type GameAction = z.infer<typeof GameActionSchema>;
export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;
