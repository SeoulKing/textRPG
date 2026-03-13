"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventCardSchema = exports.EventDefinitionSchema = void 0;
const zod_1 = require("zod");
const condition_effect_1 = require("./condition-effect");
const choice_1 = require("./choice");
exports.EventDefinitionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    locationId: zod_1.z.string(),
    title: zod_1.z.string(),
    summary: zod_1.z.string(),
    triggerConditions: zod_1.z.array(condition_effect_1.ConditionSchema).default([]),
    choiceIds: zod_1.z.array(zod_1.z.string()).default([]),
    once: zod_1.z.boolean().default(false),
    priority: zod_1.z.number().int().default(0),
});
exports.EventCardSchema = zod_1.z.object({
    id: zod_1.z.string(),
    locationId: zod_1.z.string(),
    title: zod_1.z.string(),
    summary: zod_1.z.string(),
    trigger: zod_1.z.string(),
    choices: zod_1.z.array(choice_1.StoryChoiceSchema),
    rewards: zod_1.z.array(zod_1.z.string()),
    flags: zod_1.z.array(zod_1.z.string()),
    source: zod_1.z.enum(["template", "llm"]),
    generatedAt: zod_1.z.string(),
    triggerConditions: zod_1.z.array(condition_effect_1.ConditionSchema).optional(),
    choiceIds: zod_1.z.array(zod_1.z.string()).optional(),
    once: zod_1.z.boolean().optional(),
    priority: zod_1.z.number().int().optional(),
});
