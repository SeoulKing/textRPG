"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SceneCardSchema = exports.SceneDefinitionSchema = void 0;
const zod_1 = require("zod");
const condition_effect_1 = require("./condition-effect");
const choice_1 = require("./choice");
exports.SceneDefinitionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    locationId: zod_1.z.string(),
    title: zod_1.z.string(),
    paragraphs: zod_1.z.array(zod_1.z.string()).min(1),
    choiceIds: zod_1.z.array(zod_1.z.string()).default([]),
    conditions: zod_1.z.array(condition_effect_1.ConditionSchema).default([]),
});
exports.SceneCardSchema = zod_1.z.object({
    id: zod_1.z.string(),
    locationId: zod_1.z.string(),
    title: zod_1.z.string(),
    paragraphs: zod_1.z.array(zod_1.z.string()).min(1),
    choices: zod_1.z.array(choice_1.StoryChoiceSchema),
    materialIds: zod_1.z.object({
        locationIds: zod_1.z.array(zod_1.z.string()),
        personIds: zod_1.z.array(zod_1.z.string()),
        itemIds: zod_1.z.array(zod_1.z.string()),
    }),
    source: zod_1.z.enum(["template", "llm"]),
    generatedAt: zod_1.z.string(),
});
