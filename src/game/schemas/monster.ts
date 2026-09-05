import { z } from "zod";

export const MonsterDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  maxHp: z.number().int().positive(),
  attack: z.number().int().nonnegative(),
  description: z.string(),
  traits: z.array(z.string()).default([]),
});

export type MonsterDefinition = z.infer<typeof MonsterDefinitionSchema>;
