/**
 * Central content registry and static validation helpers.
 */

export { baseItems } from "./items";
export { basePeople } from "./people";
export { baseLocations, type BaseLocation } from "./locations";
export { actionDefinitions } from "./actions";
export { choiceDefinitions } from "./choices";
export { eventDefinitions } from "./events";
export { sceneDefinitions } from "./scenes";
export { questDefinitions } from "../quest-definitions";
export { baseSkills } from "../base-data";

import { baseItems } from "./items";
import { basePeople } from "./people";
import { baseLocations } from "./locations";
import { actionDefinitions } from "./actions";
import { choiceDefinitions } from "./choices";
import { eventDefinitions } from "./events";
import { sceneDefinitions } from "./scenes";
import { questDefinitions } from "../quest-definitions";
import { baseSkills } from "../base-data";
import type { ActionDefinition, ChoiceDefinition, Condition, ContentRegistry, Effect } from "../schemas";

function asRecord<T extends { id: string }>(entries: T[]) {
  return Object.fromEntries(entries.map((entry) => [entry.id, entry])) as Record<string, T>;
}

export const worldRegistry: ContentRegistry = {
  items: baseItems,
  people: basePeople,
  locations: baseLocations,
  quests: asRecord(questDefinitions),
  skills: baseSkills,
  actions: asRecord(actionDefinitions),
  choices: asRecord(choiceDefinitions),
  events: asRecord(eventDefinitions),
  scenes: asRecord(sceneDefinitions),
};

export type ItemId = keyof typeof baseItems;
export type PersonId = keyof typeof basePeople;
export type LocationId = keyof typeof baseLocations;

function assertKnownLocation(id: string, source: string) {
  if (!worldRegistry.locations[id]) {
    throw new Error(`${source} references unknown location '${id}'.`);
  }
}

function assertKnownChoice(id: string, source: string) {
  if (!worldRegistry.choices[id]) {
    throw new Error(`${source} references unknown choice '${id}'.`);
  }
}

function assertKnownEvent(id: string, source: string) {
  if (!worldRegistry.events[id]) {
    throw new Error(`${source} references unknown event '${id}'.`);
  }
}

function assertKnownScene(id: string, source: string) {
  if (!worldRegistry.scenes[id]) {
    throw new Error(`${source} references unknown scene '${id}'.`);
  }
}

function assertKnownQuest(id: string, source: string) {
  if (!worldRegistry.quests[id]) {
    throw new Error(`${source} references unknown quest '${id}'.`);
  }
}

function validateCondition(condition: Condition, source: string) {
  switch (condition.type) {
    case "has_item":
      if (!worldRegistry.items[condition.itemId]) throw new Error(`${source} references unknown item '${condition.itemId}'.`);
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

function validateEffect(effect: Effect, source: string) {
  switch (effect.type) {
    case "add_item":
    case "remove_item":
      if (!worldRegistry.items[effect.itemId]) throw new Error(`${source} references unknown item '${effect.itemId}'.`);
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

function validateAction(action: ActionDefinition) {
  for (const locationId of action.locationIds) {
    assertKnownLocation(locationId, `action:${action.id}`);
  }
  if (action.nextEventId) assertKnownEvent(action.nextEventId, `action:${action.id}`);
  if (action.nextSceneId) assertKnownScene(action.nextSceneId, `action:${action.id}`);
  action.conditions.forEach((condition) => validateCondition(condition, `action:${action.id}`));
  action.effects.forEach((effect) => validateEffect(effect, `action:${action.id}`));
}

function validateChoice(choice: ChoiceDefinition) {
  if (choice.nextEventId) assertKnownEvent(choice.nextEventId, `choice:${choice.id}`);
  if (choice.nextSceneId) assertKnownScene(choice.nextSceneId, `choice:${choice.id}`);
  choice.conditions.forEach((condition) => validateCondition(condition, `choice:${choice.id}`));
  choice.effects.forEach((effect) => validateEffect(effect, `choice:${choice.id}`));
}

export function validateContent() {
  for (const location of Object.values(worldRegistry.locations)) {
    location.neighbors.forEach((neighborId) => assertKnownLocation(neighborId, `location:${location.id}`));
    Object.keys(location.links).forEach((neighborId) => assertKnownLocation(neighborId, `location:${location.id}`));
    location.availableActionIds.forEach((actionId) => {
      if (!worldRegistry.actions[actionId]) {
        throw new Error(`location:${location.id} references unknown action '${actionId}'.`);
      }
    });
    location.eventIds.forEach((eventId) => assertKnownEvent(eventId, `location:${location.id}`));
    location.obtainableItemIds.forEach((itemId) => {
      if (!worldRegistry.items[itemId]) {
        throw new Error(`location:${location.id} references unknown item '${itemId}'.`);
      }
    });
    location.residentIds.forEach((personId) => {
      if (!worldRegistry.people[personId]) {
        throw new Error(`location:${location.id} references unknown person '${personId}'.`);
      }
    });
  }

  Object.values(worldRegistry.actions).forEach(validateAction);
  Object.values(worldRegistry.choices).forEach(validateChoice);

  Object.values(worldRegistry.events).forEach((event) => {
    assertKnownLocation(event.locationId, `event:${event.id}`);
    event.choiceIds.forEach((choiceId) => assertKnownChoice(choiceId, `event:${event.id}`));
    event.triggerConditions.forEach((condition) => validateCondition(condition, `event:${event.id}`));
  });

  Object.values(worldRegistry.scenes).forEach((scene) => {
    assertKnownLocation(scene.locationId, `scene:${scene.id}`);
    scene.choiceIds.forEach((choiceId) => assertKnownChoice(choiceId, `scene:${scene.id}`));
    scene.conditions.forEach((condition) => validateCondition(condition, `scene:${scene.id}`));
  });

  return worldRegistry;
}
