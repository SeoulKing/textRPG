"use strict";
/**
 * Central content registry and static validation helpers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.worldRegistry = exports.baseSkills = exports.questDefinitions = exports.sceneDefinitions = exports.eventDefinitions = exports.choiceDefinitions = exports.actionDefinitions = exports.baseLocations = exports.basePeople = exports.baseItems = void 0;
exports.validateContent = validateContent;
var items_1 = require("./items");
Object.defineProperty(exports, "baseItems", { enumerable: true, get: function () { return items_1.baseItems; } });
var people_1 = require("./people");
Object.defineProperty(exports, "basePeople", { enumerable: true, get: function () { return people_1.basePeople; } });
var locations_1 = require("./locations");
Object.defineProperty(exports, "baseLocations", { enumerable: true, get: function () { return locations_1.baseLocations; } });
var actions_1 = require("./actions");
Object.defineProperty(exports, "actionDefinitions", { enumerable: true, get: function () { return actions_1.actionDefinitions; } });
var choices_1 = require("./choices");
Object.defineProperty(exports, "choiceDefinitions", { enumerable: true, get: function () { return choices_1.choiceDefinitions; } });
var events_1 = require("./events");
Object.defineProperty(exports, "eventDefinitions", { enumerable: true, get: function () { return events_1.eventDefinitions; } });
var scenes_1 = require("./scenes");
Object.defineProperty(exports, "sceneDefinitions", { enumerable: true, get: function () { return scenes_1.sceneDefinitions; } });
var quest_definitions_1 = require("../quest-definitions");
Object.defineProperty(exports, "questDefinitions", { enumerable: true, get: function () { return quest_definitions_1.questDefinitions; } });
var base_data_1 = require("../base-data");
Object.defineProperty(exports, "baseSkills", { enumerable: true, get: function () { return base_data_1.baseSkills; } });
const items_2 = require("./items");
const people_2 = require("./people");
const locations_2 = require("./locations");
const actions_2 = require("./actions");
const choices_2 = require("./choices");
const events_2 = require("./events");
const scenes_2 = require("./scenes");
const quest_definitions_2 = require("../quest-definitions");
const base_data_2 = require("../base-data");
function asRecord(entries) {
    return Object.fromEntries(entries.map((entry) => [entry.id, entry]));
}
exports.worldRegistry = {
    items: items_2.baseItems,
    people: people_2.basePeople,
    locations: locations_2.baseLocations,
    quests: asRecord(quest_definitions_2.questDefinitions),
    skills: base_data_2.baseSkills,
    actions: asRecord(actions_2.actionDefinitions),
    choices: asRecord(choices_2.choiceDefinitions),
    events: asRecord(events_2.eventDefinitions),
    scenes: asRecord(scenes_2.sceneDefinitions),
};
function assertKnownLocation(id, source) {
    if (!exports.worldRegistry.locations[id]) {
        throw new Error(`${source} references unknown location '${id}'.`);
    }
}
function assertKnownChoice(id, source) {
    if (!exports.worldRegistry.choices[id]) {
        throw new Error(`${source} references unknown choice '${id}'.`);
    }
}
function assertKnownEvent(id, source) {
    if (!exports.worldRegistry.events[id]) {
        throw new Error(`${source} references unknown event '${id}'.`);
    }
}
function assertKnownScene(id, source) {
    if (!exports.worldRegistry.scenes[id]) {
        throw new Error(`${source} references unknown scene '${id}'.`);
    }
}
function assertKnownQuest(id, source) {
    if (!exports.worldRegistry.quests[id]) {
        throw new Error(`${source} references unknown quest '${id}'.`);
    }
}
function validateCondition(condition, source) {
    switch (condition.type) {
        case "has_item":
            if (!exports.worldRegistry.items[condition.itemId])
                throw new Error(`${source} references unknown item '${condition.itemId}'.`);
            break;
        case "location":
        case "location_visited":
            assertKnownLocation(condition.locationId, source);
            break;
        case "quest_state":
            assertKnownQuest(condition.questId, source);
            break;
        default:
            break;
    }
}
function validateEffect(effect, source) {
    switch (effect.type) {
        case "add_item":
        case "remove_item":
            if (!exports.worldRegistry.items[effect.itemId])
                throw new Error(`${source} references unknown item '${effect.itemId}'.`);
            break;
        case "travel":
            assertKnownLocation(effect.locationId, source);
            break;
        case "start_quest":
        case "complete_quest":
            assertKnownQuest(effect.questId, source);
            break;
        case "set_scene":
            assertKnownScene(effect.sceneId, source);
            break;
        default:
            break;
    }
}
function validateAction(action) {
    for (const locationId of action.locationIds) {
        assertKnownLocation(locationId, `action:${action.id}`);
    }
    if (action.nextEventId)
        assertKnownEvent(action.nextEventId, `action:${action.id}`);
    if (action.nextSceneId)
        assertKnownScene(action.nextSceneId, `action:${action.id}`);
    action.conditions.forEach((condition) => validateCondition(condition, `action:${action.id}`));
    action.effects.forEach((effect) => validateEffect(effect, `action:${action.id}`));
}
function validateChoice(choice) {
    if (choice.nextEventId)
        assertKnownEvent(choice.nextEventId, `choice:${choice.id}`);
    if (choice.nextSceneId)
        assertKnownScene(choice.nextSceneId, `choice:${choice.id}`);
    choice.conditions.forEach((condition) => validateCondition(condition, `choice:${choice.id}`));
    choice.effects.forEach((effect) => validateEffect(effect, `choice:${choice.id}`));
}
function validateContent() {
    for (const location of Object.values(exports.worldRegistry.locations)) {
        location.neighbors.forEach((neighborId) => assertKnownLocation(neighborId, `location:${location.id}`));
        Object.keys(location.links).forEach((neighborId) => assertKnownLocation(neighborId, `location:${location.id}`));
        location.availableActionIds.forEach((actionId) => {
            if (!exports.worldRegistry.actions[actionId]) {
                throw new Error(`location:${location.id} references unknown action '${actionId}'.`);
            }
        });
        location.eventIds.forEach((eventId) => assertKnownEvent(eventId, `location:${location.id}`));
        location.obtainableItemIds.forEach((itemId) => {
            if (!exports.worldRegistry.items[itemId]) {
                throw new Error(`location:${location.id} references unknown item '${itemId}'.`);
            }
        });
        location.residentIds.forEach((personId) => {
            if (!exports.worldRegistry.people[personId]) {
                throw new Error(`location:${location.id} references unknown person '${personId}'.`);
            }
        });
    }
    Object.values(exports.worldRegistry.actions).forEach(validateAction);
    Object.values(exports.worldRegistry.choices).forEach(validateChoice);
    Object.values(exports.worldRegistry.events).forEach((event) => {
        assertKnownLocation(event.locationId, `event:${event.id}`);
        event.choiceIds.forEach((choiceId) => assertKnownChoice(choiceId, `event:${event.id}`));
        event.triggerConditions.forEach((condition) => validateCondition(condition, `event:${event.id}`));
    });
    Object.values(exports.worldRegistry.scenes).forEach((scene) => {
        assertKnownLocation(scene.locationId, `scene:${scene.id}`);
        scene.choiceIds.forEach((choiceId) => assertKnownChoice(choiceId, `scene:${scene.id}`));
        scene.conditions.forEach((condition) => validateCondition(condition, `scene:${scene.id}`));
    });
    return exports.worldRegistry;
}
