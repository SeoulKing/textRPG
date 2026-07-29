import { z } from "zod";
import { SubwayEncounterStateSchema } from "./subway-encounter";

export const SubwayGenerationSourceSchema = z.enum(["template", "llm"]);

export const SubwayExpeditionApproachSchema = z.enum([
  "careful",
  "scavenge",
  "force",
  "observe",
]);

export const SubwayStatChangeSchema = z.object({
  stat: z.enum(["hp", "mind"]),
  amount: z.number().int().min(-2).max(2).refine((amount) => amount !== 0, {
    message: "Stat changes cannot be zero.",
  }),
}).strict();

export const SubwayOutcomeMechanicsSchema = z.object({
  minutes: z.number().int().min(15).max(90),
  energyCost: z.number().int().min(0).max(3),
  statChanges: z.array(SubwayStatChangeSchema).max(2),
}).strict().superRefine((mechanics, context) => {
  const seenStats = new Set<string>();
  mechanics.statChanges.forEach((change, index) => {
    if (seenStats.has(change.stat)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate stat change for ${change.stat}.`,
        path: ["statChanges", index, "stat"],
      });
    }
    seenStats.add(change.stat);
  });
});

export const SubwayOutcomeVariantSchema = z.object({
  title: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1).max(3),
  summary: z.string().min(1),
  mechanics: SubwayOutcomeMechanicsSchema,
  nextFloorBridge: z.string().min(1),
  facts: z.array(z.string().min(1)),
  unresolvedThreads: z.array(z.string().min(1)),
  resolvedThreads: z.array(z.string().min(1)),
}).strict();

export const SubwayExpeditionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  outcomeHint: z.string().min(1),
  approach: SubwayExpeditionApproachSchema,
  riskHint: z.enum(["low", "medium", "high"]),
  outcomes: z.object({
    clean: SubwayOutcomeVariantSchema,
    costly: SubwayOutcomeVariantSchema,
  }).strict().optional(),
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
  resultParagraphs: z.array(z.string().min(1)).min(1).max(3).optional(),
});

export const SubwayStoryMemorySchema = z.object({
  facts: z.array(z.string()).default([]),
  unresolvedThreads: z.array(z.string()).default([]),
  resolvedThreads: z.array(z.string()).default([]),
  recentSummaries: z.array(z.string()).default([]),
  lastBridge: z.string().default(""),
}).default({
  facts: [],
  unresolvedThreads: [],
  resolvedThreads: [],
  recentSummaries: [],
  lastBridge: "",
});

export const SubwayRunPlanSchema = z.object({
  runNumber: z.number().int().nonnegative(),
  premise: z.string().min(1),
  objective: z.string().min(1),
  tone: z.string().min(1),
  motifs: z.array(z.string().min(1)),
  coreMystery: z.string().min(1),
  escalationNotes: z.array(z.string().min(1)),
  facts: z.array(z.string().min(1)),
  unresolvedThreads: z.array(z.string().min(1)),
  source: SubwayGenerationSourceSchema,
  generatedAt: z.string(),
}).strict();

export const SubwayMechanicsEnvelopeSchema = z.object({
  clean: z.array(SubwayOutcomeMechanicsSchema).min(1),
  costly: z.array(SubwayOutcomeMechanicsSchema).min(1),
}).strict();

export const SubwayExpeditionFloorSchema = z.object({
  id: z.string().min(1),
  depth: z.number().int().positive(),
  zone: z.enum(["concourse", "platform", "train", "track", "maintenance", "deep_tunnel"]),
  title: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(2).max(4),
  tensionSummary: z.string().min(1),
  situationKind: z.enum(["combat", "social", "hazard"]).default("hazard"),
  majorEvent: SubwayExpeditionMajorEventSchema,
  lootSpots: z.array(SubwayExpeditionLootSpotSchema).length(3),
  storyBeat: z.string().min(1).optional(),
  memoryDelta: SubwayStoryMemorySchema.optional(),
  source: SubwayGenerationSourceSchema,
  promptVersion: z.string().min(1).optional(),
  mechanicsEnvelopeHash: z.string().min(1).optional(),
  contextHash: z.string().min(1).optional(),
  generatedAt: z.string(),
});

export const SubwayFloorBundleSchema = SubwayExpeditionFloorSchema;

export const SubwayExpeditionHistoryEntrySchema = z.object({
  depth: z.number().int().positive(),
  title: z.string(),
  choiceLabel: z.string(),
  outcome: z.string(),
});

export const SubwayExpeditionPhaseSchema = z.enum([
  "encounter",
  "encounter_result",
  "event",
  "event_result",
  "loot",
  "loot_result",
  "complete",
  "generation_failed",
]);

export const SubwayCurrentResultSchema = z.object({
  kind: z.enum(["event", "loot"]),
  title: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1).max(3),
  summary: z.string().min(1),
  mechanics: SubwayOutcomeMechanicsSchema,
  nextFloorBridge: z.string(),
  source: SubwayGenerationSourceSchema,
  optionId: z.string().min(1).optional(),
  lootSpotId: z.string().min(1).optional(),
}).strict();

export const SubwayFloorProgressSchema = z.object({
  phase: SubwayExpeditionPhaseSchema.default("event"),
  encounter: SubwayEncounterStateSchema.nullable().default(null),
  currentResult: SubwayCurrentResultSchema.nullable().default(null),
  eventResolved: z.boolean().default(false),
  eventChoiceLabel: z.string().default(""),
  eventOutcome: z.string().default(""),
  searchedLootSpotIds: z.array(z.string()).default([]),
  floorLoot: z.record(z.string(), z.number().int().nonnegative()).default({}),
  generationFailure: z.string().default(""),
}).default({
  phase: "event",
  encounter: null,
  currentResult: null,
  eventResolved: false,
  eventChoiceLabel: "",
  eventOutcome: "",
  searchedLootSpotIds: [],
  floorLoot: {},
  generationFailure: "",
});

export const SubwayNextFloorStatusSchema = z.enum([
  "idle",
  "generating",
  "ready",
  "failed",
]);

export const SubwayPreparedNextFloorSchema = z.object({
  contextHash: z.string().min(1),
  floor: SubwayExpeditionFloorSchema,
  createdAt: z.string(),
  runNumber: z.number().int().nonnegative().optional(),
  sourceFloorId: z.string().min(1).optional(),
  targetDepth: z.number().int().positive().optional(),
  llmAttempted: z.boolean().default(false),
}).strict();

export const SubwayExpeditionStateSchema = z.object({
  active: z.boolean().default(false),
  runNumber: z.number().int().nonnegative().default(0),
  depth: z.number().int().nonnegative().default(0),
  deepestDepth: z.number().int().nonnegative().default(0),
  entryElapsedMs: z.number().int().nonnegative().default(0),
  carriedLoot: z.record(z.string(), z.number().int().nonnegative()).default({}),
  currentFloor: SubwayExpeditionFloorSchema.nullable().default(null),
  currentFloorProgress: SubwayFloorProgressSchema,
  runPlan: SubwayRunPlanSchema.nullable().default(null),
  storyMemory: SubwayStoryMemorySchema,
  preparedNextFloor: SubwayPreparedNextFloorSchema.nullable().default(null),
  nextFloorStatus: SubwayNextFloorStatusSchema.default("idle"),
  nextFloorError: z.string().default(""),
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
    phase: "event",
    encounter: null,
    currentResult: null,
    eventResolved: false,
    eventChoiceLabel: "",
    eventOutcome: "",
    searchedLootSpotIds: [],
    floorLoot: {},
    generationFailure: "",
  },
  runPlan: null,
  storyMemory: {
    facts: [],
    unresolvedThreads: [],
    resolvedThreads: [],
    recentSummaries: [],
    lastBridge: "",
  },
  preparedNextFloor: null,
  nextFloorStatus: "idle",
  nextFloorError: "",
  history: [],
  lastOutcome: "",
});

export type SubwayExpeditionApproach = z.infer<typeof SubwayExpeditionApproachSchema>;
export type SubwayGenerationSource = z.infer<typeof SubwayGenerationSourceSchema>;
export type SubwayStatChange = z.infer<typeof SubwayStatChangeSchema>;
export type SubwayOutcomeMechanics = z.infer<typeof SubwayOutcomeMechanicsSchema>;
export type SubwayOutcomeVariant = z.infer<typeof SubwayOutcomeVariantSchema>;
export type SubwayExpeditionOption = z.infer<typeof SubwayExpeditionOptionSchema>;
export type SubwayExpeditionLootSpot = z.infer<typeof SubwayExpeditionLootSpotSchema>;
export type SubwayStoryMemory = z.infer<typeof SubwayStoryMemorySchema>;
export type SubwayRunPlan = z.infer<typeof SubwayRunPlanSchema>;
export type SubwayMechanicsEnvelope = z.infer<typeof SubwayMechanicsEnvelopeSchema>;
export type SubwayExpeditionFloor = z.infer<typeof SubwayExpeditionFloorSchema>;
export type SubwayFloorBundle = z.infer<typeof SubwayFloorBundleSchema>;
export type SubwayExpeditionPhase = z.infer<typeof SubwayExpeditionPhaseSchema>;
export type SubwayCurrentResult = z.infer<typeof SubwayCurrentResultSchema>;
export type SubwayFloorProgress = z.infer<typeof SubwayFloorProgressSchema>;
export type SubwayPreparedNextFloor = z.infer<typeof SubwayPreparedNextFloorSchema>;
export type SubwayNextFloorStatus = z.infer<typeof SubwayNextFloorStatusSchema>;
export type SubwayExpeditionState = z.infer<typeof SubwayExpeditionStateSchema>;
