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
import {
  canonicalizeItemText,
  validateItemTextReferences,
} from "../item-text";
import {
  CRAFTING_MENU_SCENE_IDS,
  COOKING_MENU_SCENE_IDS,
  effectiveContentStudioDocument,
  loadStoredContentStudioDocument,
  parseContentStudioDocument,
  type ContentStudioDocument,
  type StudioRecipe,
} from "../content-studio";
import type {
  ActionDefinition,
  ChoiceDefinition,
  Condition,
  ContentRegistry,
  Effect,
  LocationDefinition,
  Objective,
  QuestDefinition,
  QuestReward,
  SceneDefinition,
} from "../schemas";

function asRecord<T extends { id: string }>(entries: T[]) {
  return Object.fromEntries(entries.map((entry) => [entry.id, entry])) as Record<string, T>;
}

const authoredWorldRegistry: ContentRegistry = {
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

function canonicalizeEffectItemText<T extends Effect>(
  effect: T,
  registry: ContentRegistry,
): T {
  if (effect.type === "log") {
    return {
      ...effect,
      message: canonicalizeItemText(effect.message, registry),
    } as T;
  }

  if (effect.type === "random_outcome") {
    return {
      ...effect,
      outcomes: effect.outcomes.map((outcome) => ({
        ...outcome,
        effects: outcome.effects.map((outcomeEffect) =>
          canonicalizeEffectItemText(outcomeEffect, registry),
        ),
      })),
    } as T;
  }

  return effect;
}

function canonicalizeActionItemText(
  action: ActionDefinition,
  registry: ContentRegistry,
): ActionDefinition {
  return {
    ...action,
    label: canonicalizeItemText(action.label, registry),
    outcomeHint: canonicalizeItemText(action.outcomeHint, registry),
    failureNote: action.failureNote
      ? canonicalizeItemText(action.failureNote, registry)
      : action.failureNote,
    systemNote: action.systemNote
      ? canonicalizeItemText(action.systemNote, registry)
      : action.systemNote,
    effects: action.effects.map((effect) =>
      canonicalizeEffectItemText(effect, registry),
    ),
    failureEffects: action.failureEffects.map((effect) =>
      canonicalizeEffectItemText(effect, registry),
    ),
  };
}

function canonicalizeChoiceItemText(
  choice: ChoiceDefinition,
  registry: ContentRegistry,
): ChoiceDefinition {
  return {
    ...choice,
    label: canonicalizeItemText(choice.label, registry),
    outcomeHint: canonicalizeItemText(choice.outcomeHint, registry),
    descriptionTag: choice.descriptionTag
      ? canonicalizeItemText(choice.descriptionTag, registry)
      : choice.descriptionTag,
    failureNote: choice.failureNote
      ? canonicalizeItemText(choice.failureNote, registry)
      : choice.failureNote,
    systemNote: choice.systemNote
      ? canonicalizeItemText(choice.systemNote, registry)
      : choice.systemNote,
    effects: choice.effects.map((effect) =>
      canonicalizeEffectItemText(effect, registry),
    ),
    failureEffects: choice.failureEffects.map((effect) =>
      canonicalizeEffectItemText(effect, registry),
    ),
  };
}

function canonicalizeAuthoredWorldRegistry(
  registry: ContentRegistry,
): ContentRegistry {
  return {
    ...registry,
    locations: Object.fromEntries(
      Object.entries(registry.locations).map(([locationId, location]) => [
        locationId,
        {
          ...location,
          interactionChoices: location.interactionChoices.map((action) =>
            canonicalizeActionItemText(action, registry),
          ),
        },
      ]),
    ),
    actions: Object.fromEntries(
      Object.entries(registry.actions).map(([actionId, action]) => [
        actionId,
        canonicalizeActionItemText(action, registry),
      ]),
    ),
    choices: Object.fromEntries(
      Object.entries(registry.choices).map(([choiceId, choice]) => [
        choiceId,
        canonicalizeChoiceItemText(choice, registry),
      ]),
    ),
    events: Object.fromEntries(
      Object.entries(registry.events).map(([eventId, event]) => [
        eventId,
        {
          ...event,
          title: canonicalizeItemText(event.title, registry),
          summary: canonicalizeItemText(event.summary, registry),
        },
      ]),
    ),
    scenes: Object.fromEntries(
      Object.entries(registry.scenes).map(([sceneId, scene]) => [
        sceneId,
        {
          ...scene,
          title: canonicalizeItemText(scene.title, registry),
          paragraphs: scene.paragraphs.map((paragraph) =>
            canonicalizeItemText(paragraph, registry),
          ),
        },
      ]),
    ),
  };
}

const builtInWorldRegistry = canonicalizeAuthoredWorldRegistry(
  authoredWorldRegistry,
);

function mergeMenuChoiceIds(
  existingIds: string[],
  recipes: StudioRecipe[],
  menu: StudioRecipe["menu"],
) {
  const allRecipeIds = new Set(recipes.map((recipe) => recipe.id));
  const enabledRecipeIds = recipes
    .filter((recipe) => recipe.enabled && recipe.menu === menu)
    .map((recipe) => recipe.id);
  const filtered = existingIds.filter((id) => !allRecipeIds.has(id));
  const leaveIndex = filtered.findIndex((id) => id.startsWith("leave_shelter_"));
  if (leaveIndex < 0) {
    return [...filtered, ...enabledRecipeIds];
  }
  return [
    ...filtered.slice(0, leaveIndex),
    ...enabledRecipeIds,
    ...filtered.slice(leaveIndex),
  ];
}

function compileStudioStories(
  document: ContentStudioDocument,
  locations: Record<string, LocationDefinition>,
  actions: Record<string, ActionDefinition>,
  choices: Record<string, ChoiceDefinition>,
  scenes: Record<string, SceneDefinition>,
) {
  document.stories.filter((story) => story.enabled).forEach((story) => {
    const location = locations[story.locationId];
    if (!location) {
      throw new Error(`story:${story.id} references unknown location '${story.locationId}'.`);
    }
    const firstScene = story.scenes[0];
    const entryAction: ActionDefinition = {
      id: `studio_story_${story.id}`,
      label: story.entryLabel,
      type: "talk",
      outcomeHint: story.entryHint,
      visibility: "scene",
      presentationMode: "when_conditions_met",
      locationIds: [story.locationId],
      conditions: story.conditions,
      effects: [],
      failureEffects: [],
      nextSceneId: firstScene.id,
      tags: ["content-studio", "story", ...story.tags],
      riskHint: "low",
    };

    actions[entryAction.id] = entryAction;
    locations[story.locationId] = {
      ...location,
      interactionChoices: [
        ...location.interactionChoices.filter((action) => action.id !== entryAction.id),
        entryAction,
      ],
    };

    story.scenes.forEach((scene) => {
      scene.choices.forEach((choice) => {
        choices[choice.id] = choice;
      });
      scenes[scene.id] = {
        id: scene.id,
        eventId: scene.eventId,
        locationId: story.locationId,
        title: scene.title,
        paragraphs: scene.paragraphs,
        tags: scene.tags,
        choiceIds: scene.choices.map((choice) => choice.id),
        conditions: scene.conditions,
        introFlag: scene.introFlag,
        suppressLocationInteractions: scene.suppressLocationInteractions,
      };
    });
  });
}

export function getEffectiveContentStudioDocument(
  stored = loadStoredContentStudioDocument(),
) {
  return effectiveContentStudioDocument(stored, baseItems, choiceDefinitions);
}

function repairQuestionMarkText(
  stored: unknown,
  baseline: unknown,
): { value: unknown; repairedFields: number } {
  if (typeof stored === "string" && typeof baseline === "string") {
    const baselineHasKorean = /[가-힣]/.test(baseline);
    const storedLostKorean = stored.includes("?") && !/[가-힣]/.test(stored);
    return baselineHasKorean && storedLostKorean
      ? { value: baseline, repairedFields: 1 }
      : { value: stored, repairedFields: 0 };
  }

  if (Array.isArray(stored) && Array.isArray(baseline)) {
    let repairedFields = 0;
    const value = stored.map((entry, index) => {
      const repaired = repairQuestionMarkText(entry, baseline[index]);
      repairedFields += repaired.repairedFields;
      return repaired.value;
    });
    return { value, repairedFields };
  }

  if (
    stored &&
    baseline &&
    typeof stored === "object" &&
    typeof baseline === "object" &&
    !Array.isArray(stored) &&
    !Array.isArray(baseline)
  ) {
    let repairedFields = 0;
    const baselineRecord = baseline as Record<string, unknown>;
    const value = Object.fromEntries(
      Object.entries(stored as Record<string, unknown>).map(([key, entry]) => {
        const repaired = repairQuestionMarkText(entry, baselineRecord[key]);
        repairedFields += repaired.repairedFields;
        return [key, repaired.value];
      }),
    );
    return { value, repairedFields };
  }

  return { value: stored, repairedFields: 0 };
}

export function repairContentStudioQuestionMarkCorruption(input: unknown) {
  const document = parseContentStudioDocument(input);
  const baseline = getEffectiveContentStudioDocument(
    parseContentStudioDocument({ version: 1 }),
  );
  const baselineItems = asRecord(baseline.items);
  const baselineRecipes = asRecord(baseline.recipes);
  let repairedFields = 0;

  const items = document.items.map((item) => {
    const baselineItem = baselineItems[item.id];
    if (!baselineItem) return item;
    const repaired = repairQuestionMarkText(item, baselineItem);
    repairedFields += repaired.repairedFields;
    return repaired.value;
  });
  const recipes = document.recipes.map((recipe) => {
    const baselineRecipe = baselineRecipes[recipe.id];
    if (!baselineRecipe) return recipe;
    const repaired = repairQuestionMarkText(recipe, baselineRecipe);
    repairedFields += repaired.repairedFields;
    return repaired.value;
  });

  return {
    document: parseContentStudioDocument({
      ...document,
      items,
      recipes,
    }),
    repairedFields,
  };
}

export function buildWorldRegistryFromStudio(
  stored: ContentStudioDocument,
): ContentRegistry {
  const document = getEffectiveContentStudioDocument(stored);
  const locations = structuredClone(builtInWorldRegistry.locations);
  const actions = structuredClone(builtInWorldRegistry.actions);
  const choices = structuredClone(builtInWorldRegistry.choices);
  const scenes = structuredClone(builtInWorldRegistry.scenes);

  document.recipes.forEach((recipe) => {
    if (recipe.enabled) {
      const { menu: _menu, enabled: _enabled, ...choice } = recipe;
      choices[recipe.id] = choice;
    } else {
      delete choices[recipe.id];
    }
  });

  CRAFTING_MENU_SCENE_IDS.forEach((sceneId) => {
    const scene = scenes[sceneId];
    if (scene) {
      scene.choiceIds = mergeMenuChoiceIds(scene.choiceIds, document.recipes, "crafting");
    }
  });
  COOKING_MENU_SCENE_IDS.forEach((sceneId) => {
    const scene = scenes[sceneId];
    if (scene) {
      scene.choiceIds = mergeMenuChoiceIds(scene.choiceIds, document.recipes, "cooking");
    }
  });

  compileStudioStories(document, locations, actions, choices, scenes);

  return {
    ...builtInWorldRegistry,
    items: asRecord(document.items),
    locations,
    actions,
    choices,
    scenes,
  };
}

export const worldRegistry: ContentRegistry = buildWorldRegistryFromStudio(
  loadStoredContentStudioDocument(),
);

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
    case "not_has_item":
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
    case "set_tool_durability":
    case "damage_tool":
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
    case "set_random_scene": {
      const matchingScenes = Object.values(registry.scenes).filter((scene) => (scene.tags ?? []).includes(effect.tag));
      if (matchingScenes.length === 0) {
        throw new Error(`${source} references unknown random scene tag '${effect.tag}'.`);
      }
      break;
    }
    case "random_outcome":
      effect.outcomes.forEach((outcome, index) => {
        outcome.effects.forEach((nestedEffect) => validateEffect(registry, nestedEffect, `${source}:outcome:${index + 1}`));
      });
      break;
    case "log":
      validateItemTextReferences(effect.message, registry, `${source}:log`);
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

type SkillUseDefinition = {
  effects: Effect[];
  skillUse?: { skillId: "collection" | "exploration" | "fishing" };
};

function validateSkillUseDefinition(definition: SkillUseDefinition, source: string) {
  const skillUse = definition.skillUse;
  if (!skillUse) return;

  const advanceTimeEffects = definition.effects.filter(
    (effect) => effect.type === "advance_time",
  );
  const usesDaybreak = definition.effects.some(
    (effect) => effect.type === "advance_to_daybreak",
  );
  if (advanceTimeEffects.length !== 1 || usesDaybreak) {
    throw new Error(
      `${source} skillUse requires exactly one direct advance_time effect and cannot use advance_to_daybreak.`,
    );
  }

  if (skillUse.skillId === "collection") {
    const hasDirectCollection = definition.effects.some((effect) =>
      effect.type === "add_item" ||
      effect.type === "collect_stock_item" ||
      effect.type === "collect_stock_item_all" ||
      effect.type === "collect_stock_money" ||
      effect.type === "collect_stock_money_all"
    );
    if (!hasDirectCollection) {
      throw new Error(
        `${source} collection skillUse requires a direct item or stock collection effect.`,
      );
    }
    return;
  }

  const randomOutcomeEffects = definition.effects.filter(
    (effect): effect is Extract<Effect, { type: "random_outcome" }> =>
      effect.type === "random_outcome",
  );
  if (randomOutcomeEffects.length !== 1) {
    throw new Error(
      `${source} ${skillUse.skillId} skillUse requires exactly one direct random_outcome effect.`,
    );
  }

  const outcomes = randomOutcomeEffects[0].outcomes as Array<{
    result?: "success" | "failure";
  }>;
  if (outcomes.some((outcome) => outcome.result !== "success" && outcome.result !== "failure")) {
    throw new Error(
      `${source} ${skillUse.skillId} skillUse requires every random outcome to declare result.`,
    );
  }
  const results = new Set(outcomes.map((outcome) => outcome.result));
  if (!results.has("success") || !results.has("failure")) {
    throw new Error(
      `${source} ${skillUse.skillId} skillUse requires at least one success and one failure outcome.`,
    );
  }
}

function validateAction(registry: ContentRegistry, action: ActionDefinition) {
  validateItemTextReferences(action.label, registry, `action:${action.id}:label`);
  validateItemTextReferences(action.outcomeHint, registry, `action:${action.id}:outcomeHint`);
  validateItemTextReferences(action.failureNote, registry, `action:${action.id}:failureNote`);
  validateItemTextReferences(action.systemNote, registry, `action:${action.id}:systemNote`);
  for (const locationId of action.locationIds) {
    assertKnownLocation(registry, locationId, `action:${action.id}`);
  }
  if (action.nextEventId) assertKnownEvent(registry, action.nextEventId, `action:${action.id}`);
  if (action.nextSceneId) assertKnownScene(registry, action.nextSceneId, `action:${action.id}`);
  action.conditions.forEach((condition) => validateCondition(registry, condition, `action:${action.id}`));
  action.effects.forEach((effect) => validateEffect(registry, effect, `action:${action.id}`));
  action.failureEffects.forEach((effect) => validateEffect(registry, effect, `action:${action.id}:failure`));
  validateSkillUseDefinition(action, `action:${action.id}`);
}

function validateChoice(registry: ContentRegistry, choice: ChoiceDefinition) {
  validateItemTextReferences(choice.label, registry, `choice:${choice.id}:label`);
  validateItemTextReferences(choice.outcomeHint, registry, `choice:${choice.id}:outcomeHint`);
  validateItemTextReferences(choice.failureNote, registry, `choice:${choice.id}:failureNote`);
  validateItemTextReferences(choice.systemNote, registry, `choice:${choice.id}:systemNote`);
  if (choice.nextEventId) assertKnownEvent(registry, choice.nextEventId, `choice:${choice.id}`);
  if (choice.nextSceneId) assertKnownScene(registry, choice.nextSceneId, `choice:${choice.id}`);
  choice.conditions.forEach((condition) => validateCondition(registry, condition, `choice:${choice.id}`));
  choice.effects.forEach((effect) => validateEffect(registry, effect, `choice:${choice.id}`));
  (choice.failureEffects ?? []).forEach((effect) => validateEffect(registry, effect, `choice:${choice.id}:failure`));
  validateSkillUseDefinition(choice, `choice:${choice.id}`);
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
    quest.requiredItems.forEach((requiredItem) => {
      if (!registry.items[requiredItem.itemId]) {
        throw new Error(`quest:${quest.id} requiredItems references unknown item '${requiredItem.itemId}'.`);
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
    validateItemTextReferences(event.title, registry, `event:${event.id}:title`);
    validateItemTextReferences(event.summary, registry, `event:${event.id}:summary`);
    assertKnownLocation(registry, event.locationId, `event:${event.id}`);
    assertKnownScene(registry, event.startSceneId, `event:${event.id}`);
    event.sceneIds.forEach((sceneId) => assertKnownScene(registry, sceneId, `event:${event.id}`));
    event.choiceIds.forEach((choiceId) => assertKnownChoice(registry, choiceId, `event:${event.id}`));
    event.triggerConditions.forEach((condition) => validateCondition(registry, condition, `event:${event.id}`));
  });

  Object.values(registry.scenes).forEach((scene) => {
    validateItemTextReferences(scene.title, registry, `scene:${scene.id}:title`);
    scene.paragraphs.forEach((paragraph, index) => {
      validateItemTextReferences(paragraph, registry, `scene:${scene.id}:paragraph:${index + 1}`);
    });
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

export function prepareContentStudioDocument(input: unknown) {
  const document = parseContentStudioDocument(input);
  const registry = buildWorldRegistryFromStudio(document);
  validateRegistry(registry);
  return { document, registry };
}

export function applyPreparedContentStudioRegistry(registry: ContentRegistry) {
  Object.assign(worldRegistry, registry);
  return worldRegistry;
}
