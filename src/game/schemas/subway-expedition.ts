import { z } from "zod";

export const SubwayExpeditionApproachSchema = z.enum([
  "careful",
  "scavenge",
  "force",
  "observe",
]);

export const SubwayExpeditionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  outcomeHint: z.string().min(1),
  approach: SubwayExpeditionApproachSchema,
  riskHint: z.enum(["low", "medium", "high"]),
});

export const SubwayExpeditionMajorEventSchema = z.object({
  title: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1).max(3),
  resolutionGoal: z.string().min(1),
  options: z.array(SubwayExpeditionOptionSchema).min(2).max(3),
});

export const SubwayExpeditionLootContentSchema = z.object({
  itemId: z.string().min(1),
  amount: z.number().int().positive(),
});

export const SubwayExpeditionLootSpotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  searchHint: z.string().min(1),
  contents: z.array(SubwayExpeditionLootContentSchema),
});

export const SubwayExpeditionFloorSchema = z.object({
  id: z.string().min(1),
  depth: z.number().int().positive(),
  zone: z.enum(["concourse", "platform", "train", "track", "maintenance", "deep_tunnel"]),
  title: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(2).max(4),
  tensionSummary: z.string().min(1),
  majorEvent: SubwayExpeditionMajorEventSchema,
  lootSpots: z.array(SubwayExpeditionLootSpotSchema).length(3),
  source: z.enum(["template", "llm"]),
  generatedAt: z.string(),
});

export const SubwayExpeditionHistoryEntrySchema = z.object({
  depth: z.number().int().positive(),
  title: z.string(),
  choiceLabel: z.string(),
  outcome: z.string(),
});

export const SubwayFloorProgressSchema = z.object({
  eventResolved: z.boolean().default(false),
  eventChoiceLabel: z.string().default(""),
  eventOutcome: z.string().default(""),
  searchedLootSpotIds: z.array(z.string()).default([]),
  floorLoot: z.record(z.string(), z.number().int().nonnegative()).default({}),
}).default({
  eventResolved: false,
  eventChoiceLabel: "",
  eventOutcome: "",
  searchedLootSpotIds: [],
  floorLoot: {},
});

export const SubwayExpeditionStateSchema = z.object({
  active: z.boolean().default(false),
  runNumber: z.number().int().nonnegative().default(0),
  depth: z.number().int().nonnegative().default(0),
  deepestDepth: z.number().int().nonnegative().default(0),
  entryElapsedMs: z.number().int().nonnegative().default(0),
  carriedLoot: z.record(z.string(), z.number().int().nonnegative()).default({}),
  currentFloor: SubwayExpeditionFloorSchema.nullable().default(null),
  currentFloorProgress: SubwayFloorProgressSchema,
  history: z.array(SubwayExpeditionHistoryEntrySchema).default([]),
  lastOutcome: z.string().default(""),
}).default({
  active: false,
  runNumber: 0,
  depth: 0,
  deepestDepth: 0,
  entryElapsedMs: 0,
  carriedLoot: {},
  currentFloor: null,
  currentFloorProgress: {
    eventResolved: false,
    eventChoiceLabel: "",
    eventOutcome: "",
    searchedLootSpotIds: [],
    floorLoot: {},
  },
  history: [],
  lastOutcome: "",
});

export type SubwayExpeditionApproach = z.infer<typeof SubwayExpeditionApproachSchema>;
export type SubwayExpeditionOption = z.infer<typeof SubwayExpeditionOptionSchema>;
export type SubwayExpeditionLootSpot = z.infer<typeof SubwayExpeditionLootSpotSchema>;
export type SubwayExpeditionFloor = z.infer<typeof SubwayExpeditionFloorSchema>;
export type SubwayExpeditionState = z.infer<typeof SubwayExpeditionStateSchema>;
