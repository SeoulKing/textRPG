/**
 * Central content registry and static validation helpers.
 */

export { baseItems } from "./items";
export { basePeople } from "./people";
export { actionDefinitions, baseLocations, type BaseLocation } from "./locations";
export { choiceDefinitions } from "./choices";
export { eventDefinitions } from "./events";
export { sceneDefinitions } from "./scenes";
export { questDefinitions } from "../quest-definitions";
export { baseSkills } from "../base-data";

import { baseItems } from "./items";
import { basePeople } from "./people";
import { actionDefinitions, baseLocations } from "./locations";
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

function stockNodeEntries() {
  return Object.values(worldRegistry.locations).flatMap((location) =>
    location.stockNodes.map((node) => ({ locationId: location.id, node })),
  );
}

function findStockNode(nodeId: string) {
  return stockNodeEntries().find((entry) => entry.node.id === nodeId) ?? null;
}

function assertKnownStockNodeInLocation(locationId: string, nodeId: string, source: string) {
  const entry = findStockNode(nodeId);
  if (!entry || entry.locationId !== locationId) {
    throw new Error(`${source} references unknown stock node '${nodeId}' in location '${locationId}'.`);
  }
}

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

function assertKnownStockNode(id: string, source: string) {
  if (!findStockNode(id)) {
    throw new Error(`${source} references unknown stock node '${id}'.`);
  }
}

function assertKnownStockItem(locationId: string, nodeId: string, itemId: string, source: string) {
  const location = worldRegistry.locations[locationId];
  if (!location) {
    throw new Error(`${source} references unknown location '${locationId}'.`);
  }
  const node = location.stockNodes.find((entry) => entry.id === nodeId);
  if (!node) {
    throw new Error(`${source} references unknown stock node '${nodeId}' in location '${locationId}'.`);
  }
  if (!node.items.some((entry) => entry.itemId === itemId)) {
    throw new Error(`${source} references unknown stock item '${itemId}' in node '${nodeId}'.`);
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
    case "stock_item_gte":
    case "stock_item_lt":
      assertKnownStockItem(condition.locationId, condition.nodeId, condition.itemId, source);
      break;
    case "stock_money_gte":
    case "stock_money_lt":
      assertKnownLocation(condition.locationId, source);
      assertKnownStockNodeInLocation(condition.locationId, condition.nodeId, source);
      break;
    case "stock_node_discovered":
    case "active_stock_node":
    case "active_stock_node_not":
      assertKnownStockNode(condition.nodeId, source);
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
    case "discover_stock_node":
    case "focus_stock_node":
      assertKnownStockNode(effect.nodeId, source);
      break;
    case "collect_stock_item":
    case "collect_stock_item_all":
      assertKnownStockItem(effect.locationId, effect.nodeId, effect.itemId, source);
      break;
    case "collect_stock_money":
    case "collect_stock_money_all":
      assertKnownLocation(effect.locationId, source);
      assertKnownStockNodeInLocation(effect.locationId, effect.nodeId, source);
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
  action.failureEffects.forEach((effect) => validateEffect(effect, `action:${action.id}:failure`));
}

function validateChoice(choice: ChoiceDefinition) {
  if (choice.nextEventId) assertKnownEvent(choice.nextEventId, `choice:${choice.id}`);
  if (choice.nextSceneId) assertKnownScene(choice.nextSceneId, `choice:${choice.id}`);
  choice.conditions.forEach((condition) => validateCondition(condition, `choice:${choice.id}`));
  choice.effects.forEach((effect) => validateEffect(effect, `choice:${choice.id}`));
}

export function validateContent() {
  const seenStockNodeIds = new Set<string>();
  const globalInteractionIds = new Set<string>();

  for (const location of Object.values(worldRegistry.locations)) {
    location.neighbors.forEach((neighborId) => assertKnownLocation(neighborId, `location:${location.id}`));
    Object.keys(location.links).forEach((neighborId) => assertKnownLocation(neighborId, `location:${location.id}`));
    const seenIds = new Set<string>();
    location.interactionChoices.forEach((action) => {
      if (seenIds.has(action.id)) {
        throw new Error(`location:${location.id} duplicate interaction choice id '${action.id}'.`);
      }
      seenIds.add(action.id);
      if (globalInteractionIds.has(action.id)) {
        throw new Error(`interaction choice id '${action.id}' is defined on more than one location.`);
      }
      globalInteractionIds.add(action.id);
      if (!action.locationIds.includes(location.id)) {
        throw new Error(`location:${location.id} choice '${action.id}' must list this location in locationIds.`);
      }
      validateAction(action);
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
    location.stockNodes.forEach((node) => {
      if (seenStockNodeIds.has(node.id)) {
        throw new Error(`stock node '${node.id}' must be globally unique.`);
      }
      seenStockNodeIds.add(node.id);
      node.items.forEach((item) => {
        if (!worldRegistry.items[item.itemId]) {
          throw new Error(`location:${location.id} stock node '${node.id}' references unknown item '${item.itemId}'.`);
        }
      });
    });
  }

  Object.values(worldRegistry.actions).forEach(validateAction);
  Object.values(worldRegistry.choices).forEach(validateChoice);

  Object.values(worldRegistry.events).forEach((event) => {
    assertKnownLocation(event.locationId, `event:${event.id}`);
    assertKnownScene(event.startSceneId, `event:${event.id}`);
    event.sceneIds.forEach((sceneId) => assertKnownScene(sceneId, `event:${event.id}`));
    event.choiceIds.forEach((choiceId) => assertKnownChoice(choiceId, `event:${event.id}`));
    event.triggerConditions.forEach((condition) => validateCondition(condition, `event:${event.id}`));
  });

  Object.values(worldRegistry.scenes).forEach((scene) => {
    assertKnownLocation(scene.locationId, `scene:${scene.id}`);
    if (scene.eventId) {
      assertKnownEvent(scene.eventId, `scene:${scene.id}`);
    }
    scene.choiceIds.forEach((choiceId) => assertKnownChoice(choiceId, `scene:${scene.id}`));
    scene.conditions.forEach((condition) => validateCondition(condition, `scene:${scene.id}`));
  });

  Object.values(worldRegistry.events).forEach((event) => {
    const eventSceneIds = new Set(event.sceneIds);
    eventSceneIds.add(event.startSceneId);
    eventSceneIds.forEach((sceneId) => {
      const scene = worldRegistry.scenes[sceneId];
      if (scene?.eventId !== event.id) {
        throw new Error(`event:${event.id} scene '${sceneId}' must declare eventId '${event.id}'.`);
      }
    });
  });

  return worldRegistry;
}
