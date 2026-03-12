import { z } from "zod";

export const PersonCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  personality: z.array(z.string()).min(1),
  relationToPlayer: z.string(),
  inventoryItemIds: z.array(z.string()),
  locationId: z.string(),
  summary: z.string(),
  source: z.enum(["template", "llm"]),
  generatedAt: z.string(),
});

export const ProtagonistCardSchema = z.object({
  id: z.literal("protagonist"),
  name: z.string(),
  summary: z.string(),
  inventoryItemIds: z.array(z.string()),
  usableSkillIds: z.array(z.string()),
  condition: z.object({
    hp: z.number().int().min(0).max(10),
    mind: z.number().int().min(0).max(10),
    fullness: z.number().int().min(0).max(10),
    money: z.number().int().nonnegative(),
    locationId: z.string(),
    day: z.number().int().positive(),
    phaseIndex: z.number().int().nonnegative(),
  }),
  source: z.enum(["template", "llm"]),
  generatedAt: z.string(),
});

export type PersonCard = z.infer<typeof PersonCardSchema>;
export type ProtagonistCard = z.infer<typeof ProtagonistCardSchema>;
