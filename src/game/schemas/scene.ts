import { z } from "zod";
import { ConditionSchema } from "./condition-effect";
import { StoryChoiceSchema } from "./choice";

export const SceneDefinitionSchema = z.object({
  id: z.string(),
  eventId: z.string().optional(),
  locationId: z.string(),
  title: z.string(),
  paragraphs: z.array(z.string()).min(1),
  choiceIds: z.array(z.string()).default([]),
  conditions: z.array(ConditionSchema).default([]),
  introFlag: z.string().optional(),
  suppressLocationInteractions: z.boolean().optional(),
});

export const SceneCardSchema = z.object({
  id: z.string(),
  eventId: z.string().optional(),
  locationId: z.string(),
  title: z.string(),
  paragraphs: z.array(z.string()).min(1),
  introFlag: z.string().optional(),
  choices: z.array(StoryChoiceSchema),
  materialIds: z.object({
    locationIds: z.array(z.string()),
    personIds: z.array(z.string()),
    itemIds: z.array(z.string()),
  }),
  source: z.enum(["template", "llm"]),
  generatedAt: z.string(),
});

export type SceneDefinition = z.infer<typeof SceneDefinitionSchema>;
export type SceneCard = z.infer<typeof SceneCardSchema>;
