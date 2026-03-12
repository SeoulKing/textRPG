import { z } from "zod";
import { RiskSchema } from "./base";

export const LocationCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  risk: RiskSchema,
  summary: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  traits: z.array(z.string()),
  obtainableItemIds: z.array(z.string()),
  residentIds: z.array(z.string()),
  neighbors: z.array(z.string()),
  imagePath: z.string().nullable(),
  source: z.enum(["template", "llm"]),
  generatedAt: z.string(),
  availableActionIds: z.array(z.string()).optional(),
  eventIds: z.array(z.string()).optional(),
});

export type LocationCard = z.infer<typeof LocationCardSchema>;
