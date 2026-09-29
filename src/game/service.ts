import { advanceConversation, conversationObstacle, interruptConversation } from "./text-world/conversation-flow";
import { conversationOptions } from "./text-world/conversation-options";
import { learnChoice } from "./text-world/choice-director";
import { resolveWorldActions, recordEvent as recordConversationEvent } from "./text-world/engine";
import { directNarrative, rememberNarration } from "./text-world/perception";
import { fallbackNarration } from "./text-world/narrator";
import { choiceLabelFields } from "./text-world/choice-labels";
import { recordEvent } from "./text-world/events";
import { worldDeparturePlan } from "./text-world/departure";
import { isSubwayStockMenuAction } from "./text-world/subway-stock";
import { nearbyWorldNpc, residentAtConversationLocation, npcWorldContext } from "./text-world/observers";
import { runtimeSocialProfile, performNpcSocialAction, validateNpcSocialAction } from "./npc-social";
import { questProgressFields } from "./quest-guidance";
import { activityConditionState, localWorkEnvironment } from "./work-environment";
import { planActivity } from "./activity";
import { materialSourceHints } from "./material-guidance";
import { formatOutcomeHint } from "./outcome-hint";
import { spatialCombatActive, spatialCombatUpgrade } from "./text-world/combat-options";
import { performCombatWorldAction, performCombatInventoryAction, renderSpatialCombat } from "./text-world/expedition-combat";
import { playerItemIds } from "./item-ledgers";
import { ensureSubwayWorld, subwayJourneyOption, currentTextWorld, explorationInteractions, performTextWorldAction, textWorldActions, textWorldEntryActions, textWorldScene } from "./text-world";
import { currentObservation, markAction, observeAction, recordActionTiming, type ActionObserver } from "./action-observation";
import { reconcileWorldInventory } from "./text-world/interactions";
import { ensureConvenienceWorld } from "./text-world/convenience";
import { ensureLocationWorld, hasLocationWorld } from "./text-world/location-world";
import { inventoryLightControls, performInventoryLightAction } from "./text-world/inventory-lights";
import { narrateTextWorld, type TextWorldNarrator } from "./text-world/narrator";
import { conditionCards } from "./health-conditions";
import { forecastShelterSleep } from "./rules";
import { createHash, randomUUID } from "node:crypto";
import { GAME_MINUTE_MS, PHASES, SIGNAL_PART_ITEM_IDS, TARGET_RESCUE_DAY, TRAVEL_DURATION_MS, getSkillEntries } from "./base-data";
import {
  buildStoryChoiceFromChoice,
  resolveEventChoices,
  resolveSceneDefinition,
  resolveTriggeredEvents,
} from "./content-engine";
import { createTemplateContentGenerator, type ContentGenerator } from "./content-generator";
import {
  appendDevLlmTraceForGame,
  clearDevLlmTrace,
  getDevLlmTrace,
} from "./dev-llm-trace";
import { resolveItemText } from "./item-text";
import { compileAnchorDraftForRuntime, compileSceneDraftForRuntime } from "./narrative-expansion-service";
import {
  getNpcDialogueProfile,
} from "./data/npc-dialogue-profiles";
import {
  applyNpcDialogueGeneration,
  buildNpcDialogueActions,
  buildNpcDialogueScene,
  buildNpcDialogueStartAction,
  leaveNpcDialogue,
  nextNpcDialogueTurn,
  npcDialogueMemory,
  selectNpcDialogueChoice,
} from "./npc-dialogue";
import {
  generateNpcDialogue,
  type NpcDialogueGenerationResult,
  type NpcDialogueGenerator,
  type NpcDialogueWorldContext,
} from "./npc-dialogue-pipeline";
import type { GameRepository } from "./repository";
import {
  applySystemNote,
  consumeCurrentSceneIntro,
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
import { buildSkillProgressCards } from "./skill-progression";
import { buildActionCatalogFromStoryChoices, resolveStoryFrame } from "./story-flow";
import { setSystemNote } from "./system-note";
import {
  acknowledgeSubwayBanditResult,
  beginSubwayBanditEncounter,
  beginSubwaySituation,
  resolveSubwayBanditChoice,
  setSubwayEncounterGeneration,
} from "./subway-encounter";
import {
  fallbackSubwayEncounterGeneration,
  generateSubwayEncounterScene,
  type SubwayEncounterGenerationResult,
  type SubwayEncounterSceneGenerator,
} from "./subway-encounter-generator";
import {
  acknowledgeSubwayResult,
  ascendSubwayFloor,
  buildSubwayExpeditionActions,
  buildSubwayExpeditionScene,
  completeSubwayFloor,
  descendSubwayFloor,
  resolveSubwayFloorEvent,
  returnFromSubwayExpedition,
  searchSubwayLootSpot,
  startSubwayExpedition,
} from "./subway-expedition";
import {
  applySubwayUpgrade,
} from "./subway-roguelike";
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
import {
  EventCardSchema,
  ItemCardSchema,
  SceneCardSchema,
  StateSnapshotSchema,
} from "./schemas";
import { buildPlannedRegionSummary, createWorldPlanner, type WorldPlanner } from "./world-planner";

const runtimeNpcDialogueProfile = runtimeSocialProfile;

function nowIso() {
  return new Date().toISOString();
}

export function syncItemCardWithRuntimeDefinition(
  card: ItemCard,
  itemId: string,
  registry: ContentRegistry,
): ItemCard {
  const runtimeItem = registry.items[itemId] as Omit<ItemCard, "source" | "generatedAt"> | undefined;
  if (!runtimeItem) {
    return ItemCardSchema.parse(card);
  }

  return ItemCardSchema.parse({
    ...runtimeItem,
    id: itemId,
    source: card.source,
    generatedAt: card.generatedAt,
  });
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
  craft_wood_plank: "거처 보강과 시설·도구 제작 재료",
  craft_firewood: "요리에 쓰는 연료 4개",
  craft_shelter_wall_patch: "잠자기 후 체력과 정신력 회복량 증가",
  craft_shelter_brazier: "거처에서 {{item:hotMeal}} 조리 가능",
  craft_shelter_rain_bucket: "하루에 한 번 물 한 병 확보 가능",
  craft_crude_axe: "숲에서 벌목 효율 증가, 내구도 8",
  craft_utility_knife: "숲에서 식량 수색 효율 증가, 내구도 10",
  craft_dented_pot: "거처 요리 가능, 내구도 12",
  cook_at_shelter: "+1 정신력 / +6 기력",
  cook_rice_porridge: "+1 정신력 / +4 기력",
  cook_grilled_fish: "+3 기력",
  assemble_rescue_radio: "10일차 구조 신호 준비",
  brew_mana_potion: "MP +4",
  craft_rune_compass: "마법도시의 숨은 길 탐색",
};

const CRAFTING_RECIPE_PREREQUISITES: Record<string, Array<{ flag: string; label: string }>> = {
  cook_at_shelter: [{ flag: "shelter_brazier", label: "간이 화로" }],
  cook_rice_porridge: [{ flag: "shelter_brazier", label: "간이 화로" }],
  cook_grilled_fish: [
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
    private readonly encounterSceneGenerator: SubwayEncounterSceneGenerator =
      generateSubwayEncounterScene,
    private readonly npcDialogueGenerator: NpcDialogueGenerator =
      generateNpcDialogue,
    private readonly textWorldNarrator: TextWorldNarrator = narrateTextWorld,
  ) {}

  private async generateAndApplySubwayEncounter(
    gameId: string,
    state: GameSession["state"],
    latestServerResult?: Parameters<SubwayEncounterSceneGenerator>[0]["latestServerResult"],
  ) {
    if(state.subwayExpedition.spatialMode && state.subwayExpedition.currentFloorProgress.encounter?.kind==="combat"){await renderSpatialCombat(state,this.runtimeRegistry({state}),this.textWorldNarrator,gameId,latestServerResult);return;}
    const input = { gameId, state, latestServerResult };
    let generation: SubwayEncounterGenerationResult;
    const startedAt = Date.now();
    try {
      generation = await this.encounterSceneGenerator(input);
    } catch (error) {
      generation = fallbackSubwayEncounterGeneration(
        input,
        error,
        Date.now() - startedAt,
      );
      appendDevLlmTraceForGame(gameId, {
        scope: "subway",
        target: `nf-director:fallback:${state.subwayExpedition.depth}`,
        stage: "fallback",
        model: "server-template",
        status: "fallback",
        request: "",
        response: "",
        message:
          `NF 생성 실패 후 서버 fallback 적용 · ${generation.diagnostics.latencyMs}ms`,
        errorReason: generation.diagnostics.errorReason ?? undefined,
      });
    }
    setSubwayEncounterGeneration(state, generation);
    const encounter = state.subwayExpedition.currentFloorProgress.encounter;
    await this.repository.appendGenerationLog({
      gameId,
      kind: "subwayEncounterNarrative",
      encounterId: encounter?.id,
      turnNumber: encounter?.turnNumber,
      source: generation.scene.source,
      latencyMs: generation.diagnostics.latencyMs,
      repairedFieldCount: generation.diagnostics.repairedFieldCount,
      droppedChoiceCount: generation.diagnostics.droppedChoiceCount,
      fallback: generation.diagnostics.fallback,
      errorReason: generation.diagnostics.errorReason,
      at: nowIso(),
    });
    return generation;
  }

  private npcDialogueContext(session: GameSession, npcId: string): NpcDialogueWorldContext {
    const location = this.currentLocation(session), profile = runtimeNpcDialogueProfile(npcId, this.runtimeRegistry(session));
    const actor = npcWorldContext(currentTextWorld(session.state), npcId);
    return { actor, location: { id: location.id, name: location.name, summary: location.summary, sceneTitle: location.name, sceneParagraphs: actor ? [actor.placement] : profile?.visibleDetails ?? [] },
      player: { day: session.state.day, phase: PHASES[session.state.phaseIndex] ?? "unknown", recentLog: [] } };
  }
  private npcDialogueStartActions(
    session: GameSession,
    registry = this.runtimeRegistry(session),
  ): ActionChoice[] {
    if (
      session.state.isGameOver ||
      session.state.subwayExpedition.active ||
      session.state.npcDialogue.active
    ) {
      return [];
    }
    const location = this.currentLocation(session, registry);
    return location.residentIds.flatMap((npcId) => {
      const profile = runtimeNpcDialogueProfile(npcId, registry);
      if (!profile || profile.homeLocationId !== location.id || !residentAtConversationLocation(currentTextWorld(session.state), npcId) || conversationObstacle(session.state, currentTextWorld(session.state), npcId)) {
        return [];
      }
      return [buildNpcDialogueStartAction(profile)];
    });
  }

  private async startWorldConversation(session: GameSession, state: GameSession["state"], action: Extract<GameAction,{type:"text_world"}>, registry: ContentRegistry) {
    const world = currentTextWorld(state);
    if (!world?.active || world.revision !== action.revision) throw new Error("상황이 바뀌었습니다. 현재 선택지를 다시 골라 주세요.");
    const option = conversationOptions(world,state,registry).find(o=>o.id===action.optionId);
    if (!option) throw new Error("현재 위치에서는 이 인물과 대화할 수 없습니다.");
    const before = structuredClone(world);
    world.events=[];
    world.lastIntent={id:option.id,label:option.label,thought:choiceLabelFields(world,option).choiceThought,importance:"major"};
    const result=resolveWorldActions(world,state,option.actions);
    const obstacle=conversationObstacle(state,world,option.npcId);
    if (result.interrupted || result.discovery || obstacle) {
      if(!world.events.some(e=>e.type==="STOPPED"))recordConversationEvent(world,{type:"STOPPED",targetId:option.nodeId,reason:obstacle??"다가가는 사이 상대와 거리가 벌어져 말을 건네지 못한다.",before:{},after:{}});
      const context=directNarrative(world),narration=fallbackNarration(context);
      world.lastParagraphs=narration.paragraphs;world.lastParagraphSources=narration.paragraphs.map(()=>"template");world.source="template";world.sceneRevision++;
      rememberNarration(world,context,narration.usedFactIds,narration.paragraphs);
    } else {
      const profile=runtimeNpcDialogueProfile(option.npcId,registry)!;
      const memory=npcDialogueMemory(state,profile.id);
      const context=this.npcDialogueContext({...session,state},profile.id);
      if(option.actions.length)context.approachParagraph=profile.name+" 곁으로 다가가 말을 건넨다.";
      const generation=await this.npcDialogueGenerator({gameId:session.id,profile,context,memory,visitCount:memory.visitCount+1,turnNumber:nextNpcDialogueTurn(memory),selectedChoice:null});
      if(context.approachParagraph){generation.scene.outcomeParagraph=context.approachParagraph;if(generation.scene.source==="llm")generation.scene.source="mixed";}
      applyNpcDialogueGeneration(state,generation,{newVisit:true});
      learnChoice(state,before,option);
      world.recentScenes=[...world.recentScenes,{zone:world.player.zone,intent:option.label,paragraphs:[...(generation.scene.outcomeParagraph?[generation.scene.outcomeParagraph]:[]),generation.scene.situation,generation.scene.dialogue]}].slice(-3);
      await this.repository.appendGenerationLog({gameId:session.id,kind:"npcDialogue",npcId:profile.id,turnNumber:generation.scene.turnNumber,source:generation.scene.source,fallback:generation.diagnostics.fallback,errors:generation.diagnostics.errors,latencyMs:generation.diagnostics.latencyMs,at:nowIso()});
    }
    world.revision++;
    applySystemNote(session.state,state);
  }

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
    if (state.location !== "subway" || !state.subwayExpedition.active && state.textWorld?.active && state.textWorld.player.zone !== "concourse" || state.isGameOver || state.stageClear) {
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
    if (expedition.exploredFloors[String(currentFloor.depth + 1)]) return null;
    const progress = expedition.currentFloorProgress;
    if (!progress.eventResolved && !progress.encounter?.resolution) {
      return null;
    }
    return {
      runNumber: expedition.runNumber,
      sourceFloorId: currentFloor.id,
      targetDepth: currentFloor.depth + 1,
      previousOutcome:
        `${currentFloor.title}의 핵심 상황을 해결했다. 실제 결과는 '${
          expedition.lastOutcome ||
          progress.eventOutcome ||
          progress.encounter?.history.at(-1)?.result.summary ||
          "상황을 해결했다."
        }'이다.`,
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
      prepared.floor.situationKind === "combat" &&
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
      knownActors: [],
      unresolvedThreads: [...runPlan.unresolvedThreads],
      resolvedThreads: [],
      recentSummaries: [],
      lastBridge: "",
    };
  }

  private backgroundGenerationEnabled() {
    return process.env.ENABLE_LLM_BACKGROUND_GENERATION === "true";
  }

  private ensurePreparedSubwayTemplate(session: GameSession) {
    const context = this.subwayPreparationContext(session.state);
    const expedition = session.state.subwayExpedition;
    if (!context) {
      const changed = expedition.preparedNextFloor !== null;
      expedition.preparedNextFloor = null;
      expedition.nextFloorStatus = "idle";
      expedition.nextFloorError = "";
      if (!expedition.active) {
        expedition.runPlan = null;
      }
      return changed;
    }
    if (this.isMatchingPreparedSubwayFloor(session, context)) {
      const expectedStatus = expedition.active && this.backgroundGenerationEnabled() && !expedition.preparedNextFloor?.llmAttempted ? "generating" : "ready";
      if (expedition.nextFloorStatus === "idle" || !this.backgroundGenerationEnabled() && expedition.nextFloorStatus !== "ready") {
        expedition.nextFloorStatus = expectedStatus;
        expedition.nextFloorError = "";
        return true;
      }
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
    expedition.nextFloorStatus = expedition.active && this.backgroundGenerationEnabled() ? "generating" : "ready";
    expedition.nextFloorError = "";
    return true;
  }

  private takePreparedSubwayFloor(session: GameSession) {
    const context = this.subwayPreparationContext(session.state);
    if (!this.isMatchingPreparedSubwayFloor(session, context)) {
      return null;
    }
    const expedition = session.state.subwayExpedition;
    const prepared = expedition.preparedNextFloor;
    if (!prepared || !context || expedition.nextFloorStatus !== "ready") {
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
    // Spending a request on an unchosen floor must be an explicit opt-in.
    if (!this.backgroundGenerationEnabled()) return;
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
      .catch((error) => this.markSubwayNextFloorFailed(
        session.id,
        context,
        prepared.contextHash,
        error,
      ))
      .finally(() => {
        if (this.subwayFloorGenerationTasks.get(taskKey) === task) {
          this.subwayFloorGenerationTasks.delete(taskKey);
        }
      });
    this.subwayFloorGenerationTasks.set(taskKey, task);
  }

  private async markSubwayNextFloorFailed(
    gameId: string,
    context: {
      runNumber: number;
      sourceFloorId: string;
      targetDepth: number;
    },
    contextHash: string,
    error: unknown,
  ) {
    await this.withGameMutation(gameId, async () => {
      const latest = await this.repository.loadGame(gameId);
      const latestContext = this.subwayPreparationContext(latest.state);
      const prepared = latest.state.subwayExpedition.preparedNextFloor;
      if (
        !latestContext ||
        latestContext.runNumber !== context.runNumber ||
        latestContext.sourceFloorId !== context.sourceFloorId ||
        latestContext.targetDepth !== context.targetDepth ||
        !prepared ||
        prepared.contextHash !== contextHash
      ) {
        return;
      }
      latest.state.subwayExpedition.nextFloorStatus = "failed";
      latest.state.subwayExpedition.nextFloorError =
        error instanceof Error ? error.message : String(error);
      if (context.sourceFloorId === "subway-concourse") {
        latest.state.subwayExpedition.nextFloorStatus = "ready";
      }
      latest.updatedAt = nowIso();
      await this.repository.saveGame(latest);
    });
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
        floor.situationKind !== "combat" ||
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
      latest.state.subwayExpedition.nextFloorStatus = "ready";
      latest.state.subwayExpedition.nextFloorError = "";
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
    if (session.state.stateWorld) throw new Error("상태 기반 월드 화면에서 이어가 주세요.");
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

  async performAction(gameId: string, action: GameAction, observer: ActionObserver = {}) {
    return observeAction(observer, () => this.withGameMutation(gameId, () => {
      markAction("queueMs");
      return this.performActionUnlocked(gameId, action);
    }));
  }

  async recoverAction(gameId: string, requestId: string) {
    return this.withGameMutation(gameId, async () => {
      const session = await this.repository.loadGame(gameId);
      const world = currentTextWorld(session.state);
      const dialogue = session.state.npcDialogue.lastRequest;
      const turn = session.state.npcDialogue.active?.turnNumber ?? session.state.npcDialogue.conversations[dialogue?.npcId ?? ""]?.exchanges.at(-1)?.turnNumber ?? -1;
      if (dialogue?.id === requestId && dialogue.turnNumber === turn) return this.buildSnapshot(session, null);
      return world?.lastRequest?.id === requestId && world.lastRequest.revision === world.revision ? this.buildSnapshot(session, null) : null;
    });
  }

  private async performActionUnlocked(gameId: string, action: GameAction) {
    const session = await this.repository.loadGame(gameId);
    if (session.state.stateWorld) throw new Error("상태 기반 월드 화면에서 이어가 주세요.");
    markAction("loadMs");
    const requestId = currentObservation()?.observer.requestId;
    const actionKey = action.type === "text_world" ? JSON.stringify([action.type, action.command, action.optionId ?? null, action.revision ?? null]) : action.type === "npc_dialogue" ? JSON.stringify([action.type, action.command, action.npcId, action.choiceId ?? null, action.itemId ?? null, action.offerId ?? null, action.turnNumber ?? null]) : "";
    const dialogueReceipt = session.state.npcDialogue.lastRequest;
    if (action.type === "npc_dialogue" && requestId && dialogueReceipt?.id === requestId) {
      const turn = session.state.npcDialogue.active?.turnNumber ?? session.state.npcDialogue.conversations[dialogueReceipt.npcId]?.exchanges.at(-1)?.turnNumber ?? -1;
      if (dialogueReceipt.actionKey !== actionKey || dialogueReceipt.turnNumber !== turn) throw new Error("이미 처리된 요청과 현재 행동이 다릅니다.");
      recordActionTiming({ replayed: true });return this.buildSnapshot(session, null);
    }
    const existingWorld = currentTextWorld(session.state);
    if (action.type === "text_world" && requestId && existingWorld?.lastRequest?.id === requestId) {
      if (existingWorld.lastRequest.actionKey !== actionKey || existingWorld.lastRequest.revision !== existingWorld.revision) throw new Error("이미 처리된 요청과 현재 행동이 다릅니다. 장면을 다시 확인해 주세요.");
      recordActionTiming({ replayed: true });
      return this.buildSnapshot(session, null);
    }
    delete session.state.npcDialogue.departure;
    if (session.state.lastActivity && ["text_world", "npc_dialogue", "subway_expedition"].includes(action.type)) delete session.state.lastActivity.paragraphs;
    const previousDay = session.state.day;
    const registry = this.runtimeRegistry(session);
    const journey = subwayJourneyOption(session.state, action, registry);

    if (
      session.state.npcDialogue.active &&
      action.type !== "npc_dialogue"
    ) {
      throw new Error("현재 대화를 먼저 마쳐야 합니다.");
    }

    if (session.state.location === "subway" && isSubwayStockMenuAction(action, registry)) throw new Error("현재 탐색 장면에 표시된 선택지를 골라 주세요.");

    if (session.state.location === "subway" && session.state.textWorld?.active && !(["text_world", "item_light", "travel", "use_item"].includes(action.type)) && !(action.type === "subway_expedition" && action.command === "choose_upgrade" && spatialCombatUpgrade(session.state)) && !(action.type === "npc_dialogue" && (session.state.npcDialogue.active?.npcId === action.npcId || nearbyWorldNpc(session.state.textWorld, action.npcId)))) {
      throw new Error("현재 위치에서 가능한 선택지를 골라 주세요.");
    }

    if (currentTextWorld(session.state)?.active && hasLocationWorld(session.state, registry) &&
      (action.type === "content_action" || action.type === "content_choice")) {
      throw new Error("현재 탐색 장면에 표시된 선택지를 골라 주세요.");
    }

    if (action.type === "item_light" || action.type === "use_item" && spatialCombatActive(session.state)) {
      const workingState = structuredClone(session.state);
      if(spatialCombatActive(workingState))await performCombatInventoryAction(workingState,action,registry,this.textWorldNarrator,gameId);
      else if(action.type==="item_light")performInventoryLightAction(workingState, action);
      session.state = workingState;
      session.updatedAt = nowIso();
      syncQuestState(session.state);
      syncScene(session.state);
      await this.replanTomorrowIfNeeded(session, previousDay);
      await this.ensureCards(session);
      await this.repository.appendActionLog({ gameId, action, at: session.updatedAt, location: session.state.location, day: session.state.day });
      const snapshot = this.buildSnapshot(session, null);
      await this.repository.saveGame(session);
      return snapshot;
    }

    if (action.type === "text_world" && !journey) {
      const workingState = structuredClone(session.state);
      if (action.command === "choose" && action.optionId?.startsWith("talk:")) await this.startWorldConversation(session, workingState, action, registry);
      else if(spatialCombatActive(workingState))await performCombatWorldAction(workingState,action,registry,this.textWorldNarrator,gameId);
      else await performTextWorldAction(workingState, action, gameId, this.textWorldNarrator, registry.textRooms, registry);
      session.state = workingState;
      session.updatedAt = nowIso();
      session.world.sceneCards = {};
      syncQuestState(session.state);
      syncScene(session.state);
      await this.replanTomorrowIfNeeded(session, previousDay);
      await this.ensureCards(session);
      const completedWorld = currentTextWorld(session.state);
      if (requestId && completedWorld) completedWorld.lastRequest = { id: requestId, actionKey, revision: completedWorld.revision };
      await this.repository.appendActionLog({ gameId, action, at: session.updatedAt, location: session.state.location, day: session.state.day });
      const snapshot = this.buildSnapshot(session, null);
      const saveStarted = performance.now();
      await this.repository.saveGame(session);
      recordActionTiming({ saveMs: Math.round(performance.now() - saveStarted) });
      return snapshot;
    }

    if (action.type === "npc_dialogue") {
      if (session.state.isGameOver) {
        throw new Error(
          session.state.gameOverReason || "이미 게임오버 상태입니다.",
        );
      }
      if (session.state.subwayExpedition.active) {
        throw new Error("심층 탐험 중에는 NPC와 대화할 수 없습니다.");
      }
      const profile = runtimeNpcDialogueProfile(action.npcId, registry);
      if (!profile) {
        throw new Error("대화할 수 없는 인물입니다.");
      }
      const workingState = structuredClone(session.state);
      let generation: NpcDialogueGenerationResult | null = null;

      const conversationWorld = currentTextWorld(workingState);
      if (conversationWorld?.active) conversationWorld.events = [];
      const stop = (reason: string, completed: string[] = []) => interruptConversation(workingState, conversationWorld, profile.id, reason, completed);
      if (action.command === "start") {
        if (workingState.npcDialogue.active) throw new Error("이미 다른 대화를 진행 중입니다.");
        const location = this.currentLocation(session, registry);
        if (profile.homeLocationId !== workingState.location || !residentAtConversationLocation(conversationWorld, profile.id)
          || (!conversationWorld?.active && !location.residentIds.includes(profile.id))) throw new Error("현재 위치에서는 이 인물과 대화할 수 없습니다.");
        const obstacle = advanceConversation(workingState, conversationWorld, profile.id, 0);
        if (obstacle) stop(obstacle);
        else {
          const memory = npcDialogueMemory(workingState, profile.id);
          generation = await this.npcDialogueGenerator({ gameId, profile, context: this.npcDialogueContext({...session,state:workingState},profile.id),
            memory, visitCount: memory.visitCount + 1, turnNumber: nextNpcDialogueTurn(memory), selectedChoice: null });
          applyNpcDialogueGeneration(workingState, generation, {newVisit:true});
        }
      } else if (action.command === "give" || action.command === "trade") {
        validateNpcSocialAction(workingState, action, registry);
        const obstacle = advanceConversation(workingState, conversationWorld, profile.id, 0);
        if (obstacle) stop(obstacle);
        else {
          const socialOutcome = performNpcSocialAction(workingState, action, registry);
          const interrupted = conversationObstacle(workingState, conversationWorld, profile.id);
          if (interrupted) stop(interrupted, [socialOutcome.paragraph]);
          else {
            const memory = npcDialogueMemory(workingState, profile.id);
            generation = await this.npcDialogueGenerator({ gameId, profile, context: this.npcDialogueContext({...session,state:workingState},profile.id), memory,
              socialOutcome, visitCount: memory.visitCount, turnNumber: nextNpcDialogueTurn(memory), selectedChoice: { id: "social:" + action.command + ":" + action.turnNumber, label: socialOutcome.paragraph } });
            generation.scene.outcomeParagraph = socialOutcome.paragraph;
            applyNpcDialogueGeneration(workingState, generation, {newVisit:false});
          }
        }
      } else if (action.command === "choose") {
        const selectedChoice = selectNpcDialogueChoice(workingState, profile.id, action.choiceId, action.turnNumber);
        const obstacle = advanceConversation(workingState, conversationWorld, profile.id);
        if (obstacle) stop(obstacle);
        else {
          const memory = npcDialogueMemory(workingState, profile.id);
          generation = await this.npcDialogueGenerator({ gameId, profile, context: this.npcDialogueContext({...session,state:workingState},profile.id), memory,
            visitCount: memory.visitCount, turnNumber: nextNpcDialogueTurn(memory), selectedChoice });
          applyNpcDialogueGeneration(workingState, generation, {newVisit:false});
        }
      } else {
        if (workingState.npcDialogue.active?.npcId !== profile.id) throw new Error("현재 이 인물과 대화하고 있지 않습니다.");
        const obstacle = advanceConversation(workingState, conversationWorld, profile.id, 0);
        if (obstacle) stop(obstacle);
        else leaveNpcDialogue(workingState, profile.id, profile.name);
      }
      applySystemNote(session.state, workingState);
      if (action.command === "start" || action.command === "leave") {
        consumeCurrentSceneIntro(workingState);
        syncScene(workingState);
      }

      if (conversationWorld?.active) {
        conversationWorld.revision++;
        if (generation) conversationWorld.recentScenes = [...conversationWorld.recentScenes, { zone: conversationWorld.player.zone, intent: profile.name + "와 대화한다", paragraphs: [...(generation.scene.outcomeParagraph ? [generation.scene.outcomeParagraph] : []), generation.scene.situation, generation.scene.dialogue] }].slice(-3);
        if (action.command === "leave" && !workingState.npcDialogue.departure?.reason) {
          conversationWorld.lastParagraphs = workingState.npcDialogue.departure!.paragraphs;
          conversationWorld.lastParagraphSources = conversationWorld.lastParagraphs.map(()=>"template");
          conversationWorld.source = "template";conversationWorld.sceneRevision++;
        }
      }
      if (requestId) workingState.npcDialogue.lastRequest = { id: requestId, actionKey, npcId: profile.id, turnNumber: workingState.npcDialogue.active?.turnNumber ?? npcDialogueMemory(workingState, profile.id).exchanges.at(-1)?.turnNumber ?? -1 };
      session.state = workingState;
      session.updatedAt = nowIso();
      session.world.sceneCards = {};
      syncQuestState(session.state);
      syncScene(session.state);
      await this.replanTomorrowIfNeeded(session, previousDay);
      await this.ensureCards(session);
      if (generation) {
        await this.repository.appendGenerationLog({
          gameId,
          kind: "npcDialogue",
          npcId: profile.id,
          turnNumber: generation.scene.turnNumber,
          source: generation.scene.source,
          fallback: generation.diagnostics.fallback,
          errors: generation.diagnostics.errors,
          latencyMs: generation.diagnostics.latencyMs,
          at: session.updatedAt,
        });
      }
      await this.repository.appendActionLog({
        gameId,
        action,
        at: session.updatedAt,
        location: session.state.location,
        day: session.state.day,
      });
      const snapshot = this.buildSnapshot(session, null);
      await this.repository.saveGame(session);
      return snapshot;
    }

    if (
      session.state.subwayExpedition.active &&
      action.type !== "subway_expedition" &&
      action.type !== "use_item" && !journey
    ) {
      throw new Error("심층 탐험 중에는 현재 경로를 선택하거나 지상으로 귀환해야 합니다.");
    }

    if (
      journey || action.type === "subway_expedition" ||
      (action.type === "content_action" && action.actionId === "start_subway_expedition")
    ) {
      const subwayAction = action.type === "subway_expedition"
        ? action
        : { type: "subway_expedition" as const, command: journey?.subwayCommand ?? "start" as const };
      if (subwayAction.command === "start") {
        if (session.state.textWorld?.active && !journey) throw new Error("지하층 계단 앞에 표시된 선택지를 골라 주세요.");
        this.ensurePreparedSubwayTemplate(session);
        const prepared = this.takePreparedSubwayFloor(session);
        if (!prepared) {
          throw new Error("준비된 지하 1층을 불러오지 못했습니다.");
        }
        const workingState = structuredClone(session.state);
        if (workingState.textWorld) {
          const world = workingState.textWorld;
          world.events = [];
          world.lastIntent = { id: journey?.id ?? "journey", label: journey?.label ?? "지하층으로 내려간다", importance: "major" };
          recordEvent(world, { type: "LEAVE", targetId: journey?.nodeId, before: { zone: world.player.zone }, after: { zone: "subway-depth", name: "지하 1층" } });
          world.active = false;
          world.revision++;
        }
        await startSubwayExpedition(
          workingState,
          gameId,
          prepared.floor,
          prepared.runPlan,
        );
        if (
          workingState.subwayExpedition.active &&
          workingState.subwayExpedition.depth === 1 &&
          workingState.subwayExpedition.currentFloor
        ) {
          beginSubwayBanditEncounter(workingState);
          await this.generateAndApplySubwayEncounter(gameId, workingState);
        }
        session.state = workingState;
        await this.repository.appendGenerationLog({
          gameId,
          kind: "subwayFloorPregeneratedCacheHit",
          id: prepared.floor.id,
          depth: prepared.floor.depth,
          source: prepared.floor.source,
          storage: "persistent",
          at: nowIso(),
        });
      } else if (subwayAction.command === "encounter_choice") {
        if (!subwayAction.optionId) {
          throw new Error("선택지 ID가 없습니다.");
        }
        const workingState = structuredClone(session.state);
        const result = resolveSubwayBanditChoice(
          workingState,
          subwayAction.optionId,
          subwayAction.turnNumber,
        );
        await this.generateAndApplySubwayEncounter(gameId, workingState, result);
        session.state = workingState;
      } else if (subwayAction.command === "acknowledge_encounter") {
        acknowledgeSubwayBanditResult(session.state);
      } else if (subwayAction.command === "choose_upgrade") {
        if (!subwayAction.optionId) {
          throw new Error("선택할 전투 스킬 ID가 없습니다.");
        }
        applySubwayUpgrade(session.state, subwayAction.optionId);
      } else if (subwayAction.command === "choose" || subwayAction.command === "resolve_event") {
        resolveSubwayFloorEvent(session.state, subwayAction.optionId);
      } else if (subwayAction.command === "acknowledge_result") {
        acknowledgeSubwayResult(session.state);
      } else if (subwayAction.command === "search_loot") {
        searchSubwayLootSpot(session.state, subwayAction.lootSpotId);
      } else if (subwayAction.command === "finish_floor") {
        completeSubwayFloor(session.state);
      } else if (subwayAction.command === "ascend") {
        ascendSubwayFloor(session.state);
      } else if (subwayAction.command === "descend") {
        const visited=session.state.subwayExpedition.exploredFloors[String(session.state.subwayExpedition.depth+1)];
        this.ensurePreparedSubwayTemplate(session);
        const prepared = this.takePreparedSubwayFloor(session);
        if (!prepared && !visited) {
          throw new Error("준비된 다음 지하층을 불러오지 못했습니다.");
        }
        const workingState = structuredClone(session.state);
        await descendSubwayFloor(workingState, gameId, prepared?.floor);
        if(workingState.subwayExpedition.active && !workingState.subwayExpedition.currentFloorProgress.eventResolved){beginSubwaySituation(workingState);await this.generateAndApplySubwayEncounter(gameId, workingState);}
        session.state = workingState;
        if(prepared) await this.repository.appendGenerationLog({gameId,kind:"subwayFloorPregeneratedCacheHit",id:prepared.floor.id,depth:prepared.floor.depth,source:prepared.floor.source,storage:"persistent",at:nowIso()});
      } else if (subwayAction.command === "return") {
        returnFromSubwayExpedition(session.state);
        await ensureSubwayWorld(session.state, registry, this.textWorldNarrator, gameId, session.state.subwayExpedition.lastOutcome);
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
      if (journey && requestId && session.state.textWorld) session.state.textWorld.lastRequest = { id: requestId, actionKey, revision: session.state.textWorld.revision };
      const snapshot = this.buildSnapshot(session, null);
      await this.repository.saveGame(session);
      this.scheduleSubwayNextFloor(session);
      return snapshot;
    }

    if (this.isFrontierAction(action, registry)) {
      if (session.state.lastActivity) delete session.state.lastActivity.paragraphs;
      const snapshot = await this.expandFrontier(session, action, registry);
      await this.repository.saveGame(session);
      void this.preGenerateNarrativeBeats(gameId).catch(() => undefined);
      return snapshot;
    }

    if (this.isNarrativeContinuation(action, registry)) {
      if (session.state.lastActivity) delete session.state.lastActivity.paragraphs;
      const snapshot = await this.performNarrativeContinuation(session, action, registry);
      await this.repository.saveGame(session);
      void this.preGenerateNarrativeBeats(gameId).catch(() => undefined);
      return snapshot;
    }

    const activityDefinition = action.type === "content_choice" ? registry.choices[action.choiceId] : action.type === "content_action" ? registry.actions[action.actionId] : undefined;
    if (activityDefinition?.activity && (action.type === "content_choice" || action.type === "content_action")) {
      if (action.activityRevision !== session.state.activityRevision) throw new Error("작업 상황이 바뀌었습니다. 현재 선택지를 다시 골라 주세요.");
      const frame = resolveStoryFrame(session.state, registry);
      if (!frame.choices.some(choice => choice.id === activityDefinition.id && choice.isAvailable))
        throw new Error("현재 장면에서는 이 작업을 시작할 수 없습니다.");
    }
    const followUpEventId = this.followUpEventId(action, registry);
    performAction(session.state, action);
    session.updatedAt = nowIso();
    session.world.sceneCards = {};

    await this.replanTomorrowIfNeeded(session, previousDay);
    const nextRegistry = this.runtimeRegistry(session);
    if (action.type === "travel" && session.state.location === "subway") await ensureSubwayWorld(session.state, nextRegistry, this.textWorldNarrator, session.id, undefined, true);

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
      inventoryCards: playerItemIds(session.state).map((itemId) => session.world.itemCards[itemId]),
      inventoryLights: inventoryLightControls(session.state),
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
    reconcileWorldInventory(session.state);
    await ensureSubwayWorld(session.state, registry, this.textWorldNarrator, session.id);
    await ensureConvenienceWorld(session.state, registry, this.textWorldNarrator, session.id);
    await ensureLocationWorld(session.state, registry, this.textWorldNarrator, session.id);
    const visibleLocationIds = this.visibleLocationIds(session);
    const allMapLocationIds = Object.keys(registry.locations);
    for (const locationId of new Set([...visibleLocationIds, ...allMapLocationIds])) {
      await this.ensureLocationCard(session, locationId, registry);
    }

    const visiblePersonIds = this.visiblePersonIds(session, registry);
    for (const personId of visiblePersonIds) {
      await this.ensurePersonCard(session, personId, registry);
    }

    const itemIds = new Set<string>(playerItemIds(session.state));
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
    if (!currentTextWorld(session.state)?.active) await this.ensureSceneCard(session, registry);
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
    return buildActionCatalogFromStoryChoices(
      this.presentedChoices(session, this.presentedSceneDefinition(session, registry), registry),
      session.state,
    );
  }

  private async ensureLocationCard(session: GameSession, locationId: string, registry: ContentRegistry) {
    if (session.state.contentVersionId && registry.locations[locationId]) {
      const card = await this.templateGenerator.generateLocationCard(locationId, this.generatorInput(session, false, registry));
      session.world.locationCards[locationId] = card;
      return card;
    }
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
    if (session.state.contentVersionId && registry.people[personId]) {
      const card = { ...(registry.people[personId] as Omit<PersonCard, "source" | "generatedAt">), source: "template" as const, generatedAt: nowIso() };
      session.world.personCards[personId] = card;
      return card;
    }
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
      session.world.itemCards[itemId] = syncItemCardWithRuntimeDefinition(session.world.itemCards[itemId] as ItemCard, itemId, registry);
      return session.world.itemCards[itemId];
    }

    if (!itemId.startsWith("dyn_")) {
      const cached = await this.repository.getTemplate("itemCards", itemId);
      if (cached) {
        const card = syncItemCardWithRuntimeDefinition(cached as ItemCard, itemId, registry);
        session.world.itemCards[itemId] = card;
        return card;
      }
    }

    const cardRaw = await this.templateGenerator.generateItemCard(itemId, {
      ...this.generatorInput(session, false, registry),
    });
    const card = syncItemCardWithRuntimeDefinition({ ...cardRaw, id: itemId }, itemId, registry);
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
    // Player-specific data is persisted with the session by saveGame.
    // Writing it to the shared template store serializes unrelated games.
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

    const storyChoices = resolveEventChoices(session.state, eventDef, registry)
      .map((choice) => buildStoryChoiceFromChoice(choice, session.state));
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
    const blockedDeparture = worldDeparturePlan(session.state) === null;
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
      const isReachable = !isCurrent && !blockedDeparture && routeDistance > 0;
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
      const reason = blockedDeparture && !isCurrent ? "지상 출구까지의 통로가 막혀 있습니다. 먼저 문과 통로를 확인해 주세요." : !hasRoute && isAdjacent
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

  private itemDisplayName(registry: ContentRegistry, itemId: string) {
    return String((registry.items[itemId] as { name?: string } | undefined)?.name ?? itemId);
  }

  private buildCraftingRecipe(
    session: GameSession,
    choice: StoryChoice,
    registry: ContentRegistry,
  ): CraftingRecipe | undefined {
    const definition = choice.serverActionHint.type === "content_choice" ? registry.choices[choice.serverActionHint.choiceId] : choice.serverActionHint.type === "content_action" ? registry.actions[choice.serverActionHint.actionId] : undefined;
    if (definition?.activity?.kind === "rest") return undefined;
    const activity = definition ? planActivity(definition) : null;
    const producesSomething = choice.effects?.some(effect => effect.type === "add_item");
    const effect = CRAFTING_RECIPE_EFFECTS[choice.id] ?? (activity ? definition!.outcomeHint : producesSomething ? formatOutcomeHint(choice.effects ?? [], session.state) : undefined);
    if (!effect) {
      return undefined;
    }

    const requiredItems = new Map<string, number>(Object.entries(activity?.itemCosts ?? {}));
    for (const id of activity?.tools ?? []) requiredItems.set(id, Math.max(1, requiredItems.get(id) ?? 0));
    for (const condition of choice.conditions ?? []) if (condition.type === "has_item")
      requiredItems.set(condition.itemId, Math.max(condition.amount, requiredItems.get(condition.itemId) ?? 0));
    const materialInventory = definition ? activityConditionState(definition, session.state).inventory : session.state.inventory;
    const requirements = [...requiredItems].map(([itemId, requiredAmount]) => {
      const ownedAmount = materialInventory[itemId] ?? 0;
      const storedAmount = Math.max(0, ownedAmount - (session.state.inventory[itemId] ?? 0));
      return { itemId, name: this.itemDisplayName(registry, itemId), requiredAmount,
        sourceHints: ownedAmount < requiredAmount ? materialSourceHints(session.state, registry, itemId, RECIPE_MENU_SCENE_IDS) : [],
        ownedAmount, storedAmount, met: ownedAmount >= requiredAmount };
    });

    const prerequisites = (CRAFTING_RECIPE_PREREQUISITES[choice.id] ?? []).map((prerequisite) => ({
      label: prerequisite.label,
      met: Boolean(session.state.flags[prerequisite.flag]),
    }));

    const station = localWorkEnvironment(session.state, definition?.activity?.kind).station;
    return {
      actionLabel: definition?.activity?.kind === "cook" || choice.id.startsWith("cook_")
        ? "요리"
        : choice.id.startsWith("brew_")
          ? "연금"
          : "제작",
      effect: effect + (station ? " / " + station.name + "에서 작업 시간 " + Math.round((1 - station.durationMultiplier) * 100) + "% 단축" : ""),
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
    const actionCatalog = buildActionCatalogFromStoryChoices(storyChoices, session.state);
    if (!RECIPE_MENU_SCENE_IDS.includes(sceneDef.id)) {
      return actionCatalog;
    }

    const storyChoiceById = new Map(storyChoices.map((choice) => [choice.id, choice]));
    return actionCatalog.filter((action) => this.shouldShowShelterCraftingAction(session, action)).map((action) => {
      const storyChoice = storyChoiceById.get(action.id);
      const craftingRecipe = storyChoice
        ? this.buildCraftingRecipe(session, storyChoice, registry)
        : undefined;
      if (!craftingRecipe) return action;
      const definition = registry.choices[action.id] ?? registry.actions[action.id];
      const owned = definition?.conditions.some(condition => condition.type === "not_has_item" && (session.state.inventory[condition.itemId] ?? 0) >= condition.amount);
      const built = definition?.conditions.some(condition => condition.type === "flag_not" && session.state.flags[condition.flag]);
      const statusLabel = action.isAvailable ? "제작 가능" : owned ? "이미 보유" : built ? "이미 완성" : craftingRecipe.requirements.some(item=>!item.met) ? "재료 부족" : "조건 미충족";
      return { ...action, craftingRecipe, statusLabel };
    });
  }

  private buildSnapshot(session: GameSession, latestEvent: EventCard | null, registry = this.runtimeRegistry(session)): StateSnapshot {
    const storyMaterials = this.buildStoryMaterials(session, { includeProtagonist: true }, registry);
    const explorationScene = textWorldScene(session.state, registry);
    const expeditionScene = buildSubwayExpeditionScene(session.state);
    const activeDialogueProfile = runtimeNpcDialogueProfile(
      session.state.npcDialogue.active?.npcId ?? "", registry,
    );
    const dialogueScene = buildNpcDialogueScene(
      session.state,
      activeDialogueProfile,
    );
    let currentScene = explorationScene
      ? resolveSceneCardText(explorationScene, registry)
      : dialogueScene
      ? resolveSceneCardText(dialogueScene, registry)
      : expeditionScene
        ? resolveSceneCardText(expeditionScene, registry)
        : resolveSceneCardText(this.buildAuthoringSceneCard(session, storyMaterials, registry), registry);
    const activityScene = session.state.lastActivity;
    if (!explorationScene && !dialogueScene && !expeditionScene && activityScene?.paragraphs?.length) {
      currentScene = { ...currentScene, id: `activity:${activityScene.definitionId}:${activityScene.revision}`, title: { rest: "휴식", craft: "제작", cook: "요리", build: "설비 작업" }[activityScene.kind], paragraphs: activityScene.paragraphs, generatedAt: activityScene.generatedAt ?? session.createdAt, source: "template", devSource: undefined };
    }
    const presentedLatestEvent = dialogueScene
      ? null
      : latestEvent
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
    // The browser receives rendered observations and offered actions, never hidden entities or contents.
    delete clientState.stateWorld;
    clientState.textWorld = null;
    clientState.locationTextWorlds = {};
    delete clientState.choicePreferences;
    clientState.npcDialogue.conversations = {};
    delete clientState.npcDialogue.lastRequest;
    clientState.subwayExpedition.exploredFloors = {};
    clientState.subwayExpedition.preparedNextFloor = null;
    clientState.subwayExpedition.runPlan = null;
    clientState.subwayExpedition.storyMemory = {
      facts: [],
      knownActors: [],
      unresolvedThreads: [],
      resolvedThreads: [],
      recentSummaries: [],
      lastBridge: "",
    };
    if (clientState.subwayExpedition.currentFloorProgress.encounter) {
      clientState.subwayExpedition.currentFloorProgress.encounter.currentScene = null;
    }
    clientState.subwayExpedition.currentFloor?.majorEvent.options.forEach((option) => {
      delete option.outcomes;
    });
    clientState.subwayExpedition.currentFloor?.lootSpots.forEach((spot) => {
      if (clientState.subwayExpedition.spatialMode || !clientState.subwayExpedition.currentFloorProgress.searchedLootSpotIds.includes(spot.id)) {
        spot.contents = [];
        delete spot.resultParagraphs;
      }
    });
    const snapshot = {
      gameId: session.id,
      state: clientState,
      conditionCards: conditionCards(session.state),
      currentScene,
      visibleLocations: this.visibleLocationIds(session).map(
        (locationId) => session.world.locationCards[locationId] as LocationCard,
      ).filter(Boolean),
      visiblePeople: this.visiblePersonIds(session, registry).map(
        (personId) => session.world.personCards[personId] as PersonCard,
      ),
      inventoryCards: playerItemIds(session.state).map(
        (itemId) => syncItemCardWithRuntimeDefinition(session.world.itemCards[itemId] as ItemCard, itemId, registry),
      ),
      inventoryLights: inventoryLightControls(session.state),
      itemCatalog: this.buildItemCatalog(registry),
      exploration: explorationInteractions(session.state, registry),
      protagonist: session.world.protagonistCard as ProtagonistCard,
      storyMaterials,
      quests: getQuestDefinitions(registry).map((quest) => ({
        id: quest.id,
        name: quest.title,
        summary: quest.description,
        status: session.state.quests[quest.id] ?? "inactive",
        ...questProgressFields(session.state, quest, registry, RECIPE_MENU_SCENE_IDS),
      })),
      skills: getSkillEntries().filter((skill) => session.state.skills.includes(skill.id)),
      skillProgress: buildSkillProgressCards(session.state.skillProgress, registry.actions.fish_at_river?.effects.find(effect => effect.type === "random_outcome")?.outcomes),
      availableActions: (explorationScene
        ? textWorldActions(session.state, registry)
        : session.state.npcDialogue.active
        ? buildNpcDialogueActions(session.state)
        : expeditionScene
          ? buildSubwayExpeditionActions(session.state)
          : [
              ...textWorldEntryActions(session.state, registry),
              ...this.npcDialogueStartActions(session, registry),
              ...this.buildAvailableActions(
                session,
                sceneDef,
                storyChoices,
                registry,
              ),
            ])
        .filter(choice => !(session.state.location === "subway" && isSubwayStockMenuAction(choice.action, registry)))
        .map((choice) => {
          const resolved = resolveActionChoiceText(choice, registry);
          if (!choice.isAvailable || choice.action.type !== "content_action" || choice.action.actionId !== "sleep_at_shelter") return resolved;
          const forecast = forecastShelterSleep(session.state);
          if (!forecast) return resolved;
          const warning = forecast.isFatal ? `⚠ 취침 중 생존 종료 예상: ${forecast.reason} / ` : "";
          const changes = [`체력 ${forecast.hpBefore}→${forecast.hpAfter}`, `기력 ${forecast.energyBefore}→${forecast.energyAfter}`];
          if (forecast.conditionDamage > 0) changes.push(`부상·감염 피해 −${forecast.conditionDamage}`);
          if (forecast.infectionBefore > 0 || forecast.infectionAfter > 0) changes.push(`감염 Lv${forecast.infectionBefore}→Lv${forecast.infectionAfter}`);
          if (forecast.exhaustionBefore > 0 || forecast.exhaustionAfter > 0) changes.push(`탈진 Lv${forecast.exhaustionBefore}→Lv${forecast.exhaustionAfter}`);
          return { ...resolved, showOutcomeHint: true, outcomeHint: `다음 날 06:00 / 예상 ${changes.join(" · ")} / 취침 중 기력 소모 50%${warning ? ` / ${warning.slice(0, -3)}` : ""}` };
        }),
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
    if (!this.backgroundGenerationEnabled()) return;
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
      setSystemNote(session.state, [{
        type: "text",
        text: "앞쪽 길은 아직 안전하지 않다.",
        tone: "negative",
      }]);
      await this.ensureCards(session);
      return this.buildSnapshot(session, this.buildFrontierFallbackEvent(session, frontier), registry);
    }
  }
}
