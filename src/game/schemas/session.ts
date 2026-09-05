import { z } from "zod";
import { GameStateSchema } from "./game-state";
import { LocationCardSchema } from "./location";
import { PersonCardSchema } from "./person";
import { ItemCardSchema } from "./item";
import { EventCardSchema } from "./event";
import { SceneCardSchema } from "./scene";
import { ProtagonistCardSchema } from "./person";
import { QuestStateSchema } from "./quest";
import { ActionChoiceSchema } from "./choice";

export const DevLlmTraceEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  scope: z.enum(["planner", "card", "subway", "dialogue"]),
  target: z.string(),
  stage: z.enum(["request", "raw_draft", "draft_validation", "compiler_summary", "compiled_result", "fallback", "error"]).optional(),
  model: z.string(),
  status: z.enum(["success", "fallback", "error"]),
  request: z.string(),
  response: z.string(),
  message: z.string(),
  errorReason: z.string().optional(),
});

export const WorldInstanceSchema = z.object({
  locationCards: z.record(z.string(), LocationCardSchema),
  personCards: z.record(z.string(), PersonCardSchema),
  itemCards: z.record(z.string(), ItemCardSchema),
  eventCards: z.record(z.string(), EventCardSchema),
  sceneCards: z.record(z.string(), SceneCardSchema),
  protagonistCard: ProtagonistCardSchema.nullable(),
});

export const GameSessionSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  state: GameStateSchema,
  world: WorldInstanceSchema,
});

export const TemplateStoreSchema = z.object({
  locationCards: z.record(z.string(), LocationCardSchema),
  personCards: z.record(z.string(), PersonCardSchema),
  itemCards: z.record(z.string(), ItemCardSchema),
  eventCards: z.record(z.string(), EventCardSchema),
  sceneCards: z.record(z.string(), SceneCardSchema),
  protagonistCard: ProtagonistCardSchema.nullable(),
});

export const StoryMaterialsSchema = z.object({
  locations: z.array(LocationCardSchema),
  people: z.array(PersonCardSchema),
  items: z.array(ItemCardSchema),
  protagonist: ProtagonistCardSchema,
});

export const MapEntrySchema = z.object({
  locationId: z.string(),
  isCurrent: z.boolean(),
  isVisible: z.boolean(),
  isKnown: z.boolean(),
  isVisited: z.boolean(),
  isAdjacent: z.boolean(),
  isReachable: z.boolean(),
  routeDistance: z.number().int().nonnegative().default(0),
  travelMinutes: z.number().int().nonnegative().default(0),
  routePath: z.array(z.string()).default([]),
  isControlled: z.boolean(),
  reason: z.string(),
});

export const SurvivalGoalSchema = z.object({
  targetDay: z.number().int().positive(),
  daysRemaining: z.number().int().nonnegative(),
  signalReady: z.boolean(),
  signalParts: z.array(
    z.object({
      itemId: z.string(),
      name: z.string(),
      owned: z.boolean(),
    })
  ),
});

export const StateSnapshotSchema = z.object({
  conditionCards: z.array(z.object({
    kind: z.enum(["injury", "infection"]), label: z.string(), level: z.number().int().min(1).max(4),
    nextDamageMinutes: z.number().nonnegative(), nextWorseningMinutes: z.number().nonnegative().nullable(),
  })).default([]),
  gameId: z.string(),
  state: GameStateSchema,
  currentScene: SceneCardSchema,
  visibleLocations: z.array(LocationCardSchema),
  visiblePeople: z.array(PersonCardSchema),
  inventoryCards: z.array(ItemCardSchema),
  itemCatalog: z.array(ItemCardSchema).default([]),
  protagonist: ProtagonistCardSchema,
  storyMaterials: StoryMaterialsSchema,
  quests: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      summary: z.string(),
      status: QuestStateSchema,
      requirements: z.array(
        z.object({
          itemId: z.string(),
          name: z.string(),
          amount: z.number().int().positive(),
          ownedAmount: z.number().int().nonnegative(),
          met: z.boolean(),
        })
      ).default([]),
    })
  ),
  skills: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
    })
  ),
  skillProgress: z.array(
    z.object({
      id: z.enum(["collection", "exploration", "fishing"]),
      name: z.string(),
      description: z.string(),
      level: z.number().int().min(1).max(5),
      maxLevel: z.literal(5),
      totalXp: z.number().int().min(0).max(320),
      xpIntoLevel: z.number().int().nonnegative(),
      xpForNextLevel: z.number().int().positive().nullable(),
      progressPercent: z.number().min(0).max(100),
      effectPercent: z.number().min(0).max(100),
      isMaxLevel: z.boolean(),
    })
  ),
  availableActions: z.array(ActionChoiceSchema),
  mapEntries: z.array(MapEntrySchema),
  latestEvent: EventCardSchema.nullable(),
  devLlmTrace: z.array(DevLlmTraceEntrySchema).default([]),
  survivalGoal: SurvivalGoalSchema,
});

export type WorldInstance = z.infer<typeof WorldInstanceSchema>;
export type GameSession = z.infer<typeof GameSessionSchema>;
export type TemplateStore = z.infer<typeof TemplateStoreSchema>;
export type StoryMaterials = z.infer<typeof StoryMaterialsSchema>;
export type MapEntry = z.infer<typeof MapEntrySchema>;
export type SurvivalGoal = z.infer<typeof SurvivalGoalSchema>;
export type StateSnapshot = z.infer<typeof StateSnapshotSchema>;
export type DevLlmTraceEntry = z.infer<typeof DevLlmTraceEntrySchema>;
