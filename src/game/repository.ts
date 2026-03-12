import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import {
  GameSessionSchema,
  TemplateStoreSchema,
  type EventCard,
  type GameSession,
  type ItemCard,
  type LocationCard,
  type PersonCard,
  type ProtagonistCard,
  type SceneCard,
  type TemplateStore,
} from "./schemas";
import { baseLocations } from "./base-data";

export type CardKind = "locationCards" | "personCards" | "itemCards" | "eventCards" | "sceneCards";
export type StoredCard = LocationCard | PersonCard | ItemCard | EventCard | SceneCard;

export const emptyTemplateStore: TemplateStore = {
  locationCards: {},
  personCards: {},
  itemCards: {},
  eventCards: {},
  sceneCards: {},
  protagonistCard: null,
};

export function normalizeTemplateStore(raw: unknown): TemplateStore {
  const parsed = (raw && typeof raw === "object" ? raw : {}) as Partial<TemplateStore> & Record<string, unknown>;
  const locationCards = parsed.locationCards && typeof parsed.locationCards === "object" ? parsed.locationCards : {};
  const eventCards = parsed.eventCards && typeof parsed.eventCards === "object" ? parsed.eventCards : {};
  const sceneCards = parsed.sceneCards && typeof parsed.sceneCards === "object" ? parsed.sceneCards : {};

  const normalizedLocationCards = Object.fromEntries(
    Object.entries(locationCards).map(([id, value]) => {
      const card = value as Record<string, unknown>;
      const base = baseLocations[id];
      return [id, {
        ...card,
        traits: Array.isArray(card.traits) ? card.traits : (base?.traits || []),
        obtainableItemIds: Array.isArray(card.obtainableItemIds) ? card.obtainableItemIds : (base?.obtainableItemIds || []),
        residentIds: Array.isArray(card.residentIds) ? card.residentIds : (base?.residentIds || []),
      }];
    }),
  );

  const normalizedEventCards = Object.fromEntries(
    Object.entries(eventCards).map(([id, value]) => {
      const card = value as Record<string, unknown>;
      const locationId = typeof card.locationId === "string" ? card.locationId : "shelter";
      const rawChoices = Array.isArray(card.choices) ? card.choices : [];
      return [id, {
        ...card,
        choices: rawChoices.map((choice, index) => {
          const rawChoice = choice as Record<string, unknown>;
          return {
            id: typeof rawChoice.id === "string" ? rawChoice.id : `${id}:choice:${index}`,
            label: typeof rawChoice.label === "string" ? rawChoice.label : "주변을 살핀다",
            outcomeHint: typeof rawChoice.outcomeHint === "string" ? rawChoice.outcomeHint : "현재 상황을 더 읽어낸다.",
            serverActionHint: (rawChoice.serverActionHint && typeof rawChoice.serverActionHint === "object")
              ? rawChoice.serverActionHint
              : {
                  type: "generate_event",
                  locationId,
                },
          };
        }),
      }];
    }),
  );

  const normalizedSceneCards = Object.fromEntries(
    Object.entries(sceneCards).map(([id, value]) => {
      const card = value as Record<string, unknown>;
      const locationId = typeof card.locationId === "string" ? card.locationId : "shelter";
      const rawChoicesSource = Array.isArray(card.choices)
        ? card.choices
        : [{ id: `${id}:event`, label: "주변을 살핀다", outcomeHint: "현재 장소에서 이어질 사건이나 단서를 끌어낸다.", serverActionHint: { type: "generate_event", locationId } }];
      let rawChoices = rawChoicesSource
        .filter((c: Record<string, unknown>) => (c.serverActionHint as Record<string, unknown>)?.type !== "travel");
      if (rawChoices.length === 0) {
        rawChoices = [{ id: `${id}:event`, label: "주변을 살핀다", outcomeHint: "현재 장소에서 이어질 사건이나 단서를 끌어낸다.", serverActionHint: { type: "generate_event", locationId } }];
      }
      return [id, {
        ...card,
        choices: rawChoices.map((choice, index) => {
          const rawChoice = choice as Record<string, unknown>;
          return {
            id: typeof rawChoice.id === "string" ? rawChoice.id : `${id}:choice:${index}`,
            label: typeof rawChoice.label === "string" ? rawChoice.label : "행동한다",
            outcomeHint: typeof rawChoice.outcomeHint === "string" ? rawChoice.outcomeHint : "다음 선택으로 이어진다.",
            serverActionHint: (rawChoice.serverActionHint && typeof rawChoice.serverActionHint === "object")
              ? rawChoice.serverActionHint
              : {
                  type: "generate_event",
                  locationId,
                },
          };
        }),
        materialIds: (card.materialIds && typeof card.materialIds === "object")
          ? card.materialIds
          : {
              locationIds: typeof card.locationId === "string" ? [card.locationId] : [],
              personIds: [],
              itemIds: [],
            },
      }];
    }),
  );

  return TemplateStoreSchema.parse({
    locationCards: normalizedLocationCards,
    personCards: parsed.personCards && typeof parsed.personCards === "object" ? parsed.personCards : {},
    itemCards: parsed.itemCards && typeof parsed.itemCards === "object" ? parsed.itemCards : {},
    eventCards: normalizedEventCards,
    sceneCards: normalizedSceneCards,
    protagonistCard: parsed.protagonistCard ?? null,
  });
}

export function normalizeGameSession(raw: unknown): GameSession {
  const parsed = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const world = (parsed.world && typeof parsed.world === "object") ? parsed.world as Record<string, unknown> : {};
  const normalizedTemplates = normalizeTemplateStore(world);
  return GameSessionSchema.parse({
    ...parsed,
    world: {
      locationCards: normalizedTemplates.locationCards,
      personCards: world.personCards && typeof world.personCards === "object" ? world.personCards : {},
      itemCards: world.itemCards && typeof world.itemCards === "object" ? world.itemCards : {},
      eventCards: world.eventCards && typeof world.eventCards === "object" ? world.eventCards : {},
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
