import { z } from "zod";
import { ActionDefinitionSchema } from "./action";
import { ChoiceDefinitionSchema } from "./choice";
import { LocationDefinitionSchema } from "./content";
import { EffectSchema } from "./condition-effect";
import { EventDefinitionSchema } from "./event";
import { ItemEffectsSchema } from "./item";
import { QuestDefinitionSchema } from "./quest";
import { SceneDefinitionSchema } from "./scene";

const DynamicItemDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(["food", "drink", "medicine", "trade", "ticket", "material"]),
  rarity: z.enum(["common", "uncommon", "rare"]),
  price: z.number().int().nonnegative(),
  tags: z.array(z.string()).default([]),
  effects: ItemEffectsSchema,
});

const DynamicPersonDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  personality: z.array(z.string()).min(1),
  relationToPlayer: z.string(),
  inventoryItemIds: z.array(z.string()).default([]),
  locationId: z.string(),
  summary: z.string(),
});

const DynamicSkillDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
});

export const DynamicWorldRegistrySchema = z.object({
  locations: z.record(z.string(), LocationDefinitionSchema).default({}),
  items: z.record(z.string(), DynamicItemDefinitionSchema).default({}),
  people: z.record(z.string(), DynamicPersonDefinitionSchema).default({}),
  quests: z.record(z.string(), QuestDefinitionSchema).default({}),
  skills: z.record(z.string(), DynamicSkillDefinitionSchema).default({}),
  actions: z.record(z.string(), ActionDefinitionSchema).default({}),
  choices: z.record(z.string(), ChoiceDefinitionSchema).default({}),
  events: z.record(z.string(), EventDefinitionSchema).default({}),
  scenes: z.record(z.string(), SceneDefinitionSchema).default({}),
});

export const DayEvolutionUpdateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stock_item"),
    locationId: z.string(),
    nodeId: z.string(),
    itemId: z.string(),
    quantity: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("stock_money"),
    locationId: z.string(),
    nodeId: z.string(),
    amount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("move_person"),
    personId: z.string(),
    locationId: z.string(),
    summary: z.string().optional(),
    relationToPlayer: z.string().optional(),
  }),
  z.object({
    type: z.literal("scene_text"),
    sceneId: z.string(),
    title: z.string().optional(),
    paragraphs: z.array(z.string()).min(1).optional(),
  }),
  z.object({
    type: z.literal("location_text"),
    locationId: z.string(),
    summary: z.string().optional(),
    traits: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("activate_quest"),
    questId: z.string(),
  }),
  z.object({
    type: z.literal("complete_quest"),
    questId: z.string(),
  }),
  z.object({
    type: z.literal("set_flag"),
    flag: z.string(),
  }),
  z.object({
    type: z.literal("clear_flag"),
    flag: z.string(),
  }),
]);

export const DayEvolutionPlanSchema = z.object({
  id: z.string(),
  packageLocationId: z.string(),
  day: z.number().int().positive(),
  summary: z.string(),
  updates: z.array(DayEvolutionUpdateSchema).default([]),
});

export const PlannedRegionSummarySchema = z.object({
  locationId: z.string(),
  sourceLocationId: z.string(),
  sourceFrontierActionId: z.string(),
  title: z.string(),
  summary: z.string(),
  createdDay: z.number().int().positive(),
});

export const WorldPlanWindowSchema = z.object({
  day: z.number().int().positive(),
  regions: z.array(PlannedRegionSummarySchema).default([]),
  notes: z.array(z.string()).default([]),
});

export const WorldPlanSchema = z.object({
  today: WorldPlanWindowSchema,
  tomorrow: z
    .object({
      day: z.number().int().positive(),
      evolutions: z.array(DayEvolutionPlanSchema).default([]),
      notes: z.array(z.string()).default([]),
    })
    .nullable()
    .default(null),
});

export const FrontierSlotSchema = z.object({
  actionId: z.string(),
  sourceLocationId: z.string(),
  generatedLocationId: z.string().nullable().default(null),
  note: z.string().default(""),
  status: z.enum(["unexpanded", "expanded", "blocked"]).default("unexpanded"),
  lastExpandedDay: z.number().int().positive().nullable().default(null),
});

export const FrontierStateSchema = z.object({
  nextSequence: z.number().int().positive().default(1),
  slots: z.record(z.string(), FrontierSlotSchema).default({}),
});

export const GeneratedRegionPackageSchema = z.object({
  locationId: z.string(),
  sourceLocationId: z.string(),
  sourceFrontierActionId: z.string(),
  frontierActionId: z.string(),
  title: z.string(),
  summary: z.string(),
  entryEventId: z.string().nullable().default(null),
  registry: DynamicWorldRegistrySchema,
  tomorrowEvolution: DayEvolutionPlanSchema.nullable().default(null),
});

export const NarrativeContinuationRequestSchema = z.object({
  gameId: z.string(),
  locationId: z.string(),
  anchorLocationId: z.string(),
  anchorLocationName: z.string(),
  sourceSceneId: z.string(),
  sourceSceneTitle: z.string(),
  sourceSceneParagraphs: z.array(z.string()).min(1),
  trigger: z.object({
    kind: z.enum(["action", "choice"]),
    id: z.string(),
    label: z.string(),
    outcomeHint: z.string(),
    tags: z.array(z.string()).default([]),
  }),
  recentLog: z.array(z.string()).default([]),
  inventoryItemIds: z.array(z.string()).default([]),
  activeQuestIds: z.array(z.string()).default([]),
  localSceneIds: z.array(z.string()).default([]),
  localPeopleIds: z.array(z.string()).default([]),
  localStockNodeIds: z.array(z.string()).default([]),
  lineageSceneIds: z.array(z.string()).default([]),
  sequence: z.number().int().positive(),
});

export const GeneratedStoryBeatPatchSchema = z.object({
  sceneId: z.string(),
  registry: DynamicWorldRegistrySchema,
  immediateEffects: z.array(EffectSchema).default([]),
});

export const GeneratedStoryBeatSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  anchorLocationId: z.string(),
  sourceSceneId: z.string(),
  sourceTriggerId: z.string(),
  summary: z.string(),
  patch: GeneratedStoryBeatPatchSchema,
});

export const NarrativeHistoryEntrySchema = z.object({
  beatId: z.string(),
  locationId: z.string(),
  sceneId: z.string(),
  sourceSceneId: z.string(),
  triggerId: z.string(),
  at: z.string(),
});

export const PregeneratedBeatCacheEntrySchema = z.object({
  key: z.string(),
  locationId: z.string(),
  sourceSceneId: z.string(),
  triggerId: z.string(),
  stateHash: z.string(),
  createdAt: z.string(),
  beat: GeneratedStoryBeatSchema,
});

export const NarrativeStateSchema = z.object({
  nextBeatSequence: z.number().int().positive().default(1),
  history: z.array(NarrativeHistoryEntrySchema).default([]),
  pregenerated: z.record(z.string(), PregeneratedBeatCacheEntrySchema).default({}),
});

export const GenerationGuardrailsSchema = z.object({
  requiredIdPrefix: z.literal("dyn_"),
  maxStatDeltaPerEffect: z.number().int().positive(),
  maxItemAmountPerEffect: z.number().int().positive(),
  maxMoneyDeltaPerEffect: z.number().int().positive(),
  maxStockQuantity: z.number().int().positive(),
  forbiddenEffectTypes: z.array(z.string()),
  allowedQuestObjectiveTypes: z.array(z.string()),
  allowedQuestRewardTypes: z.array(z.string()),
});

export type DynamicWorldRegistry = z.infer<typeof DynamicWorldRegistrySchema>;
export type DayEvolutionUpdate = z.infer<typeof DayEvolutionUpdateSchema>;
export type DayEvolutionPlan = z.infer<typeof DayEvolutionPlanSchema>;
export type PlannedRegionSummary = z.infer<typeof PlannedRegionSummarySchema>;
export type WorldPlan = z.infer<typeof WorldPlanSchema>;
export type FrontierSlot = z.infer<typeof FrontierSlotSchema>;
export type FrontierState = z.infer<typeof FrontierStateSchema>;
export type GeneratedRegionPackage = z.infer<typeof GeneratedRegionPackageSchema>;
export type NarrativeContinuationRequest = z.infer<typeof NarrativeContinuationRequestSchema>;
export type GeneratedStoryBeatPatch = z.infer<typeof GeneratedStoryBeatPatchSchema>;
export type GeneratedStoryBeat = z.infer<typeof GeneratedStoryBeatSchema>;
export type NarrativeHistoryEntry = z.infer<typeof NarrativeHistoryEntrySchema>;
export type PregeneratedBeatCacheEntry = z.infer<typeof PregeneratedBeatCacheEntrySchema>;
export type NarrativeState = z.infer<typeof NarrativeStateSchema>;
export type GenerationGuardrails = z.infer<typeof GenerationGuardrailsSchema>;
