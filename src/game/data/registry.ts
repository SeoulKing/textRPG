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
import type { ActionDefinition, ChoiceDefinition, Condition, ContentRegistry, Effect, Objective, QuestDefinition, QuestReward } from "../schemas";

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

function stockNodeEntries(registry: ContentRegistry) {
  return Object.values(registry.locations).flatMap((location) =>
    location.stockNodes.map((node) => ({ locationId: location.id, node })),
  );
}

function findStockNode(registry: ContentRegistry, nodeId: string) {
  return stockNodeEntries(registry).find((entry) => entry.node.id === nodeId) ?? null;
}

function assertKnownStockNodeInLocation(registry: ContentRegistry, locationId: string, nodeId: string, source: string) {
  const entry = findStockNode(registry, nodeId);
  if (!entry || entry.locationId !== locationId) {
    throw new Error(`${source} references unknown stock node '${nodeId}' in location '${locationId}'.`);
  }
}

function assertKnownLocation(registry: ContentRegistry, id: string, source: string) {
  if (!registry.locations[id]) {
    throw new Error(`${source} references unknown location '${id}'.`);
  }
}

function assertKnownChoice(registry: ContentRegistry, id: string, source: string) {
  if (!registry.choices[id]) {
    throw new Error(`${source} references unknown choice '${id}'.`);
  }
}

function assertKnownEvent(registry: ContentRegistry, id: string, source: string) {
  if (!registry.events[id]) {
    throw new Error(`${source} references unknown event '${id}'.`);
  }
}

function assertKnownScene(registry: ContentRegistry, id: string, source: string) {
  if (!registry.scenes[id]) {
    throw new Error(`${source} references unknown scene '${id}'.`);
  }
}

function assertKnownQuest(registry: ContentRegistry, id: string, source: string) {
  if (!registry.quests[id]) {
    throw new Error(`${source} references unknown quest '${id}'.`);
  }
}

function assertKnownStockNode(registry: ContentRegistry, id: string, source: string) {
  if (!findStockNode(registry, id)) {
    throw new Error(`${source} references unknown stock node '${id}'.`);
  }
}

function assertKnownStockItem(registry: ContentRegistry, locationId: string, nodeId: string, itemId: string, source: string) {
  const location = registry.locations[locationId];
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

function validateCondition(registry: ContentRegistry, condition: Condition, source: string) {
  switch (condition.type) {
    case "has_item":
      if (!registry.items[condition.itemId]) throw new Error(`${source} references unknown item '${condition.itemId}'.`);
      break;
    case "location":
    case "location_visited":
      assertKnownLocation(registry, condition.locationId, source);
      break;
    case "quest_state":
      assertKnownQuest(registry, condition.questId, source);
      break;
    case "stock_item_gte":
    case "stock_item_lt":
      assertKnownStockItem(registry, condition.locationId, condition.nodeId, condition.itemId, source);
      break;
    case "stock_money_gte":
    case "stock_money_lt":
      assertKnownLocation(registry, condition.locationId, source);
      assertKnownStockNodeInLocation(registry, condition.locationId, condition.nodeId, source);
      break;
    case "stock_node_discovered":
    case "active_stock_node":
    case "active_stock_node_not":
      assertKnownStockNode(registry, condition.nodeId, source);
      break;
    default:
      break;
  }
}

function validateEffect(registry: ContentRegistry, effect: Effect, source: string) {
  switch (effect.type) {
    case "add_item":
    case "remove_item":
      if (!registry.items[effect.itemId]) throw new Error(`${source} references unknown item '${effect.itemId}'.`);
      break;
    case "travel":
      assertKnownLocation(registry, effect.locationId, source);
      break;
    case "start_quest":
    case "complete_quest":
      assertKnownQuest(registry, effect.questId, source);
      break;
    case "set_scene":
      assertKnownScene(registry, effect.sceneId, source);
      break;
    case "discover_stock_node":
    case "focus_stock_node":
      assertKnownStockNode(registry, effect.nodeId, source);
      break;
    case "collect_stock_item":
    case "collect_stock_item_all":
      assertKnownStockItem(registry, effect.locationId, effect.nodeId, effect.itemId, source);
      break;
    case "collect_stock_money":
    case "collect_stock_money_all":
      assertKnownLocation(registry, effect.locationId, source);
      assertKnownStockNodeInLocation(registry, effect.locationId, effect.nodeId, source);
      break;
    default:
      break;
  }
}

function validateAction(registry: ContentRegistry, action: ActionDefinition) {
  for (const locationId of action.locationIds) {
    assertKnownLocation(registry, locationId, `action:${action.id}`);
  }
  if (action.nextEventId) assertKnownEvent(registry, action.nextEventId, `action:${action.id}`);
  if (action.nextSceneId) assertKnownScene(registry, action.nextSceneId, `action:${action.id}`);
  action.conditions.forEach((condition) => validateCondition(registry, condition, `action:${action.id}`));
  action.effects.forEach((effect) => validateEffect(registry, effect, `action:${action.id}`));
  action.failureEffects.forEach((effect) => validateEffect(registry, effect, `action:${action.id}:failure`));
}

function validateChoice(registry: ContentRegistry, choice: ChoiceDefinition) {
  if (choice.nextEventId) assertKnownEvent(registry, choice.nextEventId, `choice:${choice.id}`);
  if (choice.nextSceneId) assertKnownScene(registry, choice.nextSceneId, `choice:${choice.id}`);
  choice.conditions.forEach((condition) => validateCondition(registry, condition, `choice:${choice.id}`));
  choice.effects.forEach((effect) => validateEffect(registry, effect, `choice:${choice.id}`));
  (choice.failureEffects ?? []).forEach((effect) => validateEffect(registry, effect, `choice:${choice.id}:failure`));
}

export function validateRegistry(registry: ContentRegistry) {
  const seenStockNodeIds = new Set<string>();
  const globalInteractionIds = new Set<string>();

  for (const location of Object.values(registry.locations)) {
    location.neighbors.forEach((neighborId) => assertKnownLocation(registry, neighborId, `location:${location.id}`));
    Object.keys(location.links).forEach((neighborId) => assertKnownLocation(registry, neighborId, `location:${location.id}`));
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
      validateAction(registry, action);
    });
    location.eventIds.forEach((eventId) => assertKnownEvent(registry, eventId, `location:${location.id}`));
    location.obtainableItemIds.forEach((itemId) => {
      if (!registry.items[itemId]) {
        throw new Error(`location:${location.id} references unknown item '${itemId}'.`);
      }
    });
    location.residentIds.forEach((personId) => {
      if (!registry.people[personId]) {
        throw new Error(`location:${location.id} references unknown person '${personId}'.`);
      }
    });
    location.stockNodes.forEach((node) => {
      if (seenStockNodeIds.has(node.id)) {
        throw new Error(`stock node '${node.id}' must be globally unique.`);
      }
      seenStockNodeIds.add(node.id);
      node.items.forEach((item) => {
        if (!registry.items[item.itemId]) {
          throw new Error(`location:${location.id} stock node '${node.id}' references unknown item '${item.itemId}'.`);
        }
      });
    });
  }

  Object.values(registry.actions).forEach((action) => validateAction(registry, action));
  Object.values(registry.choices).forEach((choice) => validateChoice(registry, choice));
  Object.values(registry.quests).forEach((questDefinition) => {
    const quest = questDefinition as QuestDefinition;
    quest.objectives.forEach((objective: Objective) => {
      switch (objective.type) {
        case "obtain_item":
          if (!registry.items[objective.itemId]) {
            throw new Error(`quest:${quest.id} objective references unknown item '${objective.itemId}'.`);
          }
          break;
        case "return_to_npc":
          if (!registry.people[objective.npcId]) {
            throw new Error(`quest:${quest.id} objective references unknown npc '${objective.npcId}'.`);
          }
          break;
        case "reach_location":
          assertKnownLocation(registry, objective.locationId, `quest:${quest.id}`);
          break;
        default:
          break;
      }
    });
    quest.rewards.forEach((reward: QuestReward) => {
      if (reward.type === "add_item" && !registry.items[reward.itemId]) {
        throw new Error(`quest:${quest.id} reward references unknown item '${reward.itemId}'.`);
      }
    });
    quest.prerequisites.forEach((condition: Condition) => validateCondition(registry, condition, `quest:${quest.id}`));
    quest.relatedNpcIds.forEach((npcId: string) => {
      if (!registry.people[npcId]) {
        throw new Error(`quest:${quest.id} references unknown npc '${npcId}'.`);
      }
    });
    quest.relatedLocationIds.forEach((locationId: string) => assertKnownLocation(registry, locationId, `quest:${quest.id}`));
  });

  Object.values(registry.events).forEach((event) => {
    assertKnownLocation(registry, event.locationId, `event:${event.id}`);
    assertKnownScene(registry, event.startSceneId, `event:${event.id}`);
    event.sceneIds.forEach((sceneId) => assertKnownScene(registry, sceneId, `event:${event.id}`));
    event.choiceIds.forEach((choiceId) => assertKnownChoice(registry, choiceId, `event:${event.id}`));
    event.triggerConditions.forEach((condition) => validateCondition(registry, condition, `event:${event.id}`));
  });

  Object.values(registry.scenes).forEach((scene) => {
    assertKnownLocation(registry, scene.locationId, `scene:${scene.id}`);
    if (scene.eventId) {
      assertKnownEvent(registry, scene.eventId, `scene:${scene.id}`);
    }
    scene.choiceIds.forEach((choiceId) => assertKnownChoice(registry, choiceId, `scene:${scene.id}`));
    scene.conditions.forEach((condition) => validateCondition(registry, condition, `scene:${scene.id}`));
  });

  Object.values(registry.events).forEach((event) => {
    const eventSceneIds = new Set(event.sceneIds);
    eventSceneIds.add(event.startSceneId);
    eventSceneIds.forEach((sceneId) => {
      const scene = registry.scenes[sceneId];
      if (scene?.eventId !== event.id) {
        throw new Error(`event:${event.id} scene '${sceneId}' must declare eventId '${event.id}'.`);
      }
    });
  });

  return registry;
}

export function validateContent() {
  return validateRegistry(worldRegistry);
}
