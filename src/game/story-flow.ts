import { activityThoughtFields } from "./activity-narrative";
import { restChoiceHint } from "./rest";
import { resourceAvailability } from "./resources";
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
import {
  getRemainingDailyUses,
  getStockNodeLocationId,
  isStockNodeDepleted,
} from "./state-utils";

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
  registry: ContentRegistry,
  resolveNextSceneId?: NextScenePreviewResolver,
): StoryChoice {
  const serverActionHint: GameAction = { type: "content_action", actionId: action.id, ...(action.activity ? { activityRevision: state.activityRevision } : {}) };
  const hintEffects = action.id === "fish_at_river"
    ? action.effects.filter((effect) => effect.type === "advance_time")
    : action.effects;
  const standardizedHint = formatOutcomeHint(hintEffects, state, action.skillUse);
  const emptySearchPossible = action.resourceUse && action.effects.some(effect => effect.type === "random_outcome" && effect.outcomes.some(outcome => outcome.result === "failure" && !outcome.effects.some(effect => effect.type === "add_item" || effect.type.startsWith("collect_stock"))));
  const activityHint = [action.activity?.kind === "rest" ? restChoiceHint(state, action.activity) : standardizedHint || action.outcomeHint, ...(emptySearchPossible ? ["빈손으로 끝날 수 있음"] : [])].join(" / ");
  const resources = resourceAvailability(state, action, registry);
  const limits = [action.dailyLimit ? getRemainingDailyUses(state, action.dailyLimit) : undefined, resources?.remainingUses].filter((v): v is number => v !== undefined);
  const remainingUses = limits.length ? Math.min(...limits) : undefined;
  return {
    id: action.id,
    label: action.label,
    ...activityThoughtFields(action),
    outcomeHint: resources?.remainingUses === 0 ? resources.exhaustedHint : activityHint,
    statusLabel: resources?.remainingUses === 0 ? resources.site.name + " 소진" : undefined,
    showOutcomeHint: resources?.remainingUses === 0 || standardizedHint ? true : action.showOutcomeHint,
    remainingUses,
    loading: resolveInteractionLoading(action),
    isAvailable: actionConditionsMet(action, state) && remainingUses !== 0,
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
    buildStoryChoiceFromActionDefinition(state, action, registry, options.resolveNextSceneId),
  );
  const locationChoiceIds = new Set(locationChoices.map((choice) => choice.id));
  const narrativeOnlyChoices = sceneChoices.filter((choice) => !locationChoiceIds.has(choice.id));
  return {
    scene,
    choices: [...locationChoices, ...narrativeOnlyChoices],
  };
}

function choiceStatusLabel(choice: StoryChoice, state?: GameState) {
  if (!state) {
    return undefined;
  }

  const focusEffect = choice.effects?.find((effect) => effect.type === "focus_stock_node");
  if (!focusEffect || focusEffect.type !== "focus_stock_node") {
    return undefined;
  }

  const locationId = getStockNodeLocationId(state, focusEffect.nodeId);
  return locationId && isStockNodeDepleted(state, locationId, focusEffect.nodeId)
    ? "탐색 완료"
    : undefined;
}

export function buildActionCatalogFromStoryChoices(
  storyChoices: StoryChoice[],
  state?: GameState,
): ActionChoice[] {
  return storyChoices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    choiceThought: choice.choiceThought,
    choiceThoughtSource: choice.choiceThoughtSource,
    outcomeHint: choice.outcomeHint,
    showOutcomeHint: choice.showOutcomeHint,
    remainingUses: choice.remainingUses,
    loading: resolveInteractionLoading({
      id: choice.id,
      loading: choice.loading,
      effects: choice.effects ?? [],
    }),
    craftingRecipe: choice.craftingRecipe,
    action: choice.serverActionHint,
    isAvailable: choice.isAvailable,
    statusLabel: choice.statusLabel ?? choiceStatusLabel(choice, state),
    nextSceneId: choice.nextSceneId,
  }));
}
