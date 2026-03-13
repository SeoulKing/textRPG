import { z } from "zod";
import { RiskSchema } from "./base";
import { ActionDefinitionSchema } from "./action";
import { ChoiceDefinitionSchema } from "./choice";
import { EventDefinitionSchema } from "./event";
import { SceneDefinitionSchema } from "./scene";

export const LinkDefinitionSchema = z.object({
  note: z.string(),
  requiredFlag: z.string().optional(),
  blockedReason: z.string().optional(),
});

export const LocationDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  risk: RiskSchema,
  imagePath: z.string().nullable(),
  summary: z.string(),
  tags: z.array(z.string()),
  traits: z.array(z.string()),
  obtainableItemIds: z.array(z.string()),
  residentIds: z.array(z.string()),
  neighbors: z.array(z.string()),
  availableActionIds: z.array(z.string()).default([]),
  eventIds: z.array(z.string()).default([]),
  links: z.record(z.string(), LinkDefinitionSchema),
});

export const ContentRegistrySchema = z.object({
  locations: z.record(z.string(), LocationDefinitionSchema),
  items: z.record(z.string(), z.unknown()),
  people: z.record(z.string(), z.unknown()),
  quests: z.record(z.string(), z.unknown()),
  skills: z.record(z.string(), z.unknown()),
  actions: z.record(z.string(), ActionDefinitionSchema),
  choices: z.record(z.string(), ChoiceDefinitionSchema),
  events: z.record(z.string(), EventDefinitionSchema),
  scenes: z.record(z.string(), SceneDefinitionSchema),
});

export type LinkDefinition = z.infer<typeof LinkDefinitionSchema>;
export type LocationDefinition = z.infer<typeof LocationDefinitionSchema>;
export type ContentRegistry = z.infer<typeof ContentRegistrySchema>;
