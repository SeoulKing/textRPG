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
import { SAVE_VERSION, baseLocations } from "./base-data";
import { basePeople } from "./data/people";
import { worldRegistry } from "./data/registry";
import { formatLogTimestamp } from "./state-utils";

export type CardKind = "locationCards" | "personCards" | "itemCards" | "eventCards" | "sceneCards";
export type StoredCard = LocationCard | PersonCard | ItemCard | EventCard | SceneCard;

const validLocationIds = new Set(Object.keys(baseLocations));
const validQuestIds = new Set(Object.keys(worldRegistry.quests));
const validSceneIds = new Set(Object.keys(worldRegistry.scenes));
const validEventFlags = new Set(Object.keys(worldRegistry.events).map((eventId) => `event_seen_${eventId}`));
const validItemIds = new Set(Object.keys(worldRegistry.items));
const validStockNodeLocationIds = new Map<string, string>();
const validStockStateKeys = new Set<string>();

for (const location of Object.values(baseLocations)) {
  for (const node of location.stockNodes) {
    validStockNodeLocationIds.set(node.id, location.id);
    for (const item of node.items) {
      validStockStateKeys.add(`${location.id}:${node.id}:${item.itemId}`);
    }
  }
}

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
    Array.from(validQuestIds).map((questId) => [questId, quests[questId] ?? "inactive"]),
  ) as Record<string, "inactive" | "active" | "completed">;
}

function pruneStockState(rawStockState: unknown) {
  if (!rawStockState || typeof rawStockState !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawStockState).filter(([key, value]) =>
      validStockStateKeys.has(key) && Number.isInteger(value) && Number(value) >= 0,
    ),
  ) as Record<string, number>;
}

function pruneDiscoveredStockNodes(rawNodeIds: unknown) {
  if (!Array.isArray(rawNodeIds)) {
    return [];
  }

  return Array.from(
    new Set(
      rawNodeIds.filter((nodeId): nodeId is string =>
        typeof nodeId === "string" && validStockNodeLocationIds.has(nodeId),
      ),
    ),
  );
}

function normalizeInt(value: unknown, fallback: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(maximum, Math.floor(Number(value))));
}

function normalizeStringArray(rawValue: unknown) {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue.filter((entry): entry is string => typeof entry === "string");
}

function translateLegacyLogMessage(message: string): string {
  if (message === "You wake up in the shelter and decide today has to count.") {
    return "눈을 뜬 당신은 오늘 하루만큼은 반드시 버텨 내기로 마음먹는다.";
  }
  if (message === "Your mind gives out before the city does.") {
    return "도시보다 먼저 정신이 무너졌다.";
  }
  if (message === "Your body can no longer keep up with survival.") {
    return "몸이 더는 생존을 버텨 내지 못했다.";
  }
  if (message.startsWith("Game over: ")) {
    return `생존 실패: ${translateLegacyLogMessage(message.slice("Game over: ".length))}`;
  }
  const dayMatch = message.match(/^Day (\d+) begins\.$/);
  if (dayMatch) {
    return `${dayMatch[1]}일차가 시작된다.`;
  }
  const moveMatch = message.match(/^You move to (.+)\.$/);
  if (moveMatch) {
    return `${moveMatch[1]}(으)로 움직였다.`;
  }
  const useItemMatch = message.match(/^You use (.+)\.$/);
  if (useItemMatch) {
    return `${useItemMatch[1]}을(를) 사용했다.`;
  }
  return message;
}

function normalizeLogEntries(rawValue: unknown, day: number, worldElapsedMs: number): GameState["log"] {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  const fallbackTimestampLabel = formatLogTimestamp(day, worldElapsedMs);
  return rawValue.flatMap((entry) => {
    if (typeof entry === "string") {
      return [{
        timestampLabel: fallbackTimestampLabel,
        message: translateLegacyLogMessage(entry),
      }];
    }

    if (!entry || typeof entry !== "object") {
      return [];
    }

    const rawEntry = entry as Record<string, unknown>;
    const message = typeof rawEntry.message === "string"
      ? translateLegacyLogMessage(rawEntry.message)
      : "";
    if (!message) {
      return [];
    }

    return [{
      timestampLabel: typeof rawEntry.timestampLabel === "string" && rawEntry.timestampLabel
        ? rawEntry.timestampLabel
        : fallbackTimestampLabel,
      message,
    }];
  }).slice(0, 20);
}

function normalizeInventory(rawInventory: unknown) {
  if (!rawInventory || typeof rawInventory !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawInventory).filter(([itemId, quantity]) =>
      validItemIds.has(itemId) && Number.isInteger(quantity) && Number(quantity) >= 0,
    ),
  ) as Record<string, number>;
}

function normalizeStats(rawStats: unknown) {
  const stats = (rawStats && typeof rawStats === "object" ? rawStats : {}) as Record<string, unknown>;
  return {
    hp: normalizeInt(stats.hp, 8, 0, 10),
    mind: normalizeInt(stats.mind, 6, 0, 10),
    fullness: normalizeInt(stats.fullness, 7, 0, 10),
  };
}

function pruneState(state: unknown): GameState {
  const rawState = (state && typeof state === "object" ? state : {}) as Partial<GameState> & Record<string, unknown>;
  const rawLocation = typeof rawState.location === "string" ? rawState.location : "shelter";
  const nextLocation = validLocationIds.has(rawLocation) ? rawLocation : "shelter";
  const nextDay = normalizeInt(rawState.day, 1, 1);
  const nextWorldElapsedMs = normalizeInt(rawState.worldElapsedMs, 0, 0);
  const nextFlags = pruneFlags(
    rawState.flags && typeof rawState.flags === "object"
      ? rawState.flags as Record<string, boolean | number | string>
      : {},
  );
  const nextQuests = pruneQuests(
    rawState.quests && typeof rawState.quests === "object"
      ? rawState.quests as Record<string, "inactive" | "active" | "completed">
      : {},
  );
  const nextStockState = pruneStockState(rawState.stockState);
  const discoveredStockNodeIds = pruneDiscoveredStockNodes(rawState.discoveredStockNodeIds);
  const rawActiveStockNodeId = typeof rawState.activeStockNodeId === "string" ? rawState.activeStockNodeId : null;
  const activeStockNodeId = rawActiveStockNodeId && validStockNodeLocationIds.get(rawActiveStockNodeId) === nextLocation
    ? rawActiveStockNodeId
    : null;
  nextFlags[`visited_${nextLocation}`] = true;
  return {
    saveVersion: SAVE_VERSION,
    location: nextLocation,
    sceneId: typeof rawState.sceneId === "string" && validSceneIds.has(rawState.sceneId)
      ? rawState.sceneId
      : fallbackSceneId(nextLocation),
    day: nextDay,
    phaseIndex: normalizeInt(rawState.phaseIndex, 0, 0, 4),
    worldElapsedMs: nextWorldElapsedMs,
    lastRealTimestamp: normalizeInt(rawState.lastRealTimestamp, Date.now(), 0),
    autoFullnessElapsedMs: normalizeInt(rawState.autoFullnessElapsedMs, 0, 0),
    starvationElapsedMs: normalizeInt(rawState.starvationElapsedMs, 0, 0),
    isGameOver: typeof rawState.isGameOver === "boolean" ? rawState.isGameOver : false,
    gameOverReason: typeof rawState.gameOverReason === "string" ? rawState.gameOverReason : "",
    stageClear: typeof rawState.stageClear === "boolean" ? rawState.stageClear : false,
    stats: normalizeStats(rawState.stats),
    money: normalizeInt(rawState.money, 0, 0),
    skills: normalizeStringArray(rawState.skills),
    inventory: normalizeInventory(rawState.inventory),
    flags: nextFlags,
    quests: nextQuests,
    lastSleepFullness: normalizeInt(rawState.lastSleepFullness, 8, 0, 10),
    starvationLevel: normalizeInt(rawState.starvationLevel, 0, 0),
    log: normalizeLogEntries(rawState.log, nextDay, nextWorldElapsedMs),
    systemNote: typeof rawState.systemNote === "string" ? rawState.systemNote : "",
    stockState: nextStockState,
    discoveredStockNodeIds: activeStockNodeId && !discoveredStockNodeIds.includes(activeStockNodeId)
      ? [...discoveredStockNodeIds, activeStockNodeId]
      : discoveredStockNodeIds,
    activeStockNodeId,
  };
}

function normalizeItemCards(raw: unknown) {
  const cards = raw && typeof raw === "object" ? raw as Record<string, ItemCard> : {};
  return Object.fromEntries(
    Object.entries(cards).filter(([id]) => validItemIds.has(id)),
  );
}

export function normalizeTemplateStore(raw: unknown): TemplateStore {
  const parsed = (raw && typeof raw === "object" ? raw : {}) as Partial<TemplateStore> & Record<string, unknown>;

  return TemplateStoreSchema.parse({
    locationCards: {},
    personCards: {},
    itemCards: normalizeItemCards(parsed.itemCards),
    eventCards: {},
    sceneCards: {},
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
      itemCards: normalizedTemplates.itemCards,
      eventCards: normalizedTemplates.eventCards,
      sceneCards: normalizedTemplates.sceneCards,
      protagonistCard: normalizedTemplates.protagonistCard,
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
      const raw = await readFile(this.templatesPath, "utf8");
      const normalized = normalizeTemplateStore(JSON.parse(raw));
      await writeFile(this.templatesPath, JSON.stringify(normalized, null, 2), "utf8");
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
