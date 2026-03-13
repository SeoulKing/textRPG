import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import {
  GameSessionSchema,
  TemplateStoreSchema,
  type EventCard,
  type GameSession,
  type GameState,
  type ItemCard,
  type LocationCard,
  type PersonCard,
  type ProtagonistCard,
  type SceneCard,
  type TemplateStore,
} from "./schemas";
import { baseLocations } from "./base-data";
import { basePeople } from "./data/people";
import { worldRegistry } from "./data/registry";

export type CardKind = "locationCards" | "personCards" | "itemCards" | "eventCards" | "sceneCards";
export type StoredCard = LocationCard | PersonCard | ItemCard | EventCard | SceneCard;

const validLocationIds = new Set(Object.keys(baseLocations));
const validPersonIds = new Set(Object.keys(basePeople));
const validQuestIds = new Set(Object.keys(worldRegistry.quests));
const validSceneIds = new Set(Object.keys(worldRegistry.scenes));
const validEventFlags = new Set(Object.keys(worldRegistry.events).map((eventId) => `event_seen_${eventId}`));

export const emptyTemplateStore: TemplateStore = {
  locationCards: {},
  personCards: {},
  itemCards: {},
  eventCards: {},
  sceneCards: {},
  protagonistCard: null,
};

function fallbackSceneId(locationId: string) {
  const scene = Object.values(worldRegistry.scenes).find((entry) => entry.locationId === locationId);
  return scene?.id || "shelter_day_intro";
}

function pruneFlags(flags: Record<string, boolean | number | string>) {
  return Object.fromEntries(
    Object.entries(flags).filter(([key]) => {
      if (key.startsWith("visited_") || key.startsWith("known_")) {
        const locationId = key.replace(/^(visited_|known_)/, "");
        return validLocationIds.has(locationId);
      }
      if (key.startsWith("event_seen_")) {
        return validEventFlags.has(key);
      }
      return true;
    }),
  );
}

function pruneQuests(quests: Record<string, "inactive" | "active" | "completed">) {
  return Object.fromEntries(
    Object.entries(quests).filter(([questId]) => validQuestIds.has(questId)),
  ) as Record<string, "inactive" | "active" | "completed">;
}

function pruneState(state: GameState): GameState {
  const nextLocation = validLocationIds.has(state.location) ? state.location : "shelter";
  const nextFlags = pruneFlags(state.flags);
  nextFlags[`visited_${nextLocation}`] = true;
  return {
    ...state,
    location: nextLocation,
    sceneId: validSceneIds.has(state.sceneId) ? state.sceneId : fallbackSceneId(nextLocation),
    flags: nextFlags,
    quests: pruneQuests(state.quests),
  };
}

export function normalizeTemplateStore(raw: unknown): TemplateStore {
  const parsed = (raw && typeof raw === "object" ? raw : {}) as Partial<TemplateStore> & Record<string, unknown>;
  const locationCards = parsed.locationCards && typeof parsed.locationCards === "object" ? parsed.locationCards : {};
  const personCards = parsed.personCards && typeof parsed.personCards === "object" ? parsed.personCards : {};
  const itemCards = parsed.itemCards && typeof parsed.itemCards === "object" ? parsed.itemCards : {};
  const eventCards = parsed.eventCards && typeof parsed.eventCards === "object" ? parsed.eventCards : {};
  const sceneCards = parsed.sceneCards && typeof parsed.sceneCards === "object" ? parsed.sceneCards : {};

  const normalizedLocationCards = Object.fromEntries(
    Object.entries(locationCards)
      .filter(([id]) => validLocationIds.has(id))
      .map(([id, value]) => {
        const card = value as Record<string, unknown>;
        const base = baseLocations[id];
        return [id, {
          ...card,
          traits: Array.isArray(card.traits) ? card.traits : (base?.traits || []),
          obtainableItemIds: Array.isArray(card.obtainableItemIds) ? card.obtainableItemIds : (base?.obtainableItemIds || []),
          residentIds: Array.isArray(card.residentIds) ? card.residentIds : (base?.residentIds || []),
          neighbors: Array.isArray(card.neighbors)
            ? card.neighbors.filter((neighborId) => typeof neighborId === "string" && validLocationIds.has(neighborId))
            : (base?.neighbors || []),
        }];
      }),
  );

  const normalizedPersonCards = Object.fromEntries(
    Object.entries(personCards).filter(([id]) => validPersonIds.has(id)),
  );

  const normalizedEventCards = Object.fromEntries(
    Object.entries(eventCards).filter(([id]) => {
      const parts = id.split(":");
      const eventId = parts.length >= 2 ? parts[1] : "";
      return worldRegistry.events[eventId] !== undefined;
    }),
  );

  const normalizedSceneCards = Object.fromEntries(
    Object.entries(sceneCards).filter(([id]) => {
      const parts = id.split(":");
      const sceneId = parts.length >= 2 ? parts[1] : "";
      return worldRegistry.scenes[sceneId] !== undefined;
    }),
  );

  return TemplateStoreSchema.parse({
    locationCards: normalizedLocationCards,
    personCards: normalizedPersonCards,
    itemCards,
    eventCards: normalizedEventCards,
    sceneCards: normalizedSceneCards,
    protagonistCard: parsed.protagonistCard ?? null,
  });
}

export function normalizeGameSession(raw: unknown): GameSession {
  const parsed = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const world = (parsed.world && typeof parsed.world === "object") ? parsed.world as Record<string, unknown> : {};
  const normalizedTemplates = normalizeTemplateStore(world);
  const nextState = pruneState(parsed.state as GameState);
  return GameSessionSchema.parse({
    ...parsed,
    state: nextState,
    world: {
      locationCards: normalizedTemplates.locationCards,
      personCards: normalizedTemplates.personCards,
      itemCards: world.itemCards && typeof world.itemCards === "object" ? world.itemCards : {},
      eventCards: normalizedTemplates.eventCards,
      sceneCards: normalizedTemplates.sceneCards,
      protagonistCard: world.protagonistCard ?? null,
    },
  });
}

export interface GameRepository {
  init(): Promise<void>;
  saveGame(session: GameSession): Promise<void>;
  loadGame(gameId: string): Promise<GameSession>;
  loadTemplates(): Promise<TemplateStore>;
  getTemplate(kind: CardKind, id: string): Promise<StoredCard | undefined>;
  saveTemplate(kind: CardKind, id: string, card: StoredCard): Promise<void>;
  saveProtagonistTemplate(card: ProtagonistCard): Promise<void>;
  appendActionLog(entry: Record<string, unknown>): Promise<void>;
  appendGenerationLog(entry: Record<string, unknown>): Promise<void>;
}

export class FileGameRepository implements GameRepository {
  private readonly runtimeDir: string;
  private readonly gamesDir: string;
  private readonly templatesPath: string;
  private readonly actionLogPath: string;
  private readonly generationLogPath: string;

  constructor(rootDir: string) {
    this.runtimeDir = path.join(rootDir, ".runtime");
    this.gamesDir = path.join(this.runtimeDir, "games");
    this.templatesPath = path.join(this.runtimeDir, "templates.json");
    this.actionLogPath = path.join(this.runtimeDir, "action-log.jsonl");
    this.generationLogPath = path.join(this.runtimeDir, "generation-log.jsonl");
  }

  async init() {
    await mkdir(this.gamesDir, { recursive: true });
    try {
      await readFile(this.templatesPath, "utf8");
    } catch {
      await writeFile(this.templatesPath, JSON.stringify(emptyTemplateStore, null, 2), "utf8");
    }
  }

  private gamePath(gameId: string) {
    return path.join(this.gamesDir, `${gameId}.json`);
  }

  async saveGame(session: GameSession) {
    await writeFile(this.gamePath(session.id), JSON.stringify(session, null, 2), "utf8");
  }

  async loadGame(gameId: string) {
    const raw = await readFile(this.gamePath(gameId), "utf8");
    return normalizeGameSession(JSON.parse(raw));
  }

  async loadTemplates() {
    const raw = await readFile(this.templatesPath, "utf8");
    return normalizeTemplateStore(JSON.parse(raw));
  }

  async getTemplate(kind: CardKind, id: string) {
    const templates = await this.loadTemplates();
    return templates[kind][id];
  }

  async saveTemplate(kind: CardKind, id: string, card: StoredCard) {
    const templates = await this.loadTemplates();
    templates[kind][id] = card as never;
    await writeFile(this.templatesPath, JSON.stringify(templates, null, 2), "utf8");
  }

  async saveProtagonistTemplate(card: ProtagonistCard) {
    const templates = await this.loadTemplates();
    templates.protagonistCard = card;
    await writeFile(this.templatesPath, JSON.stringify(templates, null, 2), "utf8");
  }

  async appendActionLog(entry: Record<string, unknown>) {
    await appendFile(this.actionLogPath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async appendGenerationLog(entry: Record<string, unknown>) {
    await appendFile(this.generationLogPath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}
