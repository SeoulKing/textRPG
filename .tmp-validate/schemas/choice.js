"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChoiceDefinitionSchema = exports.ActionChoiceSchema = exports.StoryChoiceSchema = exports.RiskHintSchema = void 0;
const zod_1 = require("zod");
const condition_effect_1 = require("./condition-effect");
const condition_effect_2 = require("./condition-effect");
const action_1 = require("./action");
exports.RiskHintSchema = zod_1.z.enum(["low", "medium", "high"]);
exports.StoryChoiceSchema = zod_1.z.object({
    id: zod_1.z.string(),
    label: zod_1.z.string(),
    outcomeHint: zod_1.z.string(),
    serverActionHint: action_1.GameActionSchema,
    descriptionTag: zod_1.z.string().optional(),
    conditions: zod_1.z.array(condition_effect_1.ConditionSchema).optional(),
    effects: zod_1.z.array(condition_effect_2.EffectSchema).optional(),
    riskHint: exports.RiskHintSchema.optional(),
    hidden: zod_1.z.boolean().optional(),
    nextEventId: zod_1.z.string().optional(),
    nextSceneId: zod_1.z.string().optional(),
});
exports.ActionChoiceSchema = zod_1.z.object({
    id: zod_1.z.string(),
    label: zod_1.z.string(),
    outcomeHint: zod_1.z.string(),
    action: action_1.GameActionSchema,
});
exports.ChoiceDefinitionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    label: zod_1.z.string(),
    outcomeHint: zod_1.z.string(),
    descriptionTag: zod_1.z.string().optional(),
    conditions: zod_1.z.array(condition_effect_1.ConditionSchema).default([]),
    effects: zod_1.z.array(condition_effect_2.EffectSchema).default([]),
    riskHint: exports.RiskHintSchema.optional(),
    hidden: zod_1.z.boolean().default(false),
    nextEventId: zod_1.z.string().optional(),
    nextSceneId: zod_1.z.string().optional(),
});
