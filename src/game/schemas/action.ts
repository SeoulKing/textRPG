import { z } from "zod";
import { ConditionSchema } from "./condition-effect";
import { EffectSchema } from "./condition-effect";

export const GameActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("travel"), targetId: z.string() }),
  z.object({ type: z.literal("use_item"), itemId: z.string() }),
  z.object({ type: z.literal("rest") }),
  z.object({ type: z.literal("cook") }),
  z.object({ type: z.literal("buy_meal") }),
  z.object({ type: z.literal("generate_event"), locationId: z.string().optional() }),
]);

export const ActionTypeSchema = z.enum(["travel", "search", "rest", "use", "talk", "explore"]);

export const ActionDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: ActionTypeSchema,
  conditions: z.array(ConditionSchema).default([]),
  effects: z.array(EffectSchema).default([]),
  nextEventId: z.string().optional(),
  nextLocationId: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export type GameAction = z.infer<typeof GameActionSchema>;
export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;
