import { z } from "zod";
import { StoryChoiceSchema } from "./choice";

export const SceneCardSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  title: z.string(),
  paragraphs: z.array(z.string()).min(1),
  choices: z.array(StoryChoiceSchema),
  materialIds: z.object({
    locationIds: z.array(z.string()),
    personIds: z.array(z.string()),
    itemIds: z.array(z.string()),
  }),
  source: z.enum(["template", "llm"]),
  generatedAt: z.string(),
});

export type SceneCard = z.infer<typeof SceneCardSchema>;
