"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameStateV2Schema = exports.GameStateSchema = void 0;
const zod_1 = require("zod");
const player_1 = require("./player");
const world_state_1 = require("./world-state");
const quest_1 = require("./quest");
exports.GameStateSchema = zod_1.z.object({
    saveVersion: zod_1.z.number().int(),
    sceneId: zod_1.z.string(),
    location: zod_1.z.string(),
    day: zod_1.z.number().int().positive(),
    phaseIndex: zod_1.z.number().int().nonnegative(),
    worldElapsedMs: zod_1.z.number().int().nonnegative(),
    lastRealTimestamp: zod_1.z.number().int().nonnegative(),
    autoFullnessElapsedMs: zod_1.z.number().int().nonnegative(),
    starvationElapsedMs: zod_1.z.number().int().nonnegative(),
    isGameOver: zod_1.z.boolean(),
    gameOverReason: zod_1.z.string(),
    stageClear: zod_1.z.boolean(),
    stats: zod_1.z.object({
        hp: zod_1.z.number().int().min(0).max(10),
        mind: zod_1.z.number().int().min(0).max(10),
        fullness: zod_1.z.number().int().min(0).max(10),
    }),
    money: zod_1.z.number().int().nonnegative(),
    skills: zod_1.z.array(zod_1.z.string()),
    inventory: zod_1.z.record(zod_1.z.string(), zod_1.z.number().int().nonnegative()),
    flags: zod_1.z.record(zod_1.z.string(), zod_1.z.union([zod_1.z.boolean(), zod_1.z.number(), zod_1.z.string()])),
    quests: zod_1.z.record(zod_1.z.string(), quest_1.QuestStateSchema),
    lastSleepFullness: zod_1.z.number().int().min(0).max(10),
    starvationLevel: zod_1.z.number().int().nonnegative(),
    log: zod_1.z.array(zod_1.z.string()),
    systemNote: zod_1.z.string(),
});
exports.GameStateV2Schema = zod_1.z.object({
    player: player_1.PlayerSchema,
    worldState: world_state_1.WorldStateSchema,
    currentLocationId: zod_1.z.string(),
    currentSceneId: zod_1.z.string(),
    activeQuestIds: zod_1.z.array(zod_1.z.string()),
    completedQuestIds: zod_1.z.array(zod_1.z.string()),
    log: zod_1.z.array(zod_1.z.string()),
    systemNote: zod_1.z.string(),
    isGameOver: zod_1.z.boolean(),
    gameOverReason: zod_1.z.string(),
    stageClear: zod_1.z.boolean(),
    turn: zod_1.z.number().int().nonnegative().optional(),
});
