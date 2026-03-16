import type {
  ActionChoice,
  ActionDefinition,
  ChoiceDefinition,
  ContentRegistry,
  EventDefinition,
  GameState,
  LocationDefinition,
  SceneDefinition,
  StoryChoice,
} from "./schemas";
import { evaluateCondition } from "./state-utils";
import { worldRegistry } from "./data/registry";

export function buildStoryChoiceFromChoice(choice: ChoiceDefinition): StoryChoice {
  return {
    id: choice.id,
    label: choice.label,
    outcomeHint: choice.outcomeHint,
    descriptionTag: choice.descriptionTag,
    conditions: choice.conditions,
    effects: choice.effects,
    riskHint: choice.riskHint,
    hidden: choice.hidden,
    nextEventId: choice.nextEventId,
    nextSceneId: choice.nextSceneId,
    serverActionHint: { type: "content_choice", choiceId: choice.id },
  };
}

export function buildActionChoiceFromDefinition(action: ActionDefinition): ActionChoice {
  return {
    id: action.id,
    label: action.label,
    outcomeHint: action.outcomeHint,
    action: { type: "content_action", actionId: action.id },
  };
}

export function resolveSceneDefinition(
  state: GameState,
  registry: ContentRegistry = worldRegistry,
  locationId = state.location,
): SceneDefinition {
  if (state.sceneId && registry.scenes[state.sceneId]) {
    const byId = registry.scenes[state.sceneId];
    if (byId.locationId === locationId) {
      return byId;
    }
  }

  return resolveNextSceneDefinition(state, registry, locationId);
}

export function resolveNextSceneDefinition(
  state: GameState,
  registry: ContentRegistry = worldRegistry,
  locationId = state.location,
  preferredSceneId?: string,
): SceneDefinition {
  if (preferredSceneId && registry.scenes[preferredSceneId]) {
    const preferred = registry.scenes[preferredSceneId];
    if (preferred.locationId === locationId && preferred.conditions.every((condition) => evaluateCondition(condition, state))) {
      return preferred;
    }
  }

  const candidates = Object.values(registry.scenes)
    .filter((scene) => scene.locationId === locationId)
    .filter((scene) => scene.conditions.every((condition) => evaluateCondition(condition, state)));

  const matched = candidates[0];
  if (!matched) {
    throw new Error(`No scene definition found for location '${locationId}'.`);
  }
  return matched;
}

export function resolveAvailableActions(
  state: GameState,
  location: LocationDefinition,
  registry: ContentRegistry = worldRegistry,
): ActionDefinition[] {
  return location.availableActionIds
    .map((actionId) => registry.actions[actionId])
    .filter(Boolean)
    .filter((action) => action.locationIds.length === 0 || action.locationIds.includes(location.id))
    .filter((action) => action.conditions.every((condition) => evaluateCondition(condition, state)));
}

export function resolveSceneChoices(
  state: GameState,
  scene: SceneDefinition,
  registry: ContentRegistry = worldRegistry,
): ChoiceDefinition[] {
  return scene.choiceIds
    .map((choiceId) => registry.choices[choiceId])
    .filter(Boolean)
    .filter((choice) => !choice.hidden)
    .filter((choice) => choice.conditions.every((condition) => evaluateCondition(condition, state)));
}

export function resolveTriggeredEvents(
  state: GameState,
  locationId: string,
  registry: ContentRegistry = worldRegistry,
): EventDefinition[] {
  const location = registry.locations[locationId];
  return location.eventIds
    .map((eventId) => registry.events[eventId])
    .filter(Boolean)
    .filter((event) => event.locationId === locationId)
    .filter((event) => event.triggerConditions.every((condition) => evaluateCondition(condition, state)))
    .filter((event) => !event.once || !state.flags[`event_seen_${event.id}`])
    .sort((left, right) => right.priority - left.priority);
}

export function resolveEventChoices(
  state: GameState,
  event: EventDefinition,
  registry: ContentRegistry = worldRegistry,
): ChoiceDefinition[] {
  return event.choiceIds
    .map((choiceId) => registry.choices[choiceId])
    .filter(Boolean)
    .filter((choice) => !choice.hidden)
    .filter((choice) => choice.conditions.every((condition) => evaluateCondition(condition, state)));
}
