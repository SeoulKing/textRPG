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
  scope: z.enum(["planner", "card"]),
  target: z.string(),
  model: z.string(),
  status: z.enum(["success", "fallback", "error"]),
  request: z.string(),
  response: z.string(),
  message: z.string(),
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
  isControlled: z.boolean(),
  reason: z.string(),
});

export const StateSnapshotSchema = z.object({
  gameId: z.string(),
  state: GameStateSchema,
  currentScene: SceneCardSchema,
  visibleLocations: z.array(LocationCardSchema),
  visiblePeople: z.array(PersonCardSchema),
  inventoryCards: z.array(ItemCardSchema),
  protagonist: ProtagonistCardSchema,
  storyMaterials: StoryMaterialsSchema,
  quests: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      summary: z.string(),
      status: QuestStateSchema,
    })
  ),
  skills: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
    })
  ),
  availableActions: z.array(ActionChoiceSchema),
  mapEntries: z.array(MapEntrySchema),
  latestEvent: EventCardSchema.nullable(),
  devLlmTrace: z.array(DevLlmTraceEntrySchema).default([]),
});

export type WorldInstance = z.infer<typeof WorldInstanceSchema>;
export type GameSession = z.infer<typeof GameSessionSchema>;
export type TemplateStore = z.infer<typeof TemplateStoreSchema>;
export type StoryMaterials = z.infer<typeof StoryMaterialsSchema>;
export type MapEntry = z.infer<typeof MapEntrySchema>;
export type StateSnapshot = z.infer<typeof StateSnapshotSchema>;
export type DevLlmTraceEntry = z.infer<typeof DevLlmTraceEntrySchema>;
