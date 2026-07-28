import { SCENE_IDS_WITHOUT_LOCATION_INTERACTIONS } from "./data/scenes";
import { worldRegistry } from "./data/registry";
import {
  actionConditionsMet,
  buildStoryChoiceFromChoice,
  choiceConditionsMet,
  resolveAvailableActions,
  resolveInteractionLoading,
  resolveSceneChoices,
  resolveSceneDefinition,
} from "./content-engine";
import type {
  ActionChoice,
  ActionDefinition,
  ContentRegistry,
  GameAction,
  GameState,
  SceneDefinition,
  StoryChoice,
} from "./schemas";
import { formatOutcomeHint } from "./outcome-hint";

export type NextScenePreviewResolver = (action: GameAction) => string | undefined;

export type StoryFrame = {
  scene: SceneDefinition;
  choices: StoryChoice[];
};

function isDetailFocusActive(state: GameState) {
  return Boolean(state.activeStockNodeId);
}

function buildStoryChoiceFromActionDefinition(
  state: GameState,
  action: ActionDefinition,
  resolveNextSceneId?: NextScenePreviewResolver,
): StoryChoice {
  const serverActionHint: GameAction = { type: "content_action", actionId: action.id };
  const standardizedHint = formatOutcomeHint(action.effects, state, action.skillUse);
  return {
    id: action.id,
    label: action.label,
    outcomeHint: standardizedHint || action.outcomeHint,
    showOutcomeHint: standardizedHint ? true : action.showOutcomeHint,
    loading: resolveInteractionLoading(action),
    isAvailable: actionConditionsMet(action, state),
    tags: action.tags,
    conditions: action.conditions,
    effects: action.effects,
    riskHint: action.riskHint,
    nextEventId: action.nextEventId,
    nextSceneId: resolveNextSceneId?.(serverActionHint) ?? action.nextSceneId,
    serverActionHint,
  };
}

export function resolveStoryFrame(
  state: GameState,
  registry: ContentRegistry = worldRegistry,
  options: {
    scene?: SceneDefinition;
    locationId?: string;
    resolveNextSceneId?: NextScenePreviewResolver;
  } = {},
): StoryFrame {
  const locationId = options.locationId ?? state.location;
  const scene = options.scene ?? resolveSceneDefinition(state, registry, locationId);
  const sceneChoices = resolveSceneChoices(state, scene, registry).map((choice) => {
    const built = buildStoryChoiceFromChoice(choice, state);
    return {
      ...built,
      isAvailable: choiceConditionsMet(choice, state),
      nextSceneId: options.resolveNextSceneId?.(built.serverActionHint) ?? built.nextSceneId,
    };
  });

  if (SCENE_IDS_WITHOUT_LOCATION_INTERACTIONS.has(scene.id) || isDetailFocusActive(state)) {
    return { scene, choices: sceneChoices };
  }

  if (scene.suppressLocationInteractions) {
    return { scene, choices: sceneChoices };
  }

  const location = registry.locations[locationId];
  const locationChoices = resolveAvailableActions(state, location, registry).map((action) =>
    buildStoryChoiceFromActionDefinition(state, action, options.resolveNextSceneId),
  );
  const locationChoiceIds = new Set(locationChoices.map((choice) => choice.id));
  const narrativeOnlyChoices = sceneChoices.filter((choice) => !locationChoiceIds.has(choice.id));
  return {
    scene,
    choices: [...locationChoices, ...narrativeOnlyChoices],
  };
}

export function buildActionCatalogFromStoryChoices(storyChoices: StoryChoice[]): ActionChoice[] {
  return storyChoices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    outcomeHint: choice.outcomeHint,
    showOutcomeHint: choice.showOutcomeHint,
    loading: resolveInteractionLoading({
      id: choice.id,
      loading: choice.loading,
      effects: choice.effects ?? [],
    }),
    craftingRecipe: choice.craftingRecipe,
    action: choice.serverActionHint,
    isAvailable: choice.isAvailable,
    nextSceneId: choice.nextSceneId,
  }));
}
