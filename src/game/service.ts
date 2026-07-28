import { createHash, randomUUID } from "node:crypto";
import { GAME_MINUTE_MS, PHASES, SIGNAL_PART_ITEM_IDS, TARGET_RESCUE_DAY, TRAVEL_DURATION_MS, getSkillEntries } from "./base-data";
import {
  buildStoryChoiceFromChoice,
  resolveEventChoices,
  resolveSceneDefinition,
  resolveTriggeredEvents,
} from "./content-engine";
import { createTemplateContentGenerator, type ContentGenerator } from "./content-generator";
import { clearDevLlmTrace, getDevLlmTrace } from "./dev-llm-trace";
import { resolveItemText } from "./item-text";
import { compileAnchorDraftForRuntime, compileSceneDraftForRuntime } from "./narrative-expansion-service";
import type { GameRepository } from "./repository";
import {
  applySystemNote,
  createInitialGameState,
  performAction,
  refreshLocationKnowledge,
  resolveTravelPath,
  syncClock,
  syncQuestState,
  syncScene,
} from "./rules";
import { buildRuntimeRegistry, getQuestDefinitions, getRuntimeLocationDefinition, mergeDynamicWorldRegistry } from "./runtime-registry";
import { applyEffect } from "./state-utils";
import { buildActionCatalogFromStoryChoices, resolveStoryFrame } from "./story-flow";
import {
  acknowledgeSubwayResult,
  buildSubwayExpeditionActions,
  buildSubwayExpeditionScene,
  descendSubwayFloor,
  resolveSubwayFloorEvent,
  returnFromSubwayExpedition,
  searchSubwayLootSpot,
  startSubwayExpedition,
} from "./subway-expedition";
import {
  SUBWAY_EXPEDITION_PROMPT_VERSION,
  buildSubwayMechanicsEnvelope,
  buildTemplateSubwayFloorBundle,
  buildTemplateSubwayRunPlan,
  createSubwayFloorGenerationSpec,
  generateSubwayFloorBundle,
  generateSubwayRunPlan,
  hashSubwayMechanicsEnvelope,
  type SubwayFloorBundleGenerationInput,
} from "./subway-expedition-generator";
import {
  SUBWAY_LOOT_TABLES,
  type SubwayLootItemId,
  type SubwayLootManifestSpot,
} from "./subway-loot";
import type {
  ActionChoice,
  ActionDefinition,
  ContentRegistry,
  CraftingRecipe,
  EventCard,
  EventDefinition,
  Effect,
  GameAction,
  GameSession,
  GeneratedStoryBeat,
  ItemCard,
  LocationCard,
  LocationDefinition,
  MapEntry,
  NarrativeContinuationRequest,
  PersonCard,
  ProtagonistCard,
  QuestDefinition,
  SceneCard,
  SceneDefinition,
  StateSnapshot,
  StoryChoice,
  StoryMaterials,
  SubwayRunPlan,
} from "./schemas";
import { EventCardSchema, ItemCardSchema, SceneCardSchema, StateSnapshotSchema } from "./schemas";
import { buildPlannedRegionSummary, createWorldPlanner, type WorldPlanner } from "./world-planner";

function nowIso() {
  return new Date().toISOString();
}

function resolveCraftingRecipeText(recipe: CraftingRecipe | undefined, registry: ContentRegistry) {
  if (!recipe) {
    return undefined;
  }
  return {
    ...recipe,
    actionLabel: resolveItemText(recipe.actionLabel, registry),
    effect: resolveItemText(recipe.effect, registry),
    prerequisites: recipe.prerequisites.map((entry) => ({
      ...entry,
      label: resolveItemText(entry.label, registry),
    })),
  };
}

function resolveStoryChoiceText(choice: StoryChoice, registry: ContentRegistry): StoryChoice {
  return {
    ...choice,
    label: resolveItemText(choice.label, registry),
    outcomeHint: resolveItemText(choice.outcomeHint, registry),
    descriptionTag: choice.descriptionTag
      ? resolveItemText(choice.descriptionTag, registry)
      : choice.descriptionTag,
    craftingRecipe: resolveCraftingRecipeText(choice.craftingRecipe, registry),
    effects: choice.effects?.map((effect) => resolveEffectText(effect, registry)),
  };
}

function resolveEffectText<T extends Effect>(effect: T, registry: ContentRegistry): T {
  if (effect.type === "log") {
    return {
      ...effect,
      message: resolveItemText(effect.message, registry),
    } as T;
  }

  if (effect.type === "random_outcome") {
    return {
      ...effect,
      outcomes: effect.outcomes.map((outcome) => ({
        ...outcome,
        effects: outcome.effects.map((outcomeEffect) =>
          resolveEffectText(outcomeEffect, registry),
        ),
      })),
    } as T;
  }

  return effect;
}

function resolveActionChoiceText(choice: ActionChoice, registry: ContentRegistry): ActionChoice {
  return {
    ...choice,
    label: resolveItemText(choice.label, registry),
    outcomeHint: resolveItemText(choice.outcomeHint, registry),
    craftingRecipe: resolveCraftingRecipeText(choice.craftingRecipe, registry),
  };
}

function resolveSceneCardText(scene: SceneCard, registry: ContentRegistry): SceneCard {
  return {
    ...scene,
    title: resolveItemText(scene.title, registry),
    paragraphs: scene.paragraphs.map((paragraph) => resolveItemText(paragraph, registry)),
    choices: scene.choices.map((choice) => resolveStoryChoiceText(choice, registry)),
  };
}

function resolveEventCardText(event: EventCard, registry: ContentRegistry): EventCard {
  return {
    ...event,
    title: resolveItemText(event.title, registry),
    summary: resolveItemText(event.summary, registry),
    trigger: resolveItemText(event.trigger, registry),
    choices: event.choices.map((choice) => resolveStoryChoiceText(choice, registry)),
    rewards: event.rewards.map((reward) => resolveItemText(reward, registry)),
  };
}

type AxialCoord = { q: number; r: number };

const HEX_DIRECTIONS: AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

function sameAxialCoord(left?: AxialCoord, right?: AxialCoord) {
  if (!left && !right) {
    return true;
  }
  return Boolean(left && right && left.q === right.q && left.r === right.r);
}

function isHexNeighbor(left?: AxialCoord, right?: AxialCoord) {
  if (!left || !right) {
    return false;
  }
  return HEX_DIRECTIONS.some((direction) =>
    left.q + direction.q === right.q && left.r + direction.r === right.r
  );
}

const SCENE_CARD_CACHE_VERSION = 5;

const RECIPE_MENU_SCENE_IDS = [
  "shelter_crafting_menu",
  "shelter_crafting_menu_repeat",
  "shelter_cooking_menu",
  "shelter_cooking_menu_repeat",
  "arcana_workbench_menu",
  "arcana_workbench_menu_repeat",
];

const CRAFTING_RECIPE_EFFECTS: Record<string, string> = {
  craft_shelter_wall_patch: "잠자기 후 체력과 정신력 회복량 증가",
  craft_shelter_brazier: "거처에서 {{item:hotMeal}} 조리 가능",
  craft_shelter_rain_bucket: "하루에 한 번 물 한 병 확보 가능",
  craft_crude_axe: "숲에서 벌목 효율 증가, 내구도 8",
  craft_utility_knife: "숲에서 식량 수색 효율 증가, 내구도 10",
  craft_dented_pot: "거처 요리 가능, 내구도 12",
  cook_at_shelter: "+1 정신력 / +4 기력",
  cook_rice_porridge: "+1 정신력 / +4 기력",
  cook_greens_soup: "+1 정신력 / +3 기력",
  cook_forest_stew: "+6 기력 / 피로 완화",
  assemble_rescue_radio: "10일차 구조 신호 준비",
  brew_mana_potion: "MP +4",
  craft_rune_compass: "마법도시의 숨은 길 탐색",
};

const CRAFTING_RECIPE_PREREQUISITES: Record<string, Array<{ flag: string; label: string }>> = {
  cook_at_shelter: [{ flag: "shelter_brazier", label: "간이 화로" }],
  cook_rice_porridge: [{ flag: "shelter_brazier", label: "간이 화로" }],
  cook_greens_soup: [{ flag: "shelter_brazier", label: "간이 화로" }],
  cook_forest_stew: [
    { flag: "shelter_brazier", label: "간이 화로" },
  ],
};

function isMagicRealmLocation(location: LocationDefinition) {
  return location.tags.includes("realm:magic");
}

function isLocationInActiveRealm(state: GameSession["state"], location: LocationDefinition) {
  return Boolean(state.flags.in_magic_world) === isMagicRealmLocation(location);
}

const STATIC_SCENE_SOURCE_PATH_BY_LOCATION: Record<string, string> = {
  arcana_hunting_ground: "src/game/data/regions/arcana-hunting-ground/scenes.ts",
  arcana_plaza: "src/game/data/regions/arcana-plaza/scenes.ts",
  checkpoint: "src/game/data/regions/checkpoint/scenes.ts",
  convenience: "src/game/data/regions/convenience/scenes.ts",
  forest: "src/game/data/regions/forest/scenes.ts",
  hospital: "src/game/data/regions/hospital/scenes.ts",
  kitchen: "src/game/data/regions/kitchen/scenes.ts",
  magic_city_entrance: "src/game/data/regions/magic-city-entrance/scenes.ts",
  shelter: "src/game/data/regions/shelter/scenes.ts",
  subway: "src/game/data/regions/subway/scenes.ts",
};

const TRAVEL_MINUTES_PER_ROUTE = Math.round(TRAVEL_DURATION_MS / GAME_MINUTE_MS);
const UNIQUE_SUBWAY_LOOT_ITEM_IDS = new Set(
  SUBWAY_LOOT_TABLES.flatMap((table) =>
    table.entries.filter((entry) => entry.unique).map((entry) => entry.itemId)
  ),
);

function sceneDevSource(sceneDef: SceneDefinition) {
  return {
    kind: "scene" as const,
    path: STATIC_SCENE_SOURCE_PATH_BY_LOCATION[sceneDef.locationId] ??
      `src/game/data/regions/${sceneDef.locationId}/scenes.ts`,
    id: sceneDef.id,
  };
}

export class GameService {
  private readonly subwayFloorGenerationTasks = new Map<string, Promise<void>>();
  private readonly gameMutationTails = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: GameRepository,
    private readonly templateGenerator: ContentGenerator = createTemplateContentGenerator(),
    private readonly planner: WorldPlanner = createWorldPlanner(),
  ) {}

  private async withGameMutation<T>(gameId: string, operation: () => Promise<T>) {
    const previous = this.gameMutationTails.get(gameId) ?? Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const queued = previous.catch(() => undefined).then(() => current);
    this.gameMutationTails.set(gameId, queued);
    await previous.catch(() => undefined);
    try {
      return await this.repository.withGameLock(gameId, operation);
    } finally {
      releaseCurrent();
      if (this.gameMutationTails.get(gameId) === queued) {
        this.gameMutationTails.delete(gameId);
      }
    }
  }

  private subwayPreparationContext(state: GameSession["state"]) {
    if (state.location !== "subway" || state.isGameOver || state.stageClear) {
      return null;
    }
    const expedition = state.subwayExpedition;
    if (!expedition.active) {
      return {
        runNumber: expedition.runNumber + 1,
        sourceFloorId: "subway-concourse",
        targetDepth: 1,
        previousOutcome: "지하철역 대합실에서 장비를 정비한 뒤 지하 1층 진입을 준비하고 있다.",
      };
    }
    const currentFloor = expedition.currentFloor;
    if (!currentFloor) {
      return null;
    }
    return {
      runNumber: expedition.runNumber,
      sourceFloorId: currentFloor.id,
      targetDepth: currentFloor.depth + 1,
      previousOutcome:
        `${currentFloor.title}을 탐색 중이다. 다음 층은 현재 사건의 어떤 결과와도 모순되지 않는 인접 구간이다.`,
    };
  }

  private subwayPreparationTaskKey(gameId: string, contextHash: string) {
    return `${gameId}:${contextHash}`;
  }

  private isMatchingPreparedSubwayFloor(
    session: GameSession,
    context = this.subwayPreparationContext(session.state),
  ) {
    const prepared = session.state.subwayExpedition.preparedNextFloor;
    if (!context || !prepared) {
      return false;
    }
    const mechanicsEnvelopeHash = hashSubwayMechanicsEnvelope(
      buildSubwayMechanicsEnvelope(context.targetDepth),
    );
    const conflictsWithOwnedUniqueLoot = prepared.floor.lootSpots.some((spot) =>
      spot.contents.some((entry) =>
        UNIQUE_SUBWAY_LOOT_ITEM_IDS.has(entry.itemId as SubwayLootItemId) &&
        (
          (session.state.inventory[entry.itemId] ?? 0) > 0 ||
          (session.state.subwayExpedition.carriedLoot[entry.itemId] ?? 0) > 0
        )
      )
    );
    return (
      session.state.subwayExpedition.runPlan?.runNumber === context.runNumber &&
      prepared.runNumber === context.runNumber &&
      prepared.sourceFloorId === context.sourceFloorId &&
      prepared.targetDepth === context.targetDepth &&
      prepared.floor.depth === context.targetDepth &&
      prepared.floor.promptVersion === SUBWAY_EXPEDITION_PROMPT_VERSION &&
      prepared.floor.mechanicsEnvelopeHash === mechanicsEnvelopeHash &&
      !conflictsWithOwnedUniqueLoot &&
      Boolean(prepared.floor.contextHash) &&
      prepared.floor.contextHash === prepared.contextHash
    );
  }

  private storyMemoryForPreparedRunPlan(runPlan: SubwayRunPlan) {
    return {
      facts: [...runPlan.facts],
      unresolvedThreads: [...runPlan.unresolvedThreads],
      resolvedThreads: [],
      recentSummaries: [],
      lastBridge: "",
    };
  }

  private ensurePreparedSubwayTemplate(session: GameSession) {
    const context = this.subwayPreparationContext(session.state);
    const expedition = session.state.subwayExpedition;
    if (!context) {
      const changed = expedition.preparedNextFloor !== null;
      expedition.preparedNextFloor = null;
      if (!expedition.active) {
        expedition.runPlan = null;
      }
      return changed;
    }
    if (this.isMatchingPreparedSubwayFloor(session, context)) {
      return false;
    }

    const runPlan = expedition.runPlan?.runNumber === context.runNumber
      ? expedition.runPlan
      : buildTemplateSubwayRunPlan(context.runNumber);
    const runMemory = expedition.active
      ? expedition.storyMemory
      : this.storyMemoryForPreparedRunPlan(runPlan);
    const spec = createSubwayFloorGenerationSpec({
      gameId: session.id,
      state: structuredClone(session.state),
      depth: context.targetDepth,
      previousOutcome: context.previousOutcome,
      runPlan,
      runMemory,
    });
    const floor = buildTemplateSubwayFloorBundle(spec);
    expedition.runPlan = structuredClone(runPlan);
    expedition.preparedNextFloor = {
      contextHash: floor.contextHash as string,
      floor,
      createdAt: nowIso(),
      runNumber: context.runNumber,
      sourceFloorId: context.sourceFloorId,
      targetDepth: context.targetDepth,
      llmAttempted: false,
    };
    return true;
  }

  private takePreparedSubwayFloor(session: GameSession) {
    const context = this.subwayPreparationContext(session.state);
    if (!this.isMatchingPreparedSubwayFloor(session, context)) {
      return null;
    }
    const expedition = session.state.subwayExpedition;
    const prepared = expedition.preparedNextFloor;
    if (!prepared || !context) {
      return null;
    }
    const runPlan = !expedition.active &&
      expedition.runPlan?.runNumber === context.runNumber
      ? structuredClone(expedition.runPlan)
      : null;
    expedition.preparedNextFloor = null;
    return {
      floor: structuredClone(prepared.floor),
      runPlan,
    };
  }

  private scheduleSubwayNextFloor(session: GameSession) {
    const context = this.subwayPreparationContext(session.state);
    if (!context) {
      return;
    }
    const prepared = session.state.subwayExpedition.preparedNextFloor;
    if (
      !prepared ||
      !this.isMatchingPreparedSubwayFloor(session, context) ||
      prepared.llmAttempted
    ) {
      return;
    }
    const runPlan = session.state.subwayExpedition.runPlan;
    if (!runPlan || runPlan.runNumber !== context.runNumber) {
      return;
    }
    const runMemory = session.state.subwayExpedition.active
      ? session.state.subwayExpedition.storyMemory
      : this.storyMemoryForPreparedRunPlan(runPlan);
    const lootManifest: SubwayLootManifestSpot[] = prepared.floor.lootSpots.map((spot) => ({
      slotId: spot.id,
      contents: spot.contents.map((entry) => ({
        itemId: entry.itemId as SubwayLootItemId,
        amount: entry.amount,
      })),
    }));
    const spec = createSubwayFloorGenerationSpec({
      gameId: session.id,
      state: structuredClone(session.state),
      depth: context.targetDepth,
      previousOutcome: context.previousOutcome,
      runPlan,
      runMemory,
      lootManifest,
      mechanicsEnvelope: buildSubwayMechanicsEnvelope(context.targetDepth),
    });
    if (spec.contextHash !== prepared.contextHash) {
      return;
    }
    const taskKey = this.subwayPreparationTaskKey(session.id, prepared.contextHash);
    if (this.subwayFloorGenerationTasks.has(taskKey)) {
      return;
    }
    const task = this.preGenerateSubwayNextFloor(
      session.id,
      context,
      structuredClone(session.state),
      spec,
      prepared.contextHash,
    )
      .catch(() => undefined)
      .finally(() => {
        if (this.subwayFloorGenerationTasks.get(taskKey) === task) {
          this.subwayFloorGenerationTasks.delete(taskKey);
        }
      });
    this.subwayFloorGenerationTasks.set(taskKey, task);
  }

  private async preGenerateSubwayNextFloor(
    gameId: string,
    context: {
      runNumber: number;
      sourceFloorId: string;
      targetDepth: number;
      previousOutcome: string;
    },
    state: GameSession["state"],
    templateSpec: SubwayFloorBundleGenerationInput,
    templateContextHash: string,
  ) {
    const isRunStart = context.sourceFloorId === "subway-concourse";
    const runPlan = isRunStart
      ? await generateSubwayRunPlan({
          gameId,
          state,
          runNumber: context.runNumber,
        })
      : templateSpec.runPlan;
    const runMemory = isRunStart
      ? this.storyMemoryForPreparedRunPlan(runPlan)
      : templateSpec.runMemory;
    const generationSpec = createSubwayFloorGenerationSpec({
      gameId,
      state,
      depth: context.targetDepth,
      previousOutcome: context.previousOutcome,
      runPlan,
      runMemory,
      lootManifest: templateSpec.lootManifest,
      mechanicsEnvelope: templateSpec.mechanicsEnvelope,
    });
    const floor = await generateSubwayFloorBundle(generationSpec);

    await this.withGameMutation(gameId, async () => {
      const latest = await this.repository.loadGame(gameId);
      const latestContext = this.subwayPreparationContext(latest.state);
      const prepared = latest.state.subwayExpedition.preparedNextFloor;
      // The next floor is intentionally branch-neutral. Do not recompute its hash
      // from post-choice stats or story memory; descent injects the selected bridge.
      if (
        !latestContext ||
        latestContext.runNumber !== context.runNumber ||
        latestContext.sourceFloorId !== context.sourceFloorId ||
        latestContext.targetDepth !== context.targetDepth ||
        !prepared ||
        !this.isMatchingPreparedSubwayFloor(latest, latestContext) ||
        prepared.contextHash !== templateContextHash ||
        prepared.floor.contextHash !== templateContextHash ||
        prepared.floor.source !== "template" ||
        prepared.llmAttempted ||
        latest.state.subwayExpedition.runPlan?.runNumber !== context.runNumber
      ) {
        return;
      }
      if (
        floor.depth !== context.targetDepth ||
        floor.contextHash !== generationSpec.contextHash ||
        floor.mechanicsEnvelopeHash !== generationSpec.mechanicsEnvelopeHash
      ) {
        return;
      }

      latest.state.subwayExpedition.preparedNextFloor = {
        contextHash: generationSpec.contextHash,
        floor,
        createdAt: nowIso(),
        runNumber: context.runNumber,
        sourceFloorId: context.sourceFloorId,
        targetDepth: context.targetDepth,
        llmAttempted: true,
      };
      if (isRunStart) {
        latest.state.subwayExpedition.runPlan = structuredClone(runPlan);
      }
      latest.updatedAt = nowIso();
      await this.repository.saveGame(latest);
      await this.repository.appendGenerationLog({
        gameId,
        kind: "subwayFloorPregenerated",
        id: floor.id,
        sourceFloorId: context.sourceFloorId,
        depth: context.targetDepth,
        source: floor.source,
        runPlanSource: runPlan.source,
        at: latest.updatedAt,
      });
    });
  }

  async createGame() {
    const session: GameSession = {
      id: randomUUID(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      state: createInitialGameState(),
      world: {
        locationCards: {},
        personCards: {},
        itemCards: {},
        eventCards: {},
        sceneCards: {},
        protagonistCard: null,
      },
    };

    clearDevLlmTrace(session.id);
    await this.ensureCards(session);
    const snapshot = this.buildSnapshot(session, null);
    await this.repository.saveGame(session);
    return snapshot;
  }

  async getState(gameId: string) {
    return this.withGameMutation(gameId, () => this.getStateUnlocked(gameId));
  }

  private async getStateUnlocked(gameId: string) {
    const session = await this.repository.loadGame(gameId);
    const previousState = structuredClone(session.state);
    syncClock(session.state);
    syncQuestState(session.state, previousState.quests);
    syncScene(session.state);
    applySystemNote(previousState, session.state);
    await this.replanTomorrowIfNeeded(session, previousState.day);
    session.updatedAt = nowIso();
    await this.ensureCards(session);
    this.ensurePreparedSubwayTemplate(session);
    const snapshot = this.buildSnapshot(session, null);
    await this.repository.saveGame(session);
    this.scheduleSubwayNextFloor(session);
    return snapshot;
  }

  async performAction(gameId: string, action: GameAction) {
    return this.withGameMutation(gameId, () => this.performActionUnlocked(gameId, action));
  }

  private async performActionUnlocked(gameId: string, action: GameAction) {
    const session = await this.repository.loadGame(gameId);
    const previousDay = session.state.day;
    const registry = this.runtimeRegistry(session);

    if (
      session.state.subwayExpedition.active &&
      action.type !== "subway_expedition" &&
      action.type !== "use_item"
    ) {
      throw new Error("심층 탐험 중에는 현재 경로를 선택하거나 지상으로 귀환해야 합니다.");
    }

    if (
      action.type === "subway_expedition" ||
      (action.type === "content_action" && action.actionId === "start_subway_expedition")
    ) {
      const subwayAction = action.type === "subway_expedition"
        ? action
        : { type: "subway_expedition" as const, command: "start" as const };
      if (subwayAction.command === "start") {
        this.ensurePreparedSubwayTemplate(session);
        const prepared = this.takePreparedSubwayFloor(session);
        if (!prepared) {
          throw new Error("준비된 지하 1층을 불러오지 못했습니다.");
        }
        await startSubwayExpedition(
          session.state,
          gameId,
          prepared.floor,
          prepared.runPlan,
        );
        await this.repository.appendGenerationLog({
          gameId,
          kind: "subwayFloorPregeneratedCacheHit",
          id: prepared.floor.id,
          depth: prepared.floor.depth,
          source: prepared.floor.source,
          storage: "persistent",
          at: nowIso(),
        });
      } else if (subwayAction.command === "choose" || subwayAction.command === "resolve_event") {
        resolveSubwayFloorEvent(session.state, subwayAction.optionId);
      } else if (subwayAction.command === "acknowledge_result") {
        acknowledgeSubwayResult(session.state);
      } else if (subwayAction.command === "search_loot") {
        searchSubwayLootSpot(session.state, subwayAction.lootSpotId);
      } else if (subwayAction.command === "descend") {
        this.ensurePreparedSubwayTemplate(session);
        const prepared = this.takePreparedSubwayFloor(session);
        if (!prepared) {
          throw new Error("준비된 다음 지하층을 불러오지 못했습니다.");
        }
        await descendSubwayFloor(session.state, gameId, prepared.floor);
        await this.repository.appendGenerationLog({
          gameId,
          kind: "subwayFloorPregeneratedCacheHit",
          id: prepared.floor.id,
          depth: prepared.floor.depth,
          source: prepared.floor.source,
          storage: "persistent",
          at: nowIso(),
        });
      } else if (subwayAction.command === "return") {
        returnFromSubwayExpedition(session.state);
      }
      session.updatedAt = nowIso();
      session.world.sceneCards = {};
      syncQuestState(session.state);
      await this.replanTomorrowIfNeeded(session, previousDay);
      await this.ensureCards(session);
      await this.repository.appendActionLog({
        gameId,
        action: subwayAction,
        at: session.updatedAt,
        location: session.state.location,
        day: session.state.day,
      });
      this.ensurePreparedSubwayTemplate(session);
      const snapshot = this.buildSnapshot(session, null);
      await this.repository.saveGame(session);
      this.scheduleSubwayNextFloor(session);
      return snapshot;
    }

    if (this.isFrontierAction(action, registry)) {
      const snapshot = await this.expandFrontier(session, action, registry);
      await this.repository.saveGame(session);
      void this.preGenerateNarrativeBeats(gameId).catch(() => undefined);
      return snapshot;
    }

    if (this.isNarrativeContinuation(action, registry)) {
      const snapshot = await this.performNarrativeContinuation(session, action, registry);
      await this.repository.saveGame(session);
      void this.preGenerateNarrativeBeats(gameId).catch(() => undefined);
      return snapshot;
    }

    const followUpEventId = this.followUpEventId(action, registry);
    performAction(session.state, action);
    session.updatedAt = nowIso();
    session.world.sceneCards = {};

    await this.replanTomorrowIfNeeded(session, previousDay);
    const nextRegistry = this.runtimeRegistry(session);

    let latestEvent: EventCard | null = null;
    if (followUpEventId) {
      latestEvent = await this.ensureEventCardById(session, followUpEventId, nextRegistry);
    } else if (this.isExploreAction(action, nextRegistry)) {
      latestEvent = await this.ensureTriggeredEventCard(session, session.state.location, nextRegistry);
    }

    await this.ensureCards(session);
    await this.repository.appendActionLog({
      gameId,
      action,
      at: session.updatedAt,
      location: session.state.location,
      day: session.state.day,
    });
    this.ensurePreparedSubwayTemplate(session);
    const snapshot = this.buildSnapshot(session, latestEvent);
    await this.repository.saveGame(session);
    void this.preGenerateNarrativeBeats(gameId).catch(() => undefined);
    this.scheduleSubwayNextFloor(session);
    return snapshot;
  }

  async getMap(gameId: string) {
    return this.withGameMutation(gameId, () => this.getMapUnlocked(gameId));
  }

  private async getMapUnlocked(gameId: string) {
    const session = await this.repository.loadGame(gameId);
    const previousDay = session.state.day;
    syncClock(session.state);
    syncQuestState(session.state);
    syncScene(session.state);
    await this.replanTomorrowIfNeeded(session, previousDay);
    await this.ensureCards(session);
    this.ensurePreparedSubwayTemplate(session);
    await this.repository.saveGame(session);
    const result = {
      gameId,
      location: session.state.location,
      visibleLocations: this.visibleLocationIds(session).map((locationId) => session.world.locationCards[locationId]),
    };
    this.scheduleSubwayNextFloor(session);
    return result;
  }

  async getInventory(gameId: string) {
    return this.withGameMutation(gameId, () => this.getInventoryUnlocked(gameId));
  }

  private async getInventoryUnlocked(gameId: string) {
    const session = await this.repository.loadGame(gameId);
    const previousDay = session.state.day;
    syncClock(session.state);
    syncQuestState(session.state);
    syncScene(session.state);
    await this.replanTomorrowIfNeeded(session, previousDay);
    await this.ensureCards(session);
    this.ensurePreparedSubwayTemplate(session);
    await this.repository.saveGame(session);
    const result = {
      gameId,
      inventoryCards: Object.keys(session.state.inventory).map((itemId) => session.world.itemCards[itemId]),
      money: session.state.money,
    };
    this.scheduleSubwayNextFloor(session);
    return result;
  }

  async getManualSave(gameId: string) {
    return this.repository.getManualSaveInfo(gameId);
  }

  async getManualSaveForUser(ownerId: string) {
    return this.repository.getManualSaveInfoForUser(ownerId);
  }

  async saveManualGame(gameId: string, ownerId: string | null = null) {
    return this.withGameMutation(gameId, () => this.saveManualGameUnlocked(gameId, ownerId));
  }

  private async saveManualGameUnlocked(gameId: string, ownerId: string | null = null) {
    const session = await this.repository.loadGame(gameId);
    const previousDay = session.state.day;
    syncClock(session.state);
    syncQuestState(session.state);
    syncScene(session.state);
    await this.replanTomorrowIfNeeded(session, previousDay);
    session.updatedAt = nowIso();
    await this.ensureCards(session);
    this.ensurePreparedSubwayTemplate(session);
    await this.repository.saveGame(session);
    const result = await this.repository.saveManualGame(session, session.updatedAt, ownerId);
    this.scheduleSubwayNextFloor(session);
    return result;
  }

  async restoreManualGame(gameId: string) {
    return this.withGameMutation(gameId, () => this.restoreManualGameUnlocked(gameId));
  }

  private async restoreManualGameUnlocked(gameId: string) {
    const record = await this.repository.loadManualGame(gameId);
    if (!record) {
      throw new Error("저장된 게임을 찾을 수 없습니다.");
    }

    const session = record.session;
    const previousDay = session.state.day;
    syncClock(session.state);
    syncQuestState(session.state);
    syncScene(session.state);
    await this.replanTomorrowIfNeeded(session, previousDay);
    session.updatedAt = nowIso();
    await this.ensureCards(session);
    this.ensurePreparedSubwayTemplate(session);
    const snapshot = this.buildSnapshot(session, null);
    await this.repository.saveGame(session);
    this.scheduleSubwayNextFloor(session);
    return snapshot;
  }

  async restoreManualGameForUser(ownerId: string) {
    const record = await this.repository.loadManualGameForUser(ownerId);
    if (!record) {
      throw new Error("저장된 게임을 찾을 수 없습니다.");
    }

    return this.withGameMutation(record.session.id, async () => {
      const session = record.session;
      const previousDay = session.state.day;
      syncClock(session.state);
      syncQuestState(session.state);
      syncScene(session.state);
      await this.replanTomorrowIfNeeded(session, previousDay);
      session.updatedAt = nowIso();
      await this.ensureCards(session);
      this.ensurePreparedSubwayTemplate(session);
      const snapshot = this.buildSnapshot(session, null);
      await this.repository.saveGame(session);
      this.scheduleSubwayNextFloor(session);
      return snapshot;
    });
  }

  private runtimeRegistry(session: Pick<GameSession, "state"> | Pick<{ state: GameSession["state"] }, "state">) {
    return buildRuntimeRegistry(session.state);
  }

  private visibleLocationIds(session: Pick<GameSession, "state">) {
    refreshLocationKnowledge(session.state);
    const registry = this.runtimeRegistry(session);
    const ids = new Set<string>([session.state.location]);
    Object.keys(registry.locations).forEach((locationId) => {
      const location = getRuntimeLocationDefinition(session.state, registry, locationId);
      if (
        isLocationInActiveRealm(session.state, location) &&
        (session.state.flags[`visited_${locationId}`] || session.state.flags[`known_${locationId}`])
      ) {
        ids.add(locationId);
      }
    });
    return Array.from(ids);
  }

  private currentLocation(session: Pick<GameSession, "state">, registry = this.runtimeRegistry(session)) {
    return getRuntimeLocationDefinition(session.state, registry, session.state.location);
  }

  private async replanTomorrowIfNeeded(session: GameSession, previousDay: number) {
    if (session.state.day === previousDay && session.state.worldPlan.tomorrow && session.state.worldPlan.tomorrow.day === session.state.day + 1) {
      return;
    }

    session.state.worldPlan.today = {
      day: session.state.day,
      regions: session.state.worldPlan.today.regions.filter((region) => session.state.flags[`visited_${region.locationId}`] || region.createdDay === session.state.day),
      notes: session.state.worldPlan.today.notes,
    };
    session.state.worldPlan.tomorrow = await this.planner.planTomorrow(session.state, this.runtimeRegistry(session), session.id);
  }

  private async ensureCards(session: GameSession) {
    const registry = this.runtimeRegistry(session);
    const visibleLocationIds = this.visibleLocationIds(session);
    const allMapLocationIds = Object.keys(registry.locations);
    for (const locationId of new Set([...visibleLocationIds, ...allMapLocationIds])) {
      await this.ensureLocationCard(session, locationId, registry);
    }

    const visiblePersonIds = this.visiblePersonIds(session, registry);
    for (const personId of visiblePersonIds) {
      await this.ensurePersonCard(session, personId, registry);
    }

    const itemIds = new Set<string>(Object.keys(session.state.inventory));
    visibleLocationIds.forEach((locationId) => {
      registry.locations[locationId]?.obtainableItemIds.forEach((itemId) => itemIds.add(itemId));
    });
    visiblePersonIds.forEach((personId) => {
      const person = session.world.personCards[personId];
      person?.inventoryItemIds.forEach((itemId) => itemIds.add(itemId));
    });

    for (const itemId of itemIds) {
      await this.ensureItemCard(session, itemId, registry);
    }

    await this.ensureProtagonistCard(session);
    await this.ensureSceneCard(session, registry);
  }

  private visiblePersonIds(session: Pick<GameSession, "state" | "world">, registry = this.runtimeRegistry(session)) {
    return [...this.currentLocation(session, registry).residentIds];
  }

  private generatorInput(session: GameSession, includeProtagonist: boolean, registry = this.runtimeRegistry(session)) {
    return {
      state: session.state,
      gameId: session.id,
      recentLog: session.state.log.slice(-6).map((entry) => entry.message),
      allowedActions: this.buildActionCatalog(session, registry),
      storyMaterials: this.buildStoryMaterials(session, { includeProtagonist }, registry),
    };
  }

  private eventKeyFor(eventId: string, session: GameSession) {
    return `event:${eventId}:${session.state.day}:${session.state.phaseIndex}`;
  }

  private presentedSceneDefinition(session: GameSession, registry = this.runtimeRegistry(session)) {
    return resolveSceneDefinition(session.state, registry, session.state.location);
  }

  private sceneKeyFor(session: GameSession, registry = this.runtimeRegistry(session)) {
    const scene = this.presentedSceneDefinition(session, registry);
    return `scene:${scene.id}:v${SCENE_CARD_CACHE_VERSION}:${session.state.day}:${session.state.phaseIndex}`;
  }

  private previewNextSceneId(state: GameSession["state"], action: GameAction, registry: ContentRegistry) {
    try {
      if (this.isFrontierAction(action, registry)) {
        return undefined;
      }
      if (this.isNarrativeContinuation(action, registry)) {
        return undefined;
      }
      const previewState = structuredClone(state);
      performAction(previewState, action);
      return previewState.sceneId;
    } catch {
      return undefined;
    }
  }

  private presentedChoices(
    session: GameSession,
    scene = this.presentedSceneDefinition(session),
    registry = this.runtimeRegistry(session),
  ) {
    return resolveStoryFrame(session.state, registry, {
      scene,
      resolveNextSceneId: (action) => this.previewNextSceneId(session.state, action, registry),
    }).choices;
  }

  private buildActionCatalog(session: GameSession, registry = this.runtimeRegistry(session)): ActionChoice[] {
    return buildActionCatalogFromStoryChoices(this.presentedChoices(session, this.presentedSceneDefinition(session, registry), registry));
  }

  private async ensureLocationCard(session: GameSession, locationId: string, registry: ContentRegistry) {
    const definition = registry.locations[locationId];
    const expectedImagePath = definition?.imagePath ?? null;
    const expectedName = definition?.name ?? "";
    const expectedSummary = definition?.summary ?? "";
    const expectedMapPosition = definition?.mapPosition;
    const existing = session.world.locationCards[locationId];
    if (
      existing &&
      existing.imagePath === expectedImagePath &&
      existing.name === expectedName &&
      existing.summary === expectedSummary &&
      sameAxialCoord(existing.mapPosition, expectedMapPosition)
    ) {
      return existing;
    }

    if (!locationId.startsWith("dyn_")) {
      const cached = await this.repository.getTemplate("locationCards", locationId);
      if (
        cached &&
        (cached as LocationCard).imagePath === expectedImagePath &&
        (cached as LocationCard).name === expectedName &&
        (cached as LocationCard).summary === expectedSummary &&
        sameAxialCoord((cached as LocationCard).mapPosition, expectedMapPosition)
      ) {
        session.world.locationCards[locationId] = cached as LocationCard;
        return cached;
      }
    }

    const cardRaw = await this.templateGenerator.generateLocationCard(locationId, {
      ...this.generatorInput(session, false, registry),
    });
    // LLM이 id를 바꾸면 클라이언트가 state.location과 매칭하지 못해 씬·선택지가 통째로 안 그려진다.
    const card = { ...cardRaw, id: locationId };
    session.world.locationCards[locationId] = card;

    if (!locationId.startsWith("dyn_")) {
      await this.repository.saveTemplate("locationCards", locationId, card);
    }
    await this.repository.appendGenerationLog({
      gameId: session.id,
      kind: "locationCard",
      id: locationId,
      at: nowIso(),
      source: card.source,
    });
    return card;
  }

  private async ensurePersonCard(session: GameSession, personId: string, registry: ContentRegistry) {
    if (session.world.personCards[personId]) {
      return session.world.personCards[personId];
    }

    if (!personId.startsWith("dyn_")) {
      const cached = await this.repository.getTemplate("personCards", personId);
      if (cached) {
        session.world.personCards[personId] = cached as PersonCard;
        return cached;
      }
    }

    const cardRaw = await this.templateGenerator.generatePersonCard(personId, {
      ...this.generatorInput(session, false, registry),
    });
    const card = { ...cardRaw, id: personId };
    session.world.personCards[personId] = card;

    if (!personId.startsWith("dyn_")) {
      await this.repository.saveTemplate("personCards", personId, card);
    }
    await this.repository.appendGenerationLog({
      gameId: session.id,
      kind: "personCard",
      id: personId,
      at: nowIso(),
      source: card.source,
    });
    return card;
  }

  private async ensureItemCard(session: GameSession, itemId: string, registry: ContentRegistry) {
    if (session.world.itemCards[itemId]) {
      session.world.itemCards[itemId] = this.withRuntimeItemFields(session.world.itemCards[itemId] as ItemCard, itemId, registry);
      return session.world.itemCards[itemId];
    }

    if (!itemId.startsWith("dyn_")) {
      const cached = await this.repository.getTemplate("itemCards", itemId);
      if (cached) {
        const card = this.withRuntimeItemFields(cached as ItemCard, itemId, registry);
        session.world.itemCards[itemId] = card;
        return card;
      }
    }

    const cardRaw = await this.templateGenerator.generateItemCard(itemId, {
      ...this.generatorInput(session, false, registry),
    });
    const card = this.withRuntimeItemFields({ ...cardRaw, id: itemId }, itemId, registry);
    session.world.itemCards[itemId] = card;

    if (!itemId.startsWith("dyn_")) {
      await this.repository.saveTemplate("itemCards", itemId, card);
    }
    await this.repository.appendGenerationLog({
      gameId: session.id,
      kind: "itemCard",
      id: itemId,
      at: nowIso(),
      source: card.source,
    });
    return card;
  }

  private withRuntimeItemFields(card: ItemCard, itemId: string, registry: ContentRegistry): ItemCard {
    const runtimeItem = registry.items[itemId] as { kind?: string; useMinutes?: number; maxDurability?: number } | undefined;
    return ItemCardSchema.parse({
      ...card,
      kind: runtimeItem?.kind ?? card.kind,
      useMinutes: runtimeItem?.useMinutes ?? card.useMinutes,
      maxDurability: runtimeItem?.maxDurability ?? card.maxDurability,
    });
  }

  private buildItemCatalog(registry: ContentRegistry): ItemCard[] {
    return Object.values(registry.items)
      .map((item) => {
        const staticItem = item as Omit<ItemCard, "source" | "generatedAt">;
        return ItemCardSchema.parse({
          ...staticItem,
        source: "template",
        generatedAt: "static",
        });
      })
      .sort((left, right) => {
        const kindCompare = left.kind.localeCompare(right.kind);
        return kindCompare !== 0 ? kindCompare : left.name.localeCompare(right.name);
      });
  }

  private async ensureProtagonistCard(session: GameSession) {
    const card = await this.templateGenerator.generateProtagonistCard({
      ...this.generatorInput(session, false),
    });
    session.world.protagonistCard = card;
    await this.repository.saveProtagonistTemplate(card);
    return card;
  }

  private buildAuthoringSceneCard(session: GameSession, storyMaterials: StoryMaterials, registry: ContentRegistry): SceneCard {
    const sceneDef = this.presentedSceneDefinition(session, registry);
    const storyChoices = this.presentedChoices(session, sceneDef, registry);
    return SceneCardSchema.parse({
      id: `scene:${sceneDef.id}:v${SCENE_CARD_CACHE_VERSION}:${session.state.day}:${session.state.phaseIndex}`,
      eventId: sceneDef.eventId,
      locationId: sceneDef.locationId,
      title: `${sceneDef.title} (${PHASES[session.state.phaseIndex]})`,
      paragraphs: [...sceneDef.paragraphs],
      introFlag: sceneDef.introFlag,
      choices: storyChoices,
      materialIds: {
        locationIds: storyMaterials.locations.map((entry) => entry.id),
        personIds: storyMaterials.people.map((entry) => entry.id),
        itemIds: storyMaterials.items.map((entry) => entry.id),
      },
      devSource: sceneDevSource(sceneDef),
      source: "template",
      generatedAt: nowIso(),
    });
  }

  private async ensureSceneCard(session: GameSession, registry: ContentRegistry) {
    const sceneKey = this.sceneKeyFor(session, registry);
    const storyMaterials = this.buildStoryMaterials(session, { includeProtagonist: true }, registry);
    const card = this.buildAuthoringSceneCard(session, storyMaterials, registry);
    const prev = session.world.sceneCards[sceneKey];
    const narrativeSignature = `${card.title}\n${card.paragraphs.join("\n")}`;
    const prevNarrativeSignature = prev ? `${prev.title}\n${prev.paragraphs.join("\n")}` : "";
    const choiceSig = card.choices.map((choice) => `${choice.id}:${choice.isAvailable ? "1" : "0"}`).join("|");
    const prevChoiceSig = prev?.choices.map((choice) => `${choice.id}:${choice.isAvailable ? "1" : "0"}`).join("|") ?? "";

    session.world.sceneCards[sceneKey] = card;

    if (!prev || narrativeSignature !== prevNarrativeSignature || choiceSig !== prevChoiceSig) {
      await this.repository.appendGenerationLog({
        gameId: session.id,
        kind: "sceneCard",
        id: sceneKey,
        at: nowIso(),
        source: card.source,
      });
    }
    return card;
  }

  private async ensureTriggeredEventCard(session: GameSession, locationId: string, registry: ContentRegistry) {
    const eventDef = resolveTriggeredEvents(session.state, locationId, registry)[0];
    if (!eventDef) {
      return null;
    }
    return this.ensureEventCardById(session, eventDef.id, registry);
  }

  private async ensureEventCardById(session: GameSession, eventId: string, registry: ContentRegistry) {
    const eventDef = registry.events[eventId] as EventDefinition | undefined;
    if (!eventDef) {
      return null;
    }

    const eventKey = this.eventKeyFor(eventId, session);
    if (session.world.eventCards[eventKey]?.choices?.length) {
      return session.world.eventCards[eventKey];
    }

    const storyChoices = resolveEventChoices(session.state, eventDef, registry).map(buildStoryChoiceFromChoice);
    const card = await this.templateGenerator.generateEventCard(eventDef, storyChoices, {
      ...this.generatorInput(session, true, registry),
    });
    session.world.eventCards[eventKey] = card;
    session.state.flags[`event_seen_${eventId}`] = true;
    await this.repository.appendGenerationLog({
      gameId: session.id,
      kind: "eventCard",
      id: eventKey,
      at: nowIso(),
      source: card.source,
    });
    return card;
  }

  private buildStoryMaterials(
    session: GameSession,
    options: { includeProtagonist: boolean },
    registry = this.runtimeRegistry(session),
  ): StoryMaterials {
    const currentLocation = session.world.locationCards[session.state.location];
    const location = currentLocation ? [currentLocation] : [];
    const localPersonIds = this.currentLocation(session, registry).residentIds;
    const people = localPersonIds
      .map((personId) => session.world.personCards[personId])
      .filter(Boolean) as PersonCard[];
    const itemIds = new Set<string>(Object.keys(session.state.inventory));
    this.currentLocation(session, registry).obtainableItemIds.forEach((itemId) => itemIds.add(itemId));
    people.forEach((person) => {
      person.inventoryItemIds.forEach((itemId) => itemIds.add(itemId));
    });
    const items = Array.from(itemIds)
      .map((itemId) => session.world.itemCards[itemId])
      .filter(Boolean) as ItemCard[];
    const protagonist = options.includeProtagonist
      ? (session.world.protagonistCard as ProtagonistCard)
      : ({
          id: "protagonist",
          name: "Unnamed Survivor",
          summary: "A survivor trying to make the next day possible.",
          inventoryItemIds: Object.keys(session.state.inventory),
          usableSkillIds: [...session.state.skills],
          condition: {
            hp: session.state.stats.hp,
            mind: session.state.stats.mind,
            energy: session.state.stats.energy,
            money: session.state.money,
            locationId: session.state.location,
            day: session.state.day,
            phaseIndex: session.state.phaseIndex,
          },
          source: "template",
          generatedAt: nowIso(),
        } satisfies ProtagonistCard);

    return {
      locations: location,
      people,
      items,
      protagonist,
    };
  }

  private buildMapEntries(session: GameSession, registry = this.runtimeRegistry(session)): MapEntry[] {
    refreshLocationKnowledge(session.state);
    const allLocationIds = Object.keys(registry.locations);
    const currentLocation = this.currentLocation(session, registry);
    const currentLinks = currentLocation.links;
    return allLocationIds.map((locationId) => {
      const targetLocation = getRuntimeLocationDefinition(session.state, registry, locationId);
      const link = currentLinks[locationId];
      const isCurrent = locationId === session.state.location;
      const isInActiveRealm = isLocationInActiveRealm(session.state, targetLocation);
      const isKnown = isInActiveRealm && (
        Boolean(session.state.flags[`known_${locationId}`]) ||
        Boolean(session.state.flags[`visited_${locationId}`]) ||
        isCurrent
      );
      const routePath = isCurrent ? [locationId] : (resolveTravelPath(session.state, locationId, registry) ?? []);
      const routeDistance = routePath.length > 1 ? routePath.length - 1 : 0;
      const travelMinutes = routeDistance * TRAVEL_MINUTES_PER_ROUTE;
      const hasPositionPair = Boolean(currentLocation.mapPosition && targetLocation.mapPosition);
      const isAdjacent = !isCurrent && (
        hasPositionPair
          ? isHexNeighbor(currentLocation.mapPosition, targetLocation.mapPosition)
          : Boolean(link)
      );
      const hasRoute = Boolean(link);
      const isReachable = !isCurrent && routeDistance > 0;
      const incomingRoutes = Object.keys(registry.locations)
        .filter((sourceId) => Boolean(getRuntimeLocationDefinition(session.state, registry, sourceId).links[locationId]))
        .map((sourceId) => ({
          sourceId,
          link: getRuntimeLocationDefinition(session.state, registry, sourceId).links[locationId],
          sourceAccessible: sourceId === session.state.location || Boolean(session.state.flags[`visited_${sourceId}`]),
        }))
        .filter((route) => route.sourceAccessible);
      const hasUnlockedKnownRoute = incomingRoutes.some(
        (route) => !route.link.requiredFlag || Boolean(session.state.flags[route.link.requiredFlag]),
      );
      const blockedRoute = incomingRoutes.find(
        (route) => route.link.requiredFlag && !session.state.flags[route.link.requiredFlag],
      );
      const isControlled = !isCurrent && !isReachable && !hasUnlockedKnownRoute && Boolean(blockedRoute);
      const reason = !hasRoute && isAdjacent
        ? "인접하지만 아직 확인된 이동 경로가 없다."
        : blockedRoute
          ? (blockedRoute.link.blockedReason || "That route is still blocked.")
          : "";

      return {
        locationId,
        isCurrent,
        isVisible: isKnown,
        isKnown,
        isVisited: Boolean(session.state.flags[`visited_${locationId}`]) || isCurrent,
        isAdjacent,
        isReachable,
        routeDistance,
        travelMinutes,
        routePath,
        isControlled,
        reason,
      };
    });
  }

  private buildSurvivalGoal(session: GameSession, registry = this.runtimeRegistry(session)) {
    return {
      targetDay: TARGET_RESCUE_DAY,
      daysRemaining: Math.max(0, TARGET_RESCUE_DAY - session.state.day),
      signalReady: Boolean(session.state.flags.rescue_signal_ready),
      signalParts: SIGNAL_PART_ITEM_IDS.map((itemId) => ({
        itemId,
        name: String((registry.items[itemId] as { name?: string } | undefined)?.name ?? itemId),
        owned: Boolean(session.state.flags.rescue_signal_ready) || (session.state.inventory[itemId] ?? 0) > 0,
      })),
    };
  }

  private buildQuestRequirements(session: GameSession, quest: QuestDefinition, registry = this.runtimeRegistry(session)) {
    const requirementMap = new Map<string, number>();
    const addRequirement = (itemId: string, amount = 1) => {
      requirementMap.set(itemId, Math.max(requirementMap.get(itemId) ?? 0, amount));
    };

    quest.requiredItems.forEach((requirement) => {
      addRequirement(requirement.itemId, requirement.amount);
    });
    quest.objectives.forEach((objective) => {
      if (objective.type === "obtain_item") {
        addRequirement(objective.itemId, objective.amount);
      }
    });

    if (requirementMap.size === 0) {
      return [];
    }

    const isCompleted = session.state.quests[quest.id] === "completed";

    return Array.from(requirementMap.entries()).map(([itemId, amount]) => {
      const actualAmount = session.state.inventory[itemId] ?? 0;
      const ownedAmount = isCompleted ? amount : actualAmount;
      return {
        itemId,
        name: String((registry.items[itemId] as { name?: string } | undefined)?.name ?? itemId),
        amount,
        ownedAmount,
        met: ownedAmount >= amount,
      };
    });
  }

  private itemDisplayName(registry: ContentRegistry, itemId: string) {
    return String((registry.items[itemId] as { name?: string } | undefined)?.name ?? itemId);
  }

  private buildCraftingRecipe(
    session: GameSession,
    choice: StoryChoice,
    registry: ContentRegistry,
  ): CraftingRecipe | undefined {
    const effect = CRAFTING_RECIPE_EFFECTS[choice.id];
    if (!effect) {
      return undefined;
    }

    const requirements = (choice.conditions ?? []).flatMap((condition) => {
      if (condition.type !== "has_item") {
        return [];
      }

      const ownedAmount = session.state.inventory[condition.itemId] ?? 0;
      return [{
        itemId: condition.itemId,
        name: this.itemDisplayName(registry, condition.itemId),
        requiredAmount: condition.amount,
        ownedAmount,
        met: ownedAmount >= condition.amount,
      }];
    });

    const prerequisites = (CRAFTING_RECIPE_PREREQUISITES[choice.id] ?? []).map((prerequisite) => ({
      label: prerequisite.label,
      met: Boolean(session.state.flags[prerequisite.flag]),
    }));

    return {
      actionLabel: choice.id.startsWith("cook_")
        ? "요리"
        : choice.id.startsWith("brew_")
          ? "연금"
          : "제작",
      effect,
      prerequisites,
      requirements,
    };
  }

  private shouldShowShelterCraftingAction(session: GameSession, action: ActionChoice) {
    if (action.id !== "assemble_rescue_radio") {
      return true;
    }

    return session.state.quests.prepare_rescue_signal === "active" &&
      !session.state.flags.rescue_signal_ready;
  }

  private buildAvailableActions(
    session: GameSession,
    sceneDef: SceneDefinition,
    storyChoices: StoryChoice[],
    registry: ContentRegistry,
  ): ActionChoice[] {
    const actionCatalog = buildActionCatalogFromStoryChoices(storyChoices);
    if (!RECIPE_MENU_SCENE_IDS.includes(sceneDef.id)) {
      return actionCatalog;
    }

    const storyChoiceById = new Map(storyChoices.map((choice) => [choice.id, choice]));
    return actionCatalog.filter((action) => this.shouldShowShelterCraftingAction(session, action)).map((action) => {
      const storyChoice = storyChoiceById.get(action.id);
      const craftingRecipe = storyChoice
        ? this.buildCraftingRecipe(session, storyChoice, registry)
        : undefined;
      return craftingRecipe ? { ...action, craftingRecipe } : action;
    });
  }

  private buildSnapshot(session: GameSession, latestEvent: EventCard | null, registry = this.runtimeRegistry(session)): StateSnapshot {
    const storyMaterials = this.buildStoryMaterials(session, { includeProtagonist: true }, registry);
    const expeditionScene = buildSubwayExpeditionScene(session.state);
    const currentScene = expeditionScene
      ? resolveSceneCardText(expeditionScene, registry)
      : resolveSceneCardText(this.buildAuthoringSceneCard(session, storyMaterials, registry), registry);
    const presentedLatestEvent = latestEvent
      ? resolveEventCardText(latestEvent, registry)
      : null;
    const sceneDef = this.presentedSceneDefinition(session, registry);
    const locationChoices = this.presentedChoices(session, sceneDef, registry);
    const storyChoices = session.state.isGameOver
      ? []
      : latestEvent && latestEvent.choices.length > 0
        ? latestEvent.choices
        : locationChoices;
    const clientState = structuredClone(session.state);
    clientState.subwayExpedition.preparedNextFloor = null;
    clientState.subwayExpedition.runPlan = null;
    clientState.subwayExpedition.storyMemory = {
      facts: [],
      unresolvedThreads: [],
      resolvedThreads: [],
      recentSummaries: [],
      lastBridge: "",
    };
    clientState.subwayExpedition.currentFloor?.majorEvent.options.forEach((option) => {
      delete option.outcomes;
    });
    clientState.subwayExpedition.currentFloor?.lootSpots.forEach((spot) => {
      if (!clientState.subwayExpedition.currentFloorProgress.searchedLootSpotIds.includes(spot.id)) {
        spot.contents = [];
        delete spot.resultParagraphs;
      }
    });
    const snapshot = {
      gameId: session.id,
      state: clientState,
      currentScene,
      visibleLocations: this.visibleLocationIds(session).map(
        (locationId) => session.world.locationCards[locationId] as LocationCard,
      ).filter(Boolean),
      visiblePeople: this.visiblePersonIds(session, registry).map(
        (personId) => session.world.personCards[personId] as PersonCard,
      ),
      inventoryCards: Object.keys(session.state.inventory).map(
        (itemId) => this.withRuntimeItemFields(session.world.itemCards[itemId] as ItemCard, itemId, registry),
      ),
      itemCatalog: this.buildItemCatalog(registry),
      protagonist: session.world.protagonistCard as ProtagonistCard,
      storyMaterials,
      quests: getQuestDefinitions(registry).map((quest) => ({
        id: quest.id,
        name: quest.title,
        summary: quest.description,
        status: session.state.quests[quest.id] ?? "inactive",
        requirements: this.buildQuestRequirements(session, quest, registry),
      })),
      skills: getSkillEntries().filter((skill) => session.state.skills.includes(skill.id)),
      availableActions: (expeditionScene
        ? buildSubwayExpeditionActions(session.state)
        : this.buildAvailableActions(session, sceneDef, storyChoices, registry))
        .map((choice) => resolveActionChoiceText(choice, registry)),
      mapEntries: this.buildMapEntries(session, registry),
      latestEvent: presentedLatestEvent,
      devLlmTrace: getDevLlmTrace(session.id),
      survivalGoal: this.buildSurvivalGoal(session, registry),
    };

    return StateSnapshotSchema.parse(snapshot);
  }

  private narrativeTriggerForAction(action: GameAction, registry: ContentRegistry) {
    if (action.type === "content_action") {
      const definition = registry.actions[action.actionId];
      if (!definition?.tags?.includes("continuation")) {
        return null;
      }
      return {
        kind: "action" as const,
        id: definition.id,
        label: definition.label,
        outcomeHint: definition.outcomeHint,
        tags: [...definition.tags],
      };
    }

    if (action.type === "content_choice") {
      const definition = registry.choices[action.choiceId];
      if (!definition?.tags?.includes("continuation")) {
        return null;
      }
      return {
        kind: "choice" as const,
        id: definition.id,
        label: definition.label,
        outcomeHint: definition.outcomeHint,
        tags: [...(definition.tags ?? [])],
      };
    }

    return null;
  }

  private isNarrativeContinuation(action: GameAction, registry: ContentRegistry) {
    return Boolean(this.narrativeTriggerForAction(action, registry));
  }

  private frontierTriggerForAction(action: GameAction, registry: ContentRegistry) {
    if (action.type === "content_action") {
      const definition = registry.actions[action.actionId];
      if (!definition?.tags?.includes("frontier")) {
        return null;
      }
      return {
        kind: "action" as const,
        id: definition.id,
        label: definition.label,
        outcomeHint: definition.outcomeHint,
      };
    }

    if (action.type === "content_choice") {
      const definition = registry.choices[action.choiceId];
      if (!definition?.tags?.includes("frontier")) {
        return null;
      }
      return {
        kind: "choice" as const,
        id: definition.id,
        label: definition.label,
        outcomeHint: definition.outcomeHint,
      };
    }

    return null;
  }

  private narrativeStateHash(state: GameSession["state"]) {
    const stockState = Object.fromEntries(
      Object.entries(state.stockState)
        .filter(([key]) => key.includes(state.location))
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    const flags = Object.fromEntries(
      Object.entries(state.flags)
        .filter(([key]) => key.startsWith("dyn_") || key.includes(state.location))
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    const inventory = Object.fromEntries(
      Object.entries(state.inventory).sort(([left], [right]) => left.localeCompare(right)),
    );
    const quests = Object.fromEntries(
      Object.entries(state.quests).sort(([left], [right]) => left.localeCompare(right)),
    );
    const anchorMemory = state.narrativeState.anchors[state.location] ?? null;

    return createHash("sha1").update(JSON.stringify({
      location: state.location,
      sceneId: state.sceneId,
      day: state.day,
      phaseIndex: state.phaseIndex,
      inventory,
      quests,
      flags,
      stockState,
      activeStockNodeId: state.activeStockNodeId,
      anchorMemory,
    })).digest("hex").slice(0, 16);
  }

  private narrativeCacheKey(gameId: string, sceneId: string, triggerId: string, stateHash: string) {
    return `${gameId}:${sceneId}:${triggerId}:${stateHash}`;
  }

  private reserveNarrativeSequence(session: GameSession) {
    const sequence = session.state.narrativeState.nextBeatSequence;
    session.state.narrativeState.nextBeatSequence += 1;
    return sequence;
  }

  private clearNarrativeCacheEntry(session: GameSession, key: string) {
    if (!session.state.narrativeState.pregenerated[key]) {
      return;
    }
    delete session.state.narrativeState.pregenerated[key];
  }

  private prunePregeneratedNarrativeBeats(session: GameSession, maxEntries = 8) {
    const entries = Object.values(session.state.narrativeState.pregenerated)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    while (entries.length > maxEntries) {
      const oldest = entries.shift();
      if (!oldest) {
        break;
      }
      delete session.state.narrativeState.pregenerated[oldest.key];
    }
  }

  private mergeAnchorMemory(session: GameSession, memory?: GameSession["state"]["narrativeState"]["anchors"][string]) {
    if (!memory) {
      return;
    }

    const existing = session.state.narrativeState.anchors[memory.locationId];
    session.state.narrativeState.anchors[memory.locationId] = {
      ...existing,
      ...memory,
      subareaIds: Array.from(new Set([...(existing?.subareaIds ?? []), ...memory.subareaIds])),
      openThreadIds: Array.from(new Set([...(existing?.openThreadIds ?? []), ...memory.openThreadIds])),
      frontierExitIds: Array.from(new Set([...(existing?.frontierExitIds ?? []), ...memory.frontierExitIds])),
      worldFacts: Array.from(new Set([...(existing?.worldFacts ?? []), ...memory.worldFacts])),
      unresolvedQuestions: Array.from(new Set([...(existing?.unresolvedQuestions ?? []), ...memory.unresolvedQuestions])),
      tone: memory.tone || existing?.tone || "",
      tension: memory.tension ?? existing?.tension ?? "medium",
      dramaticQuestion: memory.dramaticQuestion || existing?.dramaticQuestion || "",
      lastDirectorSummary: memory.lastDirectorSummary || existing?.lastDirectorSummary || "",
    };
  }

  private buildNarrativeRequest(
    session: GameSession,
    action: GameAction,
    registry: ContentRegistry,
    sequence: number,
  ): { key: string; stateHash: string; request: NarrativeContinuationRequest } {
    const trigger = this.narrativeTriggerForAction(action, registry);
    if (!trigger) {
      throw new Error("Not a narrative continuation trigger.");
    }

    const scene = this.presentedSceneDefinition(session, registry);
    const location = this.currentLocation(session, registry);
    const anchorMemory = session.state.narrativeState.anchors[session.state.location];
    const stateHash = this.narrativeStateHash(session.state);
    const localSceneIds = Object.values(registry.scenes)
      .filter((entry) => entry.locationId === session.state.location)
      .map((entry) => entry.id);
    const lineageSceneIds = session.state.narrativeState.history
      .filter((entry) => entry.locationId === session.state.location)
      .slice(-6)
      .map((entry) => entry.sceneId);
    const request: NarrativeContinuationRequest = {
      gameId: session.id,
      locationId: session.state.location,
      anchorLocationId: session.state.location,
      anchorLocationName: location.name,
      anchorSummary: anchorMemory?.anchorSummary ?? location.summary,
      sourceSceneId: scene.id,
      sourceSceneTitle: scene.title,
      sourceSceneParagraphs: [...scene.paragraphs],
      trigger,
      recentLog: session.state.log.slice(-6).map((entry) => entry.message),
      inventoryItemIds: Object.keys(session.state.inventory),
      activeQuestIds: Object.entries(session.state.quests)
        .filter(([, status]) => status === "active")
        .map(([questId]) => questId),
      localSceneIds,
      localPeopleIds: [...location.residentIds],
      localStockNodeIds: location.stockNodes.map((node) => node.id),
      localSubareaIds: [...(anchorMemory?.subareaIds ?? [])],
      localOpenThreadIds: [...(anchorMemory?.openThreadIds ?? [])],
      knownWorldFacts: [...(anchorMemory?.worldFacts ?? [])],
      unresolvedQuestions: [...(anchorMemory?.unresolvedQuestions ?? [])],
      storyTone: anchorMemory?.tone ?? "",
      currentTension: anchorMemory?.tension ?? "medium",
      dramaticQuestion: anchorMemory?.dramaticQuestion ?? "",
      lineageSceneIds,
      sequence,
    };

    return {
      key: this.narrativeCacheKey(session.id, scene.id, trigger.id, stateHash),
      stateHash,
      request,
    };
  }

  private applyGeneratedStoryBeat(session: GameSession, beat: GeneratedStoryBeat, triggerLabel: string, registry: ContentRegistry) {
    const previousState = structuredClone(session.state);
    const currentScene = this.presentedSceneDefinition(session, registry);
    if (currentScene.introFlag && !session.state.flags[currentScene.introFlag]) {
      session.state.flags[currentScene.introFlag] = true;
    }

    session.state.dynamicContent = mergeDynamicWorldRegistry(session.state.dynamicContent, beat.patch.registry);
    beat.patch.immediateEffects.forEach((effect) => applyEffect(effect, session.state));
    session.state.sceneId = beat.patch.sceneId;
    refreshLocationKnowledge(session.state);
    syncQuestState(session.state, previousState.quests);
    syncScene(session.state, beat.patch.sceneId);
    applySystemNote(previousState, session.state, triggerLabel);
    this.mergeAnchorMemory(session, beat.anchorMemory);
    session.state.narrativeState.history.push({
      beatId: beat.id,
      locationId: beat.locationId,
      sceneId: beat.patch.sceneId,
      sourceSceneId: beat.sourceSceneId,
      triggerId: beat.sourceTriggerId,
      at: nowIso(),
    });
    session.state.narrativeState.history = session.state.narrativeState.history.slice(-24);
    session.world.sceneCards = {};
  }

  private narrativeContinuationChoices(session: GameSession, registry = this.runtimeRegistry(session)) {
    const scene = this.presentedSceneDefinition(session, registry);
    return this.presentedChoices(session, scene, registry)
      .filter((choice) => choice.tags?.includes("continuation"));
  }

  private async performNarrativeContinuation(session: GameSession, action: GameAction, registry: ContentRegistry) {
    const preview = this.buildNarrativeRequest(session, action, registry, 1);
    const cached = session.state.narrativeState.pregenerated[preview.key];
    const { key, request, stateHash } = cached
      ? preview
      : this.buildNarrativeRequest(session, action, registry, this.reserveNarrativeSequence(session));

    const beat = cached
      ? cached.beat
      : compileSceneDraftForRuntime(
          session.id,
          {
            ...request,
            state: session.state,
            registry,
          },
          await this.planner.generateSceneDraft({
            ...request,
            state: session.state,
            registry,
          }),
        );
    const trigger = this.narrativeTriggerForAction(action, registry);
    if (!trigger) {
      throw new Error("Narrative trigger metadata is missing.");
    }

    this.clearNarrativeCacheEntry(session, key);
    this.applyGeneratedStoryBeat(session, beat, trigger.label, registry);
    session.updatedAt = nowIso();

    const nextRegistry = this.runtimeRegistry(session);
    await this.ensureCards(session);
    await this.repository.appendGenerationLog({
      gameId: session.id,
      kind: cached ? "generatedStoryBeatCacheHit" : "generatedStoryBeat",
      id: beat.id,
      at: session.updatedAt,
      locationId: beat.locationId,
      sourceSceneId: beat.sourceSceneId,
      triggerId: beat.sourceTriggerId,
      stateHash,
    });
    await this.repository.appendActionLog({
      gameId: session.id,
      action,
      at: session.updatedAt,
      location: session.state.location,
      day: session.state.day,
    });
    return this.buildSnapshot(session, null, nextRegistry);
  }

  private async preGenerateNarrativeBeats(gameId: string) {
    const preparation = await this.withGameMutation(gameId, async () => {
      const session = await this.repository.loadGame(gameId);
      const registry = this.runtimeRegistry(session);
      const candidates = this.narrativeContinuationChoices(session, registry).slice(0, 1);
      if (candidates.length === 0) {
        return null;
      }

      const pending = candidates
        .map((choice) => {
          const action = choice.serverActionHint;
          if (!this.isNarrativeContinuation(action, registry)) {
            return null;
          }
          const sequence = this.reserveNarrativeSequence(session);
          const built = this.buildNarrativeRequest(session, action, registry, sequence);
          if (session.state.narrativeState.pregenerated[built.key]) {
            return null;
          }
          return built;
        })
        .filter(Boolean) as Array<{ key: string; stateHash: string; request: NarrativeContinuationRequest }>;

      if (pending.length === 0) {
        return null;
      }

      session.updatedAt = nowIso();
      await this.repository.saveGame(session);
      return {
        pending,
        state: structuredClone(session.state),
        registry,
      };
    });
    if (!preparation) {
      return;
    }

    for (const entry of preparation.pending) {
      try {
        const plannerRequest = {
          ...entry.request,
          state: preparation.state,
          registry: preparation.registry,
        };
        const beat = compileSceneDraftForRuntime(
          gameId,
          plannerRequest,
          await this.planner.generateSceneDraft(plannerRequest),
        );
        await this.withGameMutation(gameId, async () => {
          const latest = await this.repository.loadGame(gameId);
          latest.state.narrativeState.pregenerated[entry.key] = {
            key: entry.key,
            locationId: entry.request.locationId,
            sourceSceneId: entry.request.sourceSceneId,
            triggerId: entry.request.trigger.id,
            stateHash: entry.stateHash,
            createdAt: nowIso(),
            beat,
          };
          this.prunePregeneratedNarrativeBeats(latest);
          latest.updatedAt = nowIso();
          await this.repository.appendGenerationLog({
            gameId,
            kind: "generatedStoryBeatPregenerated",
            id: beat.id,
            at: latest.updatedAt,
            locationId: beat.locationId,
            sourceSceneId: beat.sourceSceneId,
            triggerId: beat.sourceTriggerId,
          });
          await this.repository.saveGame(latest);
        });
      } catch {
        continue;
      }
    }
  }

  private followUpEventId(action: GameAction, registry: ContentRegistry) {
    if (action.type === "content_action") {
      return registry.actions[action.actionId]?.nextEventId || null;
    }
    if (action.type === "content_choice") {
      return registry.choices[action.choiceId]?.nextEventId || null;
    }
    return null;
  }

  private isExploreAction(action: GameAction, registry: ContentRegistry) {
    if (action.type !== "content_action") {
      return false;
    }
    return registry.actions[action.actionId]?.type === "explore";
  }

  private isFrontierAction(action: GameAction, registry: ContentRegistry) {
    return Boolean(this.frontierTriggerForAction(action, registry));
  }

  private buildFrontierFallbackEvent(
    session: GameSession,
    frontier: { id: string; label: string; outcomeHint: string },
  ) {
    return EventCardSchema.parse({
      id: `event:frontier-fallback:${frontier.id}:${session.state.day}:${session.state.phaseIndex}`,
      locationId: session.state.location,
      title: "앞쪽은 아직 닫혀 있다",
      summary: "길을 더 밀고 들어가 보려 했지만, 무너진 잔해와 불안한 기척 탓에 지금은 무리해서 넘을 수 없다는 판단이 선다.",
      trigger: `${session.state.day} / ${PHASES[session.state.phaseIndex]}`,
      choices: [],
      rewards: [],
      flags: [],
      source: "template",
      generatedAt: nowIso(),
    });
  }

  private async expandFrontier(session: GameSession, action: GameAction, registry: ContentRegistry) {
    const frontier = this.frontierTriggerForAction(action, registry);
    if (!frontier) {
      throw new Error("Unknown frontier action.");
    }

    const existingSlot = session.state.frontierState.slots[frontier.id];
    if (existingSlot?.generatedLocationId && registry.locations[existingSlot.generatedLocationId]) {
      performAction(session.state, { type: "travel", targetId: existingSlot.generatedLocationId });
      session.updatedAt = nowIso();
      await this.ensureCards(session);
      return this.buildSnapshot(session, null);
    }

    const sourceLocationId = session.state.location;
    const slot = existingSlot ?? {
      actionId: frontier.id,
      sourceLocationId,
      generatedLocationId: null,
      note: frontier.outcomeHint,
      status: "unexpanded" as const,
      lastExpandedDay: null,
    };

    let latestEvent: EventCard | null = null;
    try {
      const plannerInput = {
        gameId: session.id,
        state: session.state,
        registry,
        sourceLocationId,
        sourceFrontierActionId: frontier.id,
        sequence: session.state.frontierState.nextSequence,
        recentLog: session.state.log.slice(0, 6).map((entry) => entry.message),
      };
      const pkg = compileAnchorDraftForRuntime(
        session.id,
        plannerInput,
        await this.planner.generateAnchorDraft(plannerInput),
      );

      session.state.dynamicContent = mergeDynamicWorldRegistry(session.state.dynamicContent, pkg.registry);
      this.mergeAnchorMemory(session, pkg.anchorMemory);
      session.state.frontierState.nextSequence += 1;
      session.state.frontierState.slots[frontier.id] = {
        ...slot,
        generatedLocationId: pkg.locationId,
        status: "expanded",
        lastExpandedDay: session.state.day,
        note: frontier.outcomeHint,
      };

      session.state.worldPlan.today = {
        day: session.state.day,
        regions: [
          ...session.state.worldPlan.today.regions.filter((region) => region.locationId !== pkg.locationId),
          buildPlannedRegionSummary(
            {
              gameId: session.id,
              state: session.state,
              registry,
              sourceLocationId,
              sourceFrontierActionId: frontier.id,
              sequence: session.state.frontierState.nextSequence - 1,
              recentLog: session.state.log.slice(0, 6).map((entry) => entry.message),
            },
            pkg,
          ),
        ],
        notes: [...session.state.worldPlan.today.notes],
      };

      if (!session.state.worldPlan.tomorrow || session.state.worldPlan.tomorrow.day !== session.state.day + 1) {
        session.state.worldPlan.tomorrow = {
          day: session.state.day + 1,
          evolutions: [],
          notes: [],
        };
      }
      if (pkg.tomorrowEvolution) {
        session.state.worldPlan.tomorrow.evolutions = [
          ...session.state.worldPlan.tomorrow.evolutions.filter((evolution) => evolution.id !== pkg.tomorrowEvolution?.id),
          pkg.tomorrowEvolution,
        ];
        session.state.worldPlan.tomorrow.notes = [
          ...session.state.worldPlan.tomorrow.notes,
          pkg.tomorrowEvolution.summary,
        ];
      }

      session.state.location = pkg.locationId;
      session.state.activeStockNodeId = null;
      session.state.flags[`visited_${pkg.locationId}`] = true;
      refreshLocationKnowledge(session.state);
      syncQuestState(session.state);
      syncScene(session.state);
      session.updatedAt = nowIso();

      const nextRegistry = this.runtimeRegistry(session);
      if (pkg.entryEventId) {
        latestEvent = await this.ensureEventCardById(session, pkg.entryEventId, nextRegistry);
      }
      await this.ensureCards(session);
      await this.repository.appendGenerationLog({
        gameId: session.id,
        kind: "generatedRegionPackage",
        id: pkg.locationId,
        at: session.updatedAt,
        sourceLocationId,
        frontierActionId: frontier.id,
      });
      await this.repository.appendActionLog({
        gameId: session.id,
        action,
        at: session.updatedAt,
        location: session.state.location,
        day: session.state.day,
      });
      return this.buildSnapshot(session, latestEvent, nextRegistry);
    } catch (error) {
      session.state.frontierState.slots[frontier.id] = {
        ...slot,
        status: "blocked",
        note: frontier.outcomeHint,
      };
      session.state.systemNote = "앞쪽 길은 아직 안전하지 않다.";
      await this.ensureCards(session);
      return this.buildSnapshot(session, this.buildFrontierFallbackEvent(session, frontier), registry);
    }
  }
}
