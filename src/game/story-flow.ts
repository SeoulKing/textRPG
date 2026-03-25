import { SCENE_IDS_WITHOUT_LOCATION_INTERACTIONS } from "./data/scenes";
import { worldRegistry } from "./data/registry";
import {
  buildStoryChoiceFromChoice,
  resolveAvailableActions,
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

export type NextScenePreviewResolver = (action: GameAction) => string | undefined;

export type StoryFrame = {
  scene: SceneDefinition;
  choices: StoryChoice[];
};

function isDetailFocusActive(state: GameState) {
  return Boolean(state.activeStockNodeId);
}

function buildStoryChoiceFromActionDefinition(
  action: ActionDefinition,
  resolveNextSceneId?: NextScenePreviewResolver,
): StoryChoice {
  const serverActionHint: GameAction = { type: "content_action", actionId: action.id };
  return {
    id: action.id,
    label: action.label,
    outcomeHint: action.outcomeHint,
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
    const built = buildStoryChoiceFromChoice(choice);
    return {
      ...built,
      nextSceneId: options.resolveNextSceneId?.(built.serverActionHint) ?? built.nextSceneId,
    };
  });

  if (SCENE_IDS_WITHOUT_LOCATION_INTERACTIONS.has(scene.id) || isDetailFocusActive(state)) {
    return { scene, choices: sceneChoices };
  }

  const location = registry.locations[locationId];
  const locationChoices = resolveAvailableActions(state, location, registry).map((action) =>
    buildStoryChoiceFromActionDefinition(action, options.resolveNextSceneId),
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
    action: choice.serverActionHint,
    nextSceneId: choice.nextSceneId,
  }));
}
