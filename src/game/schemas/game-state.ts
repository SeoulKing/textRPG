import { z } from "zod";
import { PlayerSchema } from "./player";
import { WorldStateSchema } from "./world-state";
import { QuestStateSchema } from "./quest";
import { DynamicWorldRegistrySchema, FrontierStateSchema, NarrativeStateSchema, WorldPlanSchema } from "./dynamic-world";
import { SubwayExpeditionStateSchema } from "./subway-expedition";
import { SkillProgressStateSchema } from "./skill-progression";
import { SystemNoteEntriesSchema } from "./system-note";
import { NpcDialogueStateSchema } from "./npc-dialogue";

export const LogEntrySchema = z.object({
  timestampLabel: z.string(),
  message: z.string(),
});

export const GameStateSchema = z.object({
  saveVersion: z.number().int(),
  sceneId: z.string(),
  activeEventId: z.string().nullable(),
  location: z.string(),
  day: z.number().int().positive(),
  phaseIndex: z.number().int().nonnegative(),
  worldElapsedMs: z.number().int().nonnegative(),
  lastRealTimestamp: z.number().int().nonnegative(),
  autoEnergyElapsedMs: z.number().int().nonnegative(),
  exhaustionElapsedMs: z.number().int().nonnegative(),
  isGameOver: z.boolean(),
  gameOverReason: z.string(),
  stageClear: z.boolean(),
  stats: z.object({
    hp: z.number().int().min(0).max(10),
    mind: z.number().int().min(0).max(10),
    energy: z.number().int().min(0).max(15),
  }),
  money: z.number().int().nonnegative(),
  skills: z.array(z.string()),
  skillProgress: SkillProgressStateSchema,
  inventory: z.record(z.string(), z.number().int().nonnegative()),
  toolDurability: z.record(z.string(), z.number().int().nonnegative()).default({}),
  stockState: z.record(z.string(), z.number().int().nonnegative()).default({}),
  discoveredStockNodeIds: z.array(z.string()).default([]),
  activeStockNodeId: z.string().nullable().default(null),
  dynamicContent: DynamicWorldRegistrySchema.default({
    locations: {},
    items: {},
    people: {},
    quests: {},
    skills: {},
    actions: {},
    choices: {},
    events: {},
    scenes: {},
  }),
  worldPlan: WorldPlanSchema.default({
    today: { day: 1, regions: [], notes: [] },
    tomorrow: { day: 2, evolutions: [], notes: [] },
  }),
  frontierState: FrontierStateSchema.default({ nextSequence: 1, slots: {} }),
  narrativeState: NarrativeStateSchema.default({ nextBeatSequence: 1, history: [], pregenerated: {}, anchors: {} }),
  subwayExpedition: SubwayExpeditionStateSchema,
  npcDialogue: NpcDialogueStateSchema,
  flags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  quests: z.record(z.string(), QuestStateSchema),
  lastSleepEnergy: z.number().int().min(0).max(15),
  exhaustionLevel: z.number().int().nonnegative(),
  log: z.array(LogEntrySchema),
  systemNote: z.string(),
  systemNoteEntries: SystemNoteEntriesSchema.default([]),
});

export const GameStateV2Schema = z.object({
  player: PlayerSchema,
  worldState: WorldStateSchema,
  currentLocationId: z.string(),
  currentSceneId: z.string(),
  activeQuestIds: z.array(z.string()),
  completedQuestIds: z.array(z.string()),
  log: z.array(LogEntrySchema),
  systemNote: z.string(),
  isGameOver: z.boolean(),
  gameOverReason: z.string(),
  stageClear: z.boolean(),
  turn: z.number().int().nonnegative().optional(),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;
export type GameState = z.infer<typeof GameStateSchema>;
export type GameStateV2 = z.infer<typeof GameStateV2Schema>;
