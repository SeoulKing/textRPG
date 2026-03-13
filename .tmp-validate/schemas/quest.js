"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuestStateSchema = exports.QuestDefinitionSchema = exports.QuestTypeSchema = exports.QuestRewardSchema = exports.ObjectiveSchema = void 0;
const zod_1 = require("zod");
const condition_effect_1 = require("./condition-effect");
exports.ObjectiveSchema = zod_1.z.discriminatedUnion("type", [
    zod_1.z.object({ type: zod_1.z.literal("obtain_item"), itemId: zod_1.z.string(), amount: zod_1.z.number().int().min(1).default(1) }),
    zod_1.z.object({ type: zod_1.z.literal("return_to_npc"), npcId: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("reach_location"), locationId: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("flag"), flag: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("daily_flag"), flag: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("stage_clear") }),
]);
exports.QuestRewardSchema = zod_1.z.discriminatedUnion("type", [
    zod_1.z.object({ type: zod_1.z.literal("money"), amount: zod_1.z.number().int() }),
    zod_1.z.object({ type: zod_1.z.literal("set_flag"), flag: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("add_item"), itemId: zod_1.z.string(), amount: zod_1.z.number().int().min(1).default(1) }),
]);
exports.QuestTypeSchema = zod_1.z.enum(["main", "side", "discovery"]);
exports.QuestDefinitionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    title: zod_1.z.string(),
    description: zod_1.z.string(),
    type: exports.QuestTypeSchema.default("side"),
    objectives: zod_1.z.array(exports.ObjectiveSchema),
    rewards: zod_1.z.array(exports.QuestRewardSchema).default([]),
    prerequisites: zod_1.z.array(condition_effect_1.ConditionSchema).default([]),
    relatedNpcIds: zod_1.z.array(zod_1.z.string()).default([]),
    relatedLocationIds: zod_1.z.array(zod_1.z.string()).default([]),
});
exports.QuestStateSchema = zod_1.z.enum(["inactive", "active", "completed"]);
