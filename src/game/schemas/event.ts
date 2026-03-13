import { z } from "zod";
import { ConditionSchema } from "./condition-effect";
import { StoryChoiceSchema } from "./choice";

export const EventDefinitionSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  title: z.string(),
  summary: z.string(),
  triggerConditions: z.array(ConditionSchema).default([]),
  choiceIds: z.array(z.string()).default([]),
  once: z.boolean().default(false),
  priority: z.number().int().default(0),
});

export const EventCardSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  title: z.string(),
  summary: z.string(),
  trigger: z.string(),
  choices: z.array(StoryChoiceSchema),
  rewards: z.array(z.string()),
  flags: z.array(z.string()),
  source: z.enum(["template", "llm"]),
  generatedAt: z.string(),
  triggerConditions: z.array(ConditionSchema).optional(),
  choiceIds: z.array(z.string()).optional(),
  once: z.boolean().optional(),
  priority: z.number().int().optional(),
});

export type EventDefinition = z.infer<typeof EventDefinitionSchema>;
export type EventCard = z.infer<typeof EventCardSchema>;
