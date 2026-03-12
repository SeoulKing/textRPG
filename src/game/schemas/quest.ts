import { z } from "zod";
import { ConditionSchema } from "./condition-effect";

export const ObjectiveSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("obtain_item"), itemId: z.string(), amount: z.number().int().min(1).default(1) }),
  z.object({ type: z.literal("return_to_npc"), npcId: z.string() }),
  z.object({ type: z.literal("reach_location"), locationId: z.string() }),
  z.object({ type: z.literal("flag"), flag: z.string() }),
  z.object({ type: z.literal("daily_flag"), flag: z.string() }),
  z.object({ type: z.literal("stage_clear") }),
]);

export const QuestRewardSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("money"), amount: z.number().int() }),
  z.object({ type: z.literal("set_flag"), flag: z.string() }),
  z.object({ type: z.literal("add_item"), itemId: z.string(), amount: z.number().int().min(1).default(1) }),
]);

export const QuestTypeSchema = z.enum(["main", "side", "discovery"]);

export const QuestDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  type: QuestTypeSchema.default("side"),
  objectives: z.array(ObjectiveSchema),
  rewards: z.array(QuestRewardSchema).default([]),
  prerequisites: z.array(ConditionSchema).default([]),
  relatedNpcIds: z.array(z.string()).default([]),
  relatedLocationIds: z.array(z.string()).default([]),
});

export const QuestStateSchema = z.enum(["inactive", "active", "completed"]);

export type Objective = z.infer<typeof ObjectiveSchema>;
export type QuestReward = z.infer<typeof QuestRewardSchema>;
export type QuestDefinition = z.infer<typeof QuestDefinitionSchema>;
