"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionDefinitionSchema = exports.ActionVisibilitySchema = exports.ActionTypeSchema = exports.GameActionSchema = void 0;
const zod_1 = require("zod");
const condition_effect_1 = require("./condition-effect");
const condition_effect_2 = require("./condition-effect");
exports.GameActionSchema = zod_1.z.discriminatedUnion("type", [
    zod_1.z.object({ type: zod_1.z.literal("travel"), targetId: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("use_item"), itemId: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("content_action"), actionId: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("content_choice"), choiceId: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("rest") }),
    zod_1.z.object({ type: zod_1.z.literal("cook") }),
    zod_1.z.object({ type: zod_1.z.literal("buy_meal") }),
    zod_1.z.object({ type: zod_1.z.literal("generate_event"), locationId: zod_1.z.string().optional() }),
]);
exports.ActionTypeSchema = zod_1.z.enum(["travel", "search", "rest", "use", "talk", "explore"]);
exports.ActionVisibilitySchema = zod_1.z.enum(["scene", "event"]);
exports.ActionDefinitionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    label: zod_1.z.string(),
    type: exports.ActionTypeSchema,
    outcomeHint: zod_1.z.string().default("Push the situation forward."),
    visibility: exports.ActionVisibilitySchema.default("scene"),
    locationIds: zod_1.z.array(zod_1.z.string()).default([]),
    conditions: zod_1.z.array(condition_effect_1.ConditionSchema).default([]),
    effects: zod_1.z.array(condition_effect_2.EffectSchema).default([]),
    nextEventId: zod_1.z.string().optional(),
    nextSceneId: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string()).default([]),
    riskHint: zod_1.z.enum(["low", "medium", "high"]).optional(),
});
