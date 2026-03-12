import { randomUUID } from "node:crypto";
import { baseLocations, getPeopleEntries, getQuestEntries, getSkillEntries } from "./base-data";
import { evaluateCondition } from "./state-utils";
import { createContentGenerator, type ContentGenerator } from "./content-generator";
import type { GameRepository } from "./repository";
import { createInitialGameState, performAction, refreshLocationKnowledge, syncClock } from "./rules";
import type {
  ActionChoice,
  EventCard,
  GameAction,
  GameSession,
  GameState,
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

function actionSignature(action: GameAction) {
  switch (action.type) {
    case "travel":
      return `travel:${action.targetId}`;
    case "use_item":
      return `use_item:${action.itemId}`;
    case "rest":
      return "rest";
    case "cook":
      return "cook";
    case "buy_meal":
      return "buy_meal";
    case "generate_event":
      return `generate_event:${action.locationId || ""}`;
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
}

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
    await this.repository.saveGame(session);
    return this.buildSnapshot(session, null);
  }

  async getState(gameId: string) {
    const session = await this.repository.loadGame(gameId);
    syncClock(session.state);
    session.updatedAt = nowIso();
    await this.ensureCards(session);
    await this.repository.saveGame(session);
    return this.buildSnapshot(session, null);
  }

  async performAction(gameId: string, action: GameAction) {
    const session = await this.repository.loadGame(gameId);
    performAction(session.state, action);
    session.updatedAt = nowIso();
    const sceneKey = this.sceneKeyFor(session);
    delete session.world.sceneCards[sceneKey];

    let latestEvent: EventCard | null = null;
    if (action.type === "generate_event") {
      latestEvent = await this.ensureEventCard(session, action.locationId || session.state.location);
    }

    await this.ensureCards(session);
    await this.repository.appendActionLog({
      gameId,
      action,
      at: session.updatedAt,
      location: session.state.location,
      day: session.state.day,
    });
    await this.repository.saveGame(session);
    return this.buildSnapshot(session, latestEvent);
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
    const ids = new Set<string>();
    for (const locationId of this.visibleLocationIds(session.state.location, session.state.flags)) {
      const location = baseLocations[locationId];
      location.residentIds.forEach((personId) => ids.add(personId));
    }
    return Array.from(ids);
  }

  private generatorInput(session: GameSession, includeProtagonist: boolean) {
    return {
      state: session.state,
      gameId: session.id,
      recentLog: session.state.log.slice(-6),
      allowedActions: this.buildActionCatalog(session),
      storyMaterials: this.buildStoryMaterials(session, { includeProtagonist }),
    };
  }

  private sceneKeyFor(session: GameSession) {
    return `scene:${session.state.location}:${session.state.day}:${session.state.phaseIndex}`;
  }

  private buildActionCatalog(session: GameSession): ActionChoice[] {
    const currentLocation = baseLocations[session.state.location];
    const actions: ActionChoice[] = [];

    // 이동은 지도 패널에서만 가능하므로 선택지에서 제외

    Object.keys(session.state.inventory).forEach((itemId) => {
      const card = session.world.itemCards[itemId];
      if (!card) {
        return;
      }
      const effects = card.effects as { hp?: number; mind?: number; fullness?: number; starvationRelief?: number };
      const hasUseEffect = (effects.hp ?? 0) !== 0 || (effects.mind ?? 0) !== 0 || (effects.fullness ?? 0) !== 0 || (effects.starvationRelief ?? 0) !== 0;
      if (!hasUseEffect) {
        return;
      }
      actions.push({
        id: `use_item:${itemId}`,
        label: `${card.name}을 사용한다`,
        outcomeHint: `${card.description} 지금 상태를 다듬는 데 쓸 수 있다.`,
        action: {
          type: "use_item",
          itemId,
        },
      });
    });

    actions.push({
      id: `event:${session.state.location}`,
      label: "주변을 살핀다",
      outcomeHint: "현재 장소에서 이어질 사건이나 단서를 끌어낸다.",
      action: {
        type: "generate_event",
        locationId: session.state.location,
      },
    });

    if (session.state.location === "shelter") {
      actions.push({
        id: "rest:shelter",
        label: "거처에서 쉰다",
        outcomeHint: "체력과 정신력을 조금 회복하고 다음 판단을 정리한다.",
        action: { type: "rest" },
      });
      const hasRice = (session.state.inventory.rawRice ?? 0) >= 1;
      const hasVeg = (session.state.inventory.vegetables ?? 0) >= 1;
      if (hasRice && hasVeg) {
        actions.push({
          id: "cook:simple_meal",
          label: "쌀과 채소로 끓여 먹는다",
          outcomeHint: "거처에서 끓이면 따뜻한 한 끼가 된다.",
          action: { type: "cook" },
        });
      }
    }

    if (session.state.location === "kitchen" && session.state.money >= 4500) {
      actions.push({
        id: "buy_meal:kitchen",
        label: "돈을 내고 식사를 한다",
        outcomeHint: "4500원으로 허기를 채우는 따뜻한 한 끼를 구매한다.",
        action: { type: "buy_meal" },
      });
    }

    return actions;
  }

  private sanitizeStoryChoices(
    generatedChoices: StoryChoice[],
    actionCatalog: ActionChoice[],
    state: GameState,
  ): ActionChoice[] {
    const catalogBySignature = new Map(actionCatalog.map((entry) => [actionSignature(entry.action), entry]));
    const used = new Set<string>();
    const validated: ActionChoice[] = [];

    for (const choice of generatedChoices) {
      if (choice.hidden) continue;
      if (choice.conditions?.length) {
        const allPass = choice.conditions.every((c) => evaluateCondition(c, state));
        if (!allPass) continue;
      }
      const signature = actionSignature(choice.serverActionHint);
      const matched = catalogBySignature.get(signature);
      if (!matched || used.has(signature)) {
        continue;
      }
      used.add(signature);
      validated.push({
        id: choice.id || matched.id,
        label: choice.label || matched.label,
        outcomeHint: choice.outcomeHint || matched.outcomeHint,
        action: matched.action,
      });
    }

    if (validated.length > 0) {
      return validated;
    }

    return actionCatalog.slice(0, 4);
  }

  private async ensureLocationCard(session: GameSession, locationId: string) {
    if (session.world.locationCards[locationId]) {
      return session.world.locationCards[locationId];
    }

    const cached = await this.repository.getTemplate("locationCards", locationId);
    if (cached) {
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
    const sceneKey = this.sceneKeyFor(session);
    if (session.world.sceneCards[sceneKey]?.choices?.length) {
      return session.world.sceneCards[sceneKey];
    }

    const rawCard = await this.generator.generateSceneCard({
      ...this.generatorInput(session, true),
    });
    const actionCatalog = this.buildActionCatalog(session);
    const card: SceneCard = {
      ...rawCard,
      choices: this.sanitizeStoryChoices(rawCard.choices, actionCatalog, session.state).map((choice) => ({
        id: choice.id,
        label: choice.label,
        outcomeHint: choice.outcomeHint,
        serverActionHint: choice.action,
      })),
    };
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

  private async ensureEventCard(session: GameSession, locationId: string) {
    const eventKey = `event:${locationId}:${session.state.day}:${session.state.phaseIndex}`;
    if (session.world.eventCards[eventKey]?.choices?.length) {
      return session.world.eventCards[eventKey];
    }

    const rawCard = await this.generator.generateEventCard(locationId, {
      ...this.generatorInput(session, true),
    });
    const locationCatalog = this.buildActionCatalog(session).filter(
      (entry) => entry.action.type !== "rest",
    );
    const card: EventCard = {
      ...rawCard,
      choices: this.sanitizeStoryChoices(rawCard.choices, locationCatalog, session.state).map((choice) => ({
        id: choice.id,
        label: choice.label,
        outcomeHint: choice.outcomeHint,
        serverActionHint: choice.action,
      })),
    };
    session.world.eventCards[eventKey] = card;
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
    const locations = this.visibleLocationIds(session.state.location, session.state.flags)
      .map((locationId) => session.world.locationCards[locationId])
      .filter(Boolean) as LocationCard[];
    const people = this.visiblePersonIds(session)
      .map((personId) => session.world.personCards[personId])
      .filter(Boolean) as PersonCard[];
    const itemIds = new Set<string>(Object.keys(session.state.inventory));
    people.forEach((person) => {
      person.inventoryItemIds.forEach((itemId) => itemIds.add(itemId));
    });
    locations.forEach((location) => {
      location.obtainableItemIds.forEach((itemId) => itemIds.add(itemId));
    });
    const items = Array.from(itemIds)
      .map((itemId) => session.world.itemCards[itemId])
      .filter(Boolean) as ItemCard[];
    const protagonist = options.includeProtagonist
      ? (session.world.protagonistCard as ProtagonistCard)
      : ({
          id: "protagonist",
          name: "이름 없는 생존자",
          summary: "폐허 서울의 생활권을 버티며 다음 선택을 고르는 사람이다.",
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
      locations,
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
          sourceAccessible: sourceId === session.state.location
            || Boolean(session.state.flags[`visited_${sourceId}`]),
        }))
        .filter((route) => route.sourceAccessible);
      const hasUnlockedKnownRoute = incomingRoutes.some(
        (route) => !route.link.requiredFlag || Boolean(session.state.flags[route.link.requiredFlag]),
      );
      const blockedRoute = incomingRoutes.find(
        (route) => route.link.requiredFlag && !session.state.flags[route.link.requiredFlag],
      );
      const isControlled = !isCurrent && !isReachable && !hasUnlockedKnownRoute && Boolean(blockedRoute);
      const reason = blockedRoute
        ? (blockedRoute.link.blockedReason || "아직 이동할 수 없는 경로다.")
        : "";

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
      state: session.state,
      currentScene,
      visibleLocations: Object.keys(baseLocations).map(
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
      })),
      mapEntries: this.buildMapEntries(session),
      latestEvent,
    };

    return StateSnapshotSchema.parse(snapshot);
  }
}
