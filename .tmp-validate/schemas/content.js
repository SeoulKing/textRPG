"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentRegistrySchema = exports.LocationDefinitionSchema = exports.LinkDefinitionSchema = void 0;
const zod_1 = require("zod");
const base_1 = require("./base");
const action_1 = require("./action");
const choice_1 = require("./choice");
const event_1 = require("./event");
const scene_1 = require("./scene");
exports.LinkDefinitionSchema = zod_1.z.object({
    note: zod_1.z.string(),
    requiredFlag: zod_1.z.string().optional(),
    blockedReason: zod_1.z.string().optional(),
});
exports.LocationDefinitionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    risk: base_1.RiskSchema,
    imagePath: zod_1.z.string().nullable(),
    summary: zod_1.z.string(),
    tags: zod_1.z.array(zod_1.z.string()),
    traits: zod_1.z.array(zod_1.z.string()),
    obtainableItemIds: zod_1.z.array(zod_1.z.string()),
    residentIds: zod_1.z.array(zod_1.z.string()),
    neighbors: zod_1.z.array(zod_1.z.string()),
    availableActionIds: zod_1.z.array(zod_1.z.string()).default([]),
    eventIds: zod_1.z.array(zod_1.z.string()).default([]),
    links: zod_1.z.record(zod_1.z.string(), exports.LinkDefinitionSchema),
});
exports.ContentRegistrySchema = zod_1.z.object({
    locations: zod_1.z.record(zod_1.z.string(), exports.LocationDefinitionSchema),
    items: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    people: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    quests: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    skills: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    actions: zod_1.z.record(zod_1.z.string(), action_1.ActionDefinitionSchema),
    choices: zod_1.z.record(zod_1.z.string(), choice_1.ChoiceDefinitionSchema),
    events: zod_1.z.record(zod_1.z.string(), event_1.EventDefinitionSchema),
    scenes: zod_1.z.record(zod_1.z.string(), scene_1.SceneDefinitionSchema),
});
