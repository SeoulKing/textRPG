import { randomUUID } from "node:crypto";
import { PHASES, getSkillEntries } from "./base-data";
import {
  buildStoryChoiceFromChoice,
  resolveEventChoices,
  resolveSceneDefinition,
  resolveTriggeredEvents,
} from "./content-engine";
import { createContentGenerator, createTemplateContentGenerator, type ContentGenerator } from "./content-generator";
import type { GameRepository } from "./repository";
import {
  applySystemNote,
  createInitialGameState,
  performAction,
  refreshLocationKnowledge,
  syncClock,
  syncQuestState,
  syncScene,
} from "./rules";
import { buildRuntimeRegistry, getQuestDefinitions, getRuntimeLocationDefinition, mergeDynamicWorldRegistry } from "./runtime-registry";
import { buildActionCatalogFromStoryChoices, resolveStoryFrame } from "./story-flow";
import type {
  ActionChoice,
  ActionDefinition,
  ContentRegistry,
  EventCard,
  EventDefinition,
  GameAction,
  GameSession,
  ItemCard,
  LocationCard,
  MapEntry,
  PersonCard,
  ProtagonistCard,
  SceneCard,
  StateSnapshot,
  StoryMaterials,
} from "./schemas";
import { EventCardSchema, SceneCardSchema, StateSnapshotSchema } from "./schemas";
import { buildPlannedRegionSummary, createWorldPlanner, type WorldPlanner } from "./world-planner";

function nowIso() {
  return new Date().toISOString();
}

const SCENE_CARD_CACHE_VERSION = 5;

export class GameService {
  constructor(
    private readonly repository: GameRepository,
    private readonly generator: ContentGenerator = createContentGenerator(),
    private readonly templateGenerator: ContentGenerator = createTemplateContentGenerator(),
    private readonly planner: WorldPlanner = createWorldPlanner(),
  ) {}

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

    await this.ensureCards(session);
    const snapshot = this.buildSnapshot(session, null);
    await this.repository.saveGame(session);
    return snapshot;
  }

  async getState(gameId: string) {
    const session = await this.repository.loadGame(gameId);
    const previousState = structuredClone(session.state);
    syncClock(session.state);
    syncQuestState(session.state, previousState.quests);
    syncScene(session.state);
    applySystemNote(previousState, session.state);
    await this.replanTomorrowIfNeeded(session, previousState.day);
    session.updatedAt = nowIso();
    await this.ensureCards(session);
    const snapshot = this.buildSnapshot(session, null);
    await this.repository.saveGame(session);
    return snapshot;
  }

  async performAction(gameId: string, action: GameAction) {
    const session = await this.repository.loadGame(gameId);
    const previousDay = session.state.day;
    const registry = this.runtimeRegistry(session);

    if (this.isFrontierAction(action, registry)) {
      const snapshot = await this.expandFrontier(session, action, registry);
      await this.repository.saveGame(session);
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
    const snapshot = this.buildSnapshot(session, latestEvent);
    await this.repository.saveGame(session);
    return snapshot;
  }

  async getMap(gameId: string) {
    const session = await this.repository.loadGame(gameId);
    const previousDay = session.state.day;
    syncClock(session.state);
    syncQuestState(session.state);
    syncScene(session.state);
    await this.replanTomorrowIfNeeded(session, previousDay);
    await this.ensureCards(session);
    await this.repository.saveGame(session);
    return {
      gameId,
      location: session.state.location,
      visibleLocations: this.visibleLocationIds(session).map((locationId) => session.world.locationCards[locationId]),
    };
  }

  async getInventory(gameId: string) {
    const session = await this.repository.loadGame(gameId);
    const previousDay = session.state.day;
    syncClock(session.state);
    syncQuestState(session.state);
    syncScene(session.state);
    await this.replanTomorrowIfNeeded(session, previousDay);
    await this.ensureCards(session);
    await this.repository.saveGame(session);
    return {
      gameId,
      inventoryCards: Object.keys(session.state.inventory).map((itemId) => session.world.itemCards[itemId]),
      money: session.state.money,
    };
  }

  private runtimeRegistry(session: Pick<GameSession, "state"> | Pick<{ state: GameSession["state"] }, "state">) {
    return buildRuntimeRegistry(session.state);
  }

  private visibleLocationIds(session: Pick<GameSession, "state">) {
    const registry = this.runtimeRegistry(session);
    const ids = new Set<string>([session.state.location]);
    Object.keys(registry.locations).forEach((locationId) => {
      if (session.state.flags[`visited_${locationId}`] || session.state.flags[`known_${locationId}`]) {
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
    session.state.worldPlan.tomorrow = await this.planner.planTomorrow(session.state, this.runtimeRegistry(session));
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
      if (action.type === "content_action" && registry.actions[action.actionId]?.tags?.includes("frontier")) {
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
    const expectedImagePath = registry.locations[locationId]?.imagePath ?? null;
    const expectedName = (registry.locations[locationId] as { name?: string } | undefined)?.name ?? "";
    const expectedSummary = (registry.locations[locationId] as { summary?: string } | undefined)?.summary ?? "";
    const existing = session.world.locationCards[locationId];
    if (
      existing &&
      existing.imagePath === expectedImagePath &&
      existing.name === expectedName &&
      existing.summary === expectedSummary
    ) {
      return existing;
    }

    const isDynamic = locationId.startsWith("dyn_");
    if (!isDynamic) {
      const cached = await this.repository.getTemplate("locationCards", locationId);
      if (
        cached &&
        (cached as LocationCard).imagePath === expectedImagePath &&
        (cached as LocationCard).name === expectedName &&
        (cached as LocationCard).summary === expectedSummary
      ) {
        session.world.locationCards[locationId] = cached as LocationCard;
        return cached;
      }
    }

    const cardRaw = await (isDynamic ? this.generator : this.templateGenerator).generateLocationCard(locationId, {
      ...this.generatorInput(session, false, registry),
    });
    // LLM이 id를 바꾸면 클라이언트가 state.location과 매칭하지 못해 씬·선택지가 통째로 안 그려진다.
    const card = { ...cardRaw, id: locationId };
    session.world.locationCards[locationId] = card;

    if (!isDynamic) {
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

    const isDynamic = personId.startsWith("dyn_");
    if (!isDynamic) {
      const cached = await this.repository.getTemplate("personCards", personId);
      if (cached) {
        session.world.personCards[personId] = cached as PersonCard;
        return cached;
      }
    }

    const cardRaw = await (isDynamic ? this.generator : this.templateGenerator).generatePersonCard(personId, {
      ...this.generatorInput(session, false, registry),
    });
    const card = { ...cardRaw, id: personId };
    session.world.personCards[personId] = card;

    if (!isDynamic) {
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
      return session.world.itemCards[itemId];
    }

    const isDynamic = itemId.startsWith("dyn_");
    if (!isDynamic) {
      const cached = await this.repository.getTemplate("itemCards", itemId);
      if (cached) {
        session.world.itemCards[itemId] = cached as ItemCard;
        return cached;
      }
    }

    const cardRaw = await (isDynamic ? this.generator : this.templateGenerator).generateItemCard(itemId, {
      ...this.generatorInput(session, false, registry),
    });
    const card = { ...cardRaw, id: itemId };
    session.world.itemCards[itemId] = card;

    if (!isDynamic) {
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

  private async ensureProtagonistCard(session: GameSession) {
    const card = await this.generator.generateProtagonistCard({
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
    const card = await this.generator.generateEventCard(eventDef, storyChoices, {
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
            fullness: session.state.stats.fullness,
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
    const currentLinks = this.currentLocation(session, registry).links;
    return allLocationIds.map((locationId) => {
      const link = currentLinks[locationId];
      const requiredFlag = link?.requiredFlag;
      const isCurrent = locationId === session.state.location;
      const isKnown = Boolean(session.state.flags[`known_${locationId}`]) || Boolean(session.state.flags[`visited_${locationId}`]) || isCurrent;
      const isAdjacent = Boolean(link);
      const isReachable = !isCurrent && isAdjacent && (!requiredFlag || Boolean(session.state.flags[requiredFlag]));
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
      const reason = blockedRoute ? (blockedRoute.link.blockedReason || "That route is still blocked.") : "";

      return {
        locationId,
        isCurrent,
        isVisible: isKnown,
        isKnown,
        isVisited: Boolean(session.state.flags[`visited_${locationId}`]) || isCurrent,
        isAdjacent,
        isReachable,
        isControlled,
        reason,
      };
    });
  }

  private buildSnapshot(session: GameSession, latestEvent: EventCard | null, registry = this.runtimeRegistry(session)): StateSnapshot {
    const storyMaterials = this.buildStoryMaterials(session, { includeProtagonist: true }, registry);
    const currentScene = this.buildAuthoringSceneCard(session, storyMaterials, registry);
    const sceneDef = this.presentedSceneDefinition(session, registry);
    const locationChoices = this.presentedChoices(session, sceneDef, registry);
    const storyChoices =
      latestEvent && latestEvent.choices.length > 0 ? latestEvent.choices : locationChoices;
    const snapshot = {
      gameId: session.id,
      state: structuredClone(session.state),
      currentScene,
      visibleLocations: this.visibleLocationIds(session).map(
        (locationId) => session.world.locationCards[locationId] as LocationCard,
      ).filter(Boolean),
      visiblePeople: this.visiblePersonIds(session, registry).map(
        (personId) => session.world.personCards[personId] as PersonCard,
      ),
      inventoryCards: Object.keys(session.state.inventory).map(
        (itemId) => session.world.itemCards[itemId] as ItemCard,
      ),
      protagonist: session.world.protagonistCard as ProtagonistCard,
      storyMaterials,
      quests: getQuestDefinitions(registry).map((quest) => ({
        id: quest.id,
        name: quest.title,
        summary: quest.description,
        status: session.state.quests[quest.id] ?? "inactive",
      })),
      skills: getSkillEntries().filter((skill) => session.state.skills.includes(skill.id)),
      availableActions: buildActionCatalogFromStoryChoices(storyChoices),
      mapEntries: this.buildMapEntries(session, registry),
      latestEvent,
    };

    return StateSnapshotSchema.parse(snapshot);
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
    return action.type === "content_action" && Boolean(registry.actions[action.actionId]?.tags?.includes("frontier"));
  }

  private buildFrontierFallbackEvent(session: GameSession, actionDef: ActionDefinition) {
    return EventCardSchema.parse({
      id: `event:frontier-fallback:${actionDef.id}:${session.state.day}:${session.state.phaseIndex}`,
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
    const actionDef = registry.actions[(action as Extract<GameAction, { type: "content_action" }>).actionId];
    if (!actionDef) {
      throw new Error("Unknown frontier action.");
    }

    const existingSlot = session.state.frontierState.slots[actionDef.id];
    if (existingSlot?.generatedLocationId && registry.locations[existingSlot.generatedLocationId]) {
      performAction(session.state, { type: "travel", targetId: existingSlot.generatedLocationId });
      session.updatedAt = nowIso();
      await this.ensureCards(session);
      return this.buildSnapshot(session, null);
    }

    const sourceLocationId = session.state.location;
    const slot = existingSlot ?? {
      actionId: actionDef.id,
      sourceLocationId,
      generatedLocationId: null,
      note: actionDef.outcomeHint,
      status: "unexpanded" as const,
      lastExpandedDay: null,
    };

    let latestEvent: EventCard | null = null;
    try {
      const pkg = await this.planner.generateRegionPackage({
        state: session.state,
        registry,
        sourceLocationId,
        sourceFrontierActionId: actionDef.id,
        sequence: session.state.frontierState.nextSequence,
        recentLog: session.state.log.slice(0, 6).map((entry) => entry.message),
      });

      session.state.dynamicContent = mergeDynamicWorldRegistry(session.state.dynamicContent, pkg.registry);
      session.state.frontierState.nextSequence += 1;
      session.state.frontierState.slots[actionDef.id] = {
        ...slot,
        generatedLocationId: pkg.locationId,
        status: "expanded",
        lastExpandedDay: session.state.day,
        note: actionDef.outcomeHint,
      };

      session.state.worldPlan.today = {
        day: session.state.day,
        regions: [
          ...session.state.worldPlan.today.regions.filter((region) => region.locationId !== pkg.locationId),
          buildPlannedRegionSummary(
            {
              state: session.state,
              registry,
              sourceLocationId,
              sourceFrontierActionId: actionDef.id,
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
        frontierActionId: actionDef.id,
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
      session.state.frontierState.slots[actionDef.id] = {
        ...slot,
        status: "blocked",
        note: actionDef.outcomeHint,
      };
      session.state.systemNote = "앞쪽 길은 아직 안전하지 않다.";
      await this.ensureCards(session);
      return this.buildSnapshot(session, this.buildFrontierFallbackEvent(session, actionDef), registry);
    }
  }
}
