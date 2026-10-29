import { AcademyMapSchema } from "./academy-map";
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
import { CombatSkillDetailsSchema, SkillIdSchema } from "./skill-progression";

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
  arcanaSpells: z.array(z.object({
    id: z.enum(["fireball", "flame_wave", "flame_guard", "meteor", "giant_fireball", "flame_barrage"]),
    parentSkill:z.string().optional(), name: z.string(), school: z.string(), schoolName: z.string(),
    unlockLevel: z.number(), cost: z.number(), cooldown: z.number(), ratio: z.number(),
    targeting: z.enum(["projectile", "cone", "self"]), thumbnail: z.string(),
    rangeTiles: z.number(), angle: z.number(), duration: z.number(),
    tree: z.object({selectedUltimates:z.array(z.string()).optional(),maxLevel:z.number().optional(),master:z.boolean().optional(),selectedUltimate:z.string().nullable().optional(),level:z.number(),xp:z.number(),xpRequired:z.number(),points:z.number(),spent:z.number(),editable:z.boolean(),nodes:z.array(z.object({id:z.string(),name:z.string(),maxRank:z.number(),row:z.number(),column:z.number(),parents:z.array(z.string()),level:z.number(),effect:z.string(),amount:z.number(),pointCost:z.number().optional(),automatic:z.boolean().optional(),specialization:z.string().optional(),rank:z.number(),available:z.boolean(),reason:z.string(),current:z.string(),next:z.string()}))}).optional(),
    equipped: z.boolean(), mastery: z.number(), masteryXp: z.number(),
    unlocked: z.boolean(), learnable: z.boolean(), schoolUnlocked: z.boolean(), magnitude: z.number(),
  })).default([]),
  academyMap: AcademyMapSchema.nullable().default(null),
  conditionCards: z.array(z.object({
    kind: z.enum(["injury", "infection", "exhaustion"]), label: z.string(), level: z.number().int().min(1).max(4),
    nextDamageMinutes: z.number().nonnegative().nullable(), nextWorseningMinutes: z.number().nonnegative().nullable(),
  })).default([]),
  gameId: z.string(),
  state: GameStateSchema,
  currentScene: SceneCardSchema,
  visibleLocations: z.array(LocationCardSchema),
  visiblePeople: z.array(PersonCardSchema),
  inventoryCards: z.array(ItemCardSchema),
  inventoryLights: z.array(z.object({
    itemId: z.string(), name: z.string(), worldId: z.string(), entityId: z.string(),
    revision: z.number().int().nonnegative(), on: z.boolean(), canTurnOn: z.boolean(), reason: z.string().optional(),
  })).default([]),
  exploration: z.object({
    revision: z.number().int().nonnegative(), roomName: z.string(),
    targets: z.array(z.object({ id: z.string(), name: z.string(), placement: z.string(), observed: z.boolean(), actions: z.array(ActionChoiceSchema) })),
    generalActions: z.array(ActionChoiceSchema),
  }).nullable().default(null),
  itemCatalog: z.array(ItemCardSchema).default([]),
  protagonist: ProtagonistCardSchema,
  storyMaterials: StoryMaterialsSchema,
  quests: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      summary: z.string(),
      status: QuestStateSchema,
      nextStep: z.string().optional(),
      requirements: z.array(
        z.object({
          itemId: z.string(),
          name: z.string(),
          amount: z.number().int().positive(),
          ownedAmount: z.number().int().nonnegative(),
          met: z.boolean(),
          sourceHints: z.array(z.string()).default([]),
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
      id: SkillIdSchema,
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
      combat: CombatSkillDetailsSchema.optional(),
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
