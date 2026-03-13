"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateSnapshotSchema = exports.MapEntrySchema = exports.StoryMaterialsSchema = exports.TemplateStoreSchema = exports.GameSessionSchema = exports.WorldInstanceSchema = void 0;
const zod_1 = require("zod");
const game_state_1 = require("./game-state");
const location_1 = require("./location");
const person_1 = require("./person");
const item_1 = require("./item");
const event_1 = require("./event");
const scene_1 = require("./scene");
const person_2 = require("./person");
const quest_1 = require("./quest");
const choice_1 = require("./choice");
exports.WorldInstanceSchema = zod_1.z.object({
    locationCards: zod_1.z.record(zod_1.z.string(), location_1.LocationCardSchema),
    personCards: zod_1.z.record(zod_1.z.string(), person_1.PersonCardSchema),
    itemCards: zod_1.z.record(zod_1.z.string(), item_1.ItemCardSchema),
    eventCards: zod_1.z.record(zod_1.z.string(), event_1.EventCardSchema),
    sceneCards: zod_1.z.record(zod_1.z.string(), scene_1.SceneCardSchema),
    protagonistCard: person_2.ProtagonistCardSchema.nullable(),
});
exports.GameSessionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.string(),
    updatedAt: zod_1.z.string(),
    state: game_state_1.GameStateSchema,
    world: exports.WorldInstanceSchema,
});
exports.TemplateStoreSchema = zod_1.z.object({
    locationCards: zod_1.z.record(zod_1.z.string(), location_1.LocationCardSchema),
    personCards: zod_1.z.record(zod_1.z.string(), person_1.PersonCardSchema),
    itemCards: zod_1.z.record(zod_1.z.string(), item_1.ItemCardSchema),
    eventCards: zod_1.z.record(zod_1.z.string(), event_1.EventCardSchema),
    sceneCards: zod_1.z.record(zod_1.z.string(), scene_1.SceneCardSchema),
    protagonistCard: person_2.ProtagonistCardSchema.nullable(),
});
exports.StoryMaterialsSchema = zod_1.z.object({
    locations: zod_1.z.array(location_1.LocationCardSchema),
    people: zod_1.z.array(person_1.PersonCardSchema),
    items: zod_1.z.array(item_1.ItemCardSchema),
    protagonist: person_2.ProtagonistCardSchema,
});
exports.MapEntrySchema = zod_1.z.object({
    locationId: zod_1.z.string(),
    isCurrent: zod_1.z.boolean(),
    isVisible: zod_1.z.boolean(),
    isKnown: zod_1.z.boolean(),
    isVisited: zod_1.z.boolean(),
    isAdjacent: zod_1.z.boolean(),
    isReachable: zod_1.z.boolean(),
    isControlled: zod_1.z.boolean(),
    reason: zod_1.z.string(),
});
exports.StateSnapshotSchema = zod_1.z.object({
    gameId: zod_1.z.string(),
    state: game_state_1.GameStateSchema,
    currentScene: scene_1.SceneCardSchema,
    visibleLocations: zod_1.z.array(location_1.LocationCardSchema),
    visiblePeople: zod_1.z.array(person_1.PersonCardSchema),
    inventoryCards: zod_1.z.array(item_1.ItemCardSchema),
    protagonist: person_2.ProtagonistCardSchema,
    storyMaterials: exports.StoryMaterialsSchema,
    quests: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        name: zod_1.z.string(),
        summary: zod_1.z.string(),
        status: quest_1.QuestStateSchema,
    })),
    skills: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        name: zod_1.z.string(),
        description: zod_1.z.string(),
    })),
    availableActions: zod_1.z.array(choice_1.ActionChoiceSchema),
    mapEntries: zod_1.z.array(exports.MapEntrySchema),
    latestEvent: event_1.EventCardSchema.nullable(),
});
