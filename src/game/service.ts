import { randomUUID } from "node:crypto";
import { baseLocations, getQuestEntries, getSkillEntries } from "./base-data";
import {
  buildStoryChoiceFromChoice,
  resolveAvailableActions,
  resolveEventChoices,
  resolveSceneChoices,
  resolveSceneDefinition,
  resolveTriggeredEvents,
} from "./content-engine";
import { createContentGenerator, type ContentGenerator } from "./content-generator";
import { worldRegistry } from "./data/registry";
import type { GameRepository } from "./repository";
import { applySystemNote, createInitialGameState, performAction, refreshLocationKnowledge, syncClock, syncQuestState } from "./rules";
import type {
  ActionChoice,
  EventCard,
  GameAction,
  GameSession,
  ItemCard,
  LocationCard,
  MapEntry,
  PersonCard,
  ProtagonistCard,
  SceneCard,
  StateSnapshot,
  StoryChoice,
  StoryMaterials,
} from "./schemas";
import { StateSnapshotSchema } from "./schemas";

function nowIso() {
  return new Date().toISOString();
}

const SCENE_CARD_CACHE_VERSION = 2;

export class GameService {
  constructor(
    private readonly repository: GameRepository,
    private readonly generator: ContentGenerator = createContentGenerator(),
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
    syncQuestState(session.state);
    applySystemNote(previousState, session.state);
    session.updatedAt = nowIso();
    await this.ensureCards(session);
    const snapshot = this.buildSnapshot(session, null);
    await this.repository.saveGame(session);
    return snapshot;
  }

  async performAction(gameId: string, action: GameAction) {
    const session = await this.repository.loadGame(gameId);
    const followUpEventId = this.followUpEventId(action);

    performAction(session.state, action);
    session.updatedAt = nowIso();
    session.world.sceneCards = {};

    let latestEvent: EventCard | null = null;
    if (action.type === "generate_event") {
      latestEvent = await this.ensureTriggeredEventCard(session, action.locationId || session.state.location);
    } else if (followUpEventId) {
      latestEvent = await this.ensureEventCardById(session, followUpEventId);
    } else if (this.isExploreAction(action)) {
      latestEvent = await this.ensureTriggeredEventCard(session, session.state.location);
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
    syncClock(session.state);
    await this.ensureCards(session);
    await this.repository.saveGame(session);
    return {
      gameId,
      location: session.state.location,
      visibleLocations: this.visibleLocationIds(session.state.location, session.state.flags).map(
        (locationId) => session.world.locationCards[locationId],
      ),
    };
  }

  async getInventory(gameId: string) {
    const session = await this.repository.loadGame(gameId);
    syncClock(session.state);
    await this.ensureCards(session);
    await this.repository.saveGame(session);
    return {
      gameId,
      inventoryCards: Object.keys(session.state.inventory).map((itemId) => session.world.itemCards[itemId]),
      money: session.state.money,
    };
  }

  private visibleLocationIds(currentLocationId: string, flags: Record<string, boolean | number | string>) {
    const ids = new Set<string>([currentLocationId]);
    Object.keys(baseLocations).forEach((locationId) => {
      if (flags[`visited_${locationId}`] || flags[`known_${locationId}`]) {
        ids.add(locationId);
      }
    });
    return Array.from(ids);
  }

  private async ensureCards(session: GameSession) {
    const visibleLocationIds = this.visibleLocationIds(session.state.location, session.state.flags);
    const allMapLocationIds = Object.keys(baseLocations);
    for (const locationId of new Set([...visibleLocationIds, ...allMapLocationIds])) {
      await this.ensureLocationCard(session, locationId);
    }

    const visiblePersonIds = this.visiblePersonIds(session);
    for (const personId of visiblePersonIds) {
      await this.ensurePersonCard(session, personId);
    }

    const itemIds = new Set<string>(Object.keys(session.state.inventory));
    visibleLocationIds.forEach((locationId) => {
      baseLocations[locationId].obtainableItemIds.forEach((itemId) => itemIds.add(itemId));
    });
    visiblePersonIds.forEach((personId) => {
      const person = session.world.personCards[personId];
      person?.inventoryItemIds.forEach((itemId) => itemIds.add(itemId));
    });

    for (const itemId of itemIds) {
      await this.ensureItemCard(session, itemId);
    }

    await this.ensureProtagonistCard(session);
    await this.ensureSceneCard(session);
  }

  private visiblePersonIds(session: GameSession) {
    return [...baseLocations[session.state.location].residentIds];
  }

  private generatorInput(session: GameSession, includeProtagonist: boolean) {
    return {
      state: session.state,
      gameId: session.id,
      recentLog: session.state.log.slice(-6).map((entry) => entry.message),
      allowedActions: this.buildActionCatalog(session),
      storyMaterials: this.buildStoryMaterials(session, { includeProtagonist }),
    };
  }

  private eventKeyFor(eventId: string, session: GameSession) {
    return `event:${eventId}:${session.state.day}:${session.state.phaseIndex}`;
  }

  // 1. 서사: 지금 화면에 유지되어야 하는 sceneId를 그대로 읽는다.
  private presentedSceneDefinition(session: GameSession) {
    return resolveSceneDefinition(session.state, worldRegistry, session.state.location);
  }

  private sceneKeyFor(session: GameSession) {
    const scene = this.presentedSceneDefinition(session);
    return `scene:${scene.id}:v${SCENE_CARD_CACHE_VERSION}:${session.state.day}:${session.state.phaseIndex}`;
  }

  private previewNextSceneId(state: GameSession["state"], action: GameAction) {
    const previewState = structuredClone(state);
    try {
      performAction(previewState, action);
      return previewState.sceneId;
    } catch {
      return undefined;
    }
  }

  // 2. 선택지: 현재 서사에 매달린 choice와 location action을 한 번에 조립한다.
  private presentedChoices(session: GameSession, scene = this.presentedSceneDefinition(session)): StoryChoice[] {
    const sceneChoices = resolveSceneChoices(session.state, scene, worldRegistry).map((choice) => {
      const built = buildStoryChoiceFromChoice(choice);
      return {
        ...built,
        nextSceneId: this.previewNextSceneId(session.state, built.serverActionHint) ?? built.nextSceneId,
      };
    });

    // Event scenes are self-contained narrative beats: only scene-authored choices belong here.
    if (scene.eventId) {
      return sceneChoices;
    }

    const location = worldRegistry.locations[session.state.location];
    const locationActions = resolveAvailableActions(session.state, location, worldRegistry).map((action) => ({
      id: action.id,
      label: action.label,
      outcomeHint: action.outcomeHint,
      riskHint: action.riskHint,
      serverActionHint: { type: "content_action" as const, actionId: action.id },
      nextSceneId: this.previewNextSceneId(session.state, { type: "content_action", actionId: action.id }),
    }));

    return [...sceneChoices, ...locationActions];
  }

  private buildActionCatalog(session: GameSession): ActionChoice[] {
    return this.presentedChoices(session).map((choice) => ({
      id: choice.id,
      label: choice.label,
      outcomeHint: choice.outcomeHint,
      action: choice.serverActionHint,
    }));
  }

  private async ensureLocationCard(session: GameSession, locationId: string) {
    const expectedImagePath = baseLocations[locationId]?.imagePath ?? null;
    const existing = session.world.locationCards[locationId];
    if (existing && existing.imagePath === expectedImagePath) {
      return existing;
    }

    const cached = await this.repository.getTemplate("locationCards", locationId);
    if (cached && (cached as LocationCard).imagePath === expectedImagePath) {
      session.world.locationCards[locationId] = cached as LocationCard;
      return cached;
    }

    const card = await this.generator.generateLocationCard(locationId, {
      ...this.generatorInput(session, false),
    });
    session.world.locationCards[locationId] = card;
    await this.repository.saveTemplate("locationCards", locationId, card);
    await this.repository.appendGenerationLog({
      gameId: session.id,
      kind: "locationCard",
      id: locationId,
      at: nowIso(),
      source: card.source,
    });
    return card;
  }

  private async ensurePersonCard(session: GameSession, personId: string) {
    if (session.world.personCards[personId]) {
      return session.world.personCards[personId];
    }

    const cached = await this.repository.getTemplate("personCards", personId);
    if (cached) {
      session.world.personCards[personId] = cached as PersonCard;
      return cached;
    }

    const card = await this.generator.generatePersonCard(personId, {
      ...this.generatorInput(session, false),
    });
    session.world.personCards[personId] = card;
    await this.repository.saveTemplate("personCards", personId, card);
    await this.repository.appendGenerationLog({
      gameId: session.id,
      kind: "personCard",
      id: personId,
      at: nowIso(),
      source: card.source,
    });
    return card;
  }

  private async ensureItemCard(session: GameSession, itemId: string) {
    if (session.world.itemCards[itemId]) {
      return session.world.itemCards[itemId];
    }

    const cached = await this.repository.getTemplate("itemCards", itemId);
    if (cached) {
      session.world.itemCards[itemId] = cached as ItemCard;
      return cached;
    }

    const card = await this.generator.generateItemCard(itemId, {
      ...this.generatorInput(session, false),
    });
    session.world.itemCards[itemId] = card;
    await this.repository.saveTemplate("itemCards", itemId, card);
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

  private async ensureSceneCard(session: GameSession) {
    const sceneDef = this.presentedSceneDefinition(session);
    const sceneKey = this.sceneKeyFor(session);
    const storyChoices = this.presentedChoices(session, sceneDef);
    const existing = session.world.sceneCards[sceneKey];
    if (
      existing
      && existing.introFlag === sceneDef.introFlag
      && existing.choices.length === storyChoices.length
      && existing.choices.every((choice, index) => choice.id === storyChoices[index]?.id)
    ) {
      return existing;
    }

    const card = await this.generator.generateSceneCard(sceneDef, storyChoices, {
      ...this.generatorInput(session, true),
    });
    session.world.sceneCards[sceneKey] = card;
    await this.repository.appendGenerationLog({
      gameId: session.id,
      kind: "sceneCard",
      id: sceneKey,
      at: nowIso(),
      source: card.source,
    });
    return card;
  }

  private async ensureTriggeredEventCard(session: GameSession, locationId: string) {
    const eventDef = resolveTriggeredEvents(session.state, locationId, worldRegistry)[0];
    if (!eventDef) {
      return null;
    }
    return this.ensureEventCardById(session, eventDef.id);
  }

  private async ensureEventCardById(session: GameSession, eventId: string) {
    const eventDef = worldRegistry.events[eventId];
    if (!eventDef) {
      return null;
    }

    const eventKey = this.eventKeyFor(eventId, session);
    if (session.world.eventCards[eventKey]?.choices?.length) {
      return session.world.eventCards[eventKey];
    }

    const storyChoices = resolveEventChoices(session.state, eventDef, worldRegistry).map(buildStoryChoiceFromChoice);
    const card = await this.generator.generateEventCard(eventDef, storyChoices, {
      ...this.generatorInput(session, true),
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
  ): StoryMaterials {
    const currentLocation = session.world.locationCards[session.state.location];
    const location = currentLocation ? [currentLocation] : [];
    const localPersonIds = baseLocations[session.state.location].residentIds;
    const people = localPersonIds
      .map((personId) => session.world.personCards[personId])
      .filter(Boolean) as PersonCard[];
    const itemIds = new Set<string>(Object.keys(session.state.inventory));
    baseLocations[session.state.location].obtainableItemIds.forEach((itemId) => itemIds.add(itemId));
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

  private buildMapEntries(session: GameSession): MapEntry[] {
    refreshLocationKnowledge(session.state);
    const allLocationIds = Object.keys(baseLocations);
    const currentLinks = baseLocations[session.state.location].links;
    return allLocationIds.map((locationId) => {
      const link = currentLinks[locationId];
      const requiredFlag = link?.requiredFlag;
      const isCurrent = locationId === session.state.location;
      const isKnown = Boolean(session.state.flags[`known_${locationId}`]) || Boolean(session.state.flags[`visited_${locationId}`]) || isCurrent;
      const isAdjacent = Boolean(link);
      const isReachable = !isCurrent && isAdjacent && (!requiredFlag || Boolean(session.state.flags[requiredFlag]));
      const incomingRoutes = Object.entries(baseLocations)
        .filter(([, location]) => Boolean(location.links[locationId]))
        .map(([sourceId, location]) => ({
          sourceId,
          link: location.links[locationId],
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

  private buildSnapshot(session: GameSession, latestEvent: EventCard | null): StateSnapshot {
    const sceneKey = this.sceneKeyFor(session);
    const storyMaterials = this.buildStoryMaterials(session, { includeProtagonist: true });
    const currentScene = session.world.sceneCards[sceneKey] as SceneCard;
    const snapshot = {
      gameId: session.id,
      state: structuredClone(session.state),
      currentScene,
      visibleLocations: this.visibleLocationIds(session.state.location, session.state.flags).map(
        (locationId) => session.world.locationCards[locationId] as LocationCard,
      ).filter(Boolean),
      visiblePeople: this.visiblePersonIds(session).map(
        (personId) => session.world.personCards[personId] as PersonCard,
      ),
      inventoryCards: Object.keys(session.state.inventory).map(
        (itemId) => session.world.itemCards[itemId] as ItemCard,
      ),
      protagonist: session.world.protagonistCard as ProtagonistCard,
      storyMaterials,
      quests: getQuestEntries().map((quest) => ({
        ...quest,
        status: session.state.quests[quest.id],
      })),
      skills: getSkillEntries().filter((skill) => session.state.skills.includes(skill.id)),
      availableActions: currentScene.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        outcomeHint: choice.outcomeHint,
        action: choice.serverActionHint,
        nextSceneId: choice.nextSceneId,
      })),
      mapEntries: this.buildMapEntries(session),
      latestEvent,
    };

    return StateSnapshotSchema.parse(snapshot);
  }

  private followUpEventId(action: GameAction) {
    if (action.type === "content_action") {
      return worldRegistry.actions[action.actionId]?.nextEventId || null;
    }
    if (action.type === "content_choice") {
      return worldRegistry.choices[action.choiceId]?.nextEventId || null;
    }
    return null;
  }

  private isExploreAction(action: GameAction) {
    if (action.type !== "content_action") {
      return false;
    }
    return worldRegistry.actions[action.actionId]?.type === "explore";
  }
}

