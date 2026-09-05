import type {
  ActionDefinition,
  ChoiceLoading,
  ChoiceDefinition,
  ContentRegistry,
  Effect,
  EventDefinition,
  GameState,
  LocationDefinition,
  SceneDefinition,
  StoryChoice,
} from "./schemas";
import { evaluateCondition, isStockNodeGone } from "./state-utils";
import { worldRegistry } from "./data/registry";
import { formatOutcomeHint } from "./outcome-hint";

const ACTIVITY_LOADING_MS = 500;
const REGION_TRAVEL_LOADING_MS = 1000;
const INVESTIGATION_ACTION_ID_PATTERN = /^(search_|survey_|inspect_|listen_|ask_|explore_|track_)/;

function effectContainsTravel(effect: Effect): boolean {
  if (effect.type === "travel") {
    return true;
  }
  return effect.type === "random_outcome" &&
    effect.outcomes.some((outcome) => outcome.effects.some((nestedEffect) => nestedEffect.type === "travel"));
}

export function resolveInteractionLoading(definition: {
  id: string;
  type?: ActionDefinition["type"];
  loading?: ChoiceLoading;
  effects: Effect[];
}): ChoiceLoading | undefined {
  if (definition.effects.some(effectContainsTravel)) {
    return { durationMs: REGION_TRAVEL_LOADING_MS, transitionType: "region_travel" };
  }
  const isInvestigation = definition.type === "search" ||
    definition.type === "explore" ||
    INVESTIGATION_ACTION_ID_PATTERN.test(definition.id);
  const advancesTime = definition.effects.some(
    (effect) => effect.type === "advance_time" || effect.type === "advance_to_daybreak",
  );
  if (isInvestigation || advancesTime) {
    return { durationMs: ACTIVITY_LOADING_MS, transitionType: "activity" };
  }
  return definition.loading;
}

export function buildStoryChoiceFromChoice(
  choice: ChoiceDefinition,
  state: GameState,
): StoryChoice {
  const standardizedHint = formatOutcomeHint(choice.effects, state, choice.skillUse);
  return {
    id: choice.id,
    label: choice.label,
    outcomeHint: standardizedHint || choice.outcomeHint,
    showOutcomeHint: choice.tags?.includes("studio-authored") ? choice.showOutcomeHint : standardizedHint ? true : choice.showOutcomeHint,
    loading: resolveInteractionLoading(choice),
    isAvailable: true,
    descriptionTag: choice.descriptionTag,
    tags: choice.tags,
    conditions: choice.conditions,
    effects: choice.effects,
    riskHint: choice.riskHint,
    hidden: choice.hidden,
    nextEventId: choice.nextEventId,
    nextSceneId: choice.nextSceneId,
    serverActionHint: { type: "content_choice", choiceId: choice.id },
  };
}

export function actionConditionsMet(action: ActionDefinition, state: GameState) {
  return action.conditions.every((condition) => evaluateCondition(condition, state));
}

export function canPresentAction(action: ActionDefinition, state: GameState) {
  return action.presentationMode === "always" || actionConditionsMet(action, state);
}

export function choiceConditionsMet(choice: ChoiceDefinition, state: GameState) {
  return choice.conditions.every((condition) => evaluateCondition(condition, state));
}

export function canPresentChoice(choice: ChoiceDefinition, state: GameState) {
  return choice.presentationMode === "always" || choiceConditionsMet(choice, state);
}

function sceneMatchesDetailFocus(scene: SceneDefinition, state: GameState) {
  const focusConditions = scene.conditions.filter((condition) => condition.type === "active_stock_node");

  if (!state.activeStockNodeId) {
    return focusConditions.length === 0;
  }

  return focusConditions.some((condition) => condition.nodeId === state.activeStockNodeId);
}

export function resolveSceneDefinition(
  state: GameState,
  registry: ContentRegistry = worldRegistry,
  locationId = state.location,
): SceneDefinition {
  if (state.sceneId && registry.scenes[state.sceneId]) {
    const byId = registry.scenes[state.sceneId];
    if (
      byId.locationId === locationId &&
      sceneMatchesDetailFocus(byId, state) &&
      byId.conditions.every((condition) => evaluateCondition(condition, state))
    ) {
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
  const repeatMenus: Record<string, string> = {
    shelter_cooking_menu: "shelter_cooking_menu_repeat",
    shelter_crafting_menu: "shelter_crafting_menu_repeat",
  };
  // A consumed menu introduction returns to its repeat view before any location fallback.
  for (const id of preferredSceneId ? [preferredSceneId, repeatMenus[preferredSceneId]] : []) {
    const preferred = id ? registry.scenes[id] : undefined;
    if (preferred && preferred.locationId === locationId && preferred.conditions.every((condition) => evaluateCondition(condition, state))) {
      return preferred;
    }
  }

  const candidates = Object.values(registry.scenes)
    .filter(scene => !scene.studioStoryId)
    .filter((scene) => scene.locationId === locationId)
    .filter((scene) => sceneMatchesDetailFocus(scene, state))
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
  _registry: ContentRegistry = worldRegistry,
): ActionDefinition[] {
  return (location.interactionChoices ?? [])
    .filter((action) => action.locationIds.length === 0 || action.locationIds.includes(location.id))
    .filter((action) => {
      const focusEffect = action.effects.find((effect) => effect.type === "focus_stock_node");
      return !focusEffect || focusEffect.type !== "focus_stock_node" || !isStockNodeGone(state, focusEffect.nodeId);
    })
    .filter((action) => canPresentAction(action, state));
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
    .filter((choice) => canPresentChoice(choice, state));
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
