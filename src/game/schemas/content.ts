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

export const StockNodeItemDefinitionSchema = z.object({
  itemId: z.string(),
  initialQuantity: z.number().int().nonnegative(),
});

export const StockNodeDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  money: z.number().int().nonnegative().default(0),
  items: z.array(StockNodeItemDefinitionSchema).default([]),
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
  /** 이 장소에서 노출되는 상호작용(라벨·조건·효과는 각 객체에 정의). */
  interactionChoices: z.array(ActionDefinitionSchema).default([]),
  eventIds: z.array(z.string()).default([]),
  links: z.record(z.string(), LinkDefinitionSchema),
  stockNodes: z.array(StockNodeDefinitionSchema).default([]),
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
export type StockNodeItemDefinition = z.infer<typeof StockNodeItemDefinitionSchema>;
export type StockNodeDefinition = z.infer<typeof StockNodeDefinitionSchema>;
export type LocationDefinition = z.infer<typeof LocationDefinitionSchema>;
export type ContentRegistry = z.infer<typeof ContentRegistrySchema>;
