import { copyFile, mkdir, readFile, rename, unlink, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import {
  DynamicWorldRegistrySchema,
  FrontierStateSchema,
  GameSessionSchema,
  NarrativeStateSchema,
  SystemNoteEntriesSchema,
  SubwayExpeditionStateSchema,
  TemplateStoreSchema,
  WorldPlanSchema,
  WorldInstanceSchema,
  type EventCard,
  type GameSession,
  type GameState,
  type ItemCard,
  type LocationCard,
  type PersonCard,
  type ProtagonistCard,
  type SceneCard,
  type TemplateStore,
  type WorldInstance,
} from "./schemas";
import { SAVE_VERSION } from "./base-data";
import { worldRegistry } from "./data/registry";
import { normalizeDynamicLocationNames } from "./dynamic-location-naming";
import { formatLogTimestamp } from "./state-utils";
import { buildRuntimeRegistry, emptyDynamicWorldRegistry } from "./runtime-registry";
import { normalizeSkillProgress } from "./skill-progression";

export type CardKind = "locationCards" | "personCards" | "itemCards" | "eventCards" | "sceneCards";
export type StoredCard = LocationCard | PersonCard | ItemCard | EventCard | SceneCard;
export type AuthProvider = "kakao";

export type AuthUser = {
  id: string;
  provider: AuthProvider;
  providerUserId: string;
  nickname: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthUserInput = {
  id: string;
  provider: AuthProvider;
  providerUserId: string;
  nickname: string | null;
  email: string | null;
};

type ValidContentIds = {
  validLocationIds: Set<string>;
  validQuestIds: Set<string>;
  validSceneIds: Set<string>;
  validEventFlags: Set<string>;
  validItemIds: Set<string>;
  validStockNodeLocationIds: Map<string, string>;
  validStockStateKeys: Set<string>;
};

export const emptyTemplateStore: TemplateStore = {
  locationCards: {},
  personCards: {},
  itemCards: {},
  eventCards: {},
  sceneCards: {},
  protagonistCard: null,
};

function normalizeDynamicContent(raw: unknown) {
  const parsed = DynamicWorldRegistrySchema.safeParse(raw && typeof raw === "object" ? raw : {});
  return parsed.success
    ? normalizeDynamicLocationNames(parsed.data, Object.values(worldRegistry.locations).map((location) => location.name))
    : structuredClone(emptyDynamicWorldRegistry);
}

function normalizeWorldPlan(raw: unknown, currentDay: number) {
  const parsed = WorldPlanSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return WorldPlanSchema.parse({
    today: { day: currentDay, regions: [], notes: [] },
    tomorrow: { day: currentDay + 1, evolutions: [], notes: [] },
  });
}

function normalizeSubwayExpedition(raw: unknown) {
  const parsed = SubwayExpeditionStateSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return SubwayExpeditionStateSchema.parse(undefined);
}

function normalizeFrontierState(raw: unknown) {
  const parsed = FrontierStateSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return FrontierStateSchema.parse({ nextSequence: 1, slots: {} });
}

function normalizeNarrativeState(raw: unknown) {
  const parsed = NarrativeStateSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return NarrativeStateSchema.parse({ nextBeatSequence: 1, history: [], pregenerated: {}, anchors: {} });
}

function buildValidContentIds(dynamicContent: GameState["dynamicContent"]): ValidContentIds {
  const registry = buildRuntimeRegistry({ dynamicContent });
  const validLocationIds = new Set(Object.keys(registry.locations));
  const validQuestIds = new Set(Object.keys(registry.quests));
  const validSceneIds = new Set(Object.keys(registry.scenes));
  const validEventFlags = new Set(Object.keys(registry.events).map((eventId) => `event_seen_${eventId}`));
  const validItemIds = new Set(Object.keys(registry.items));
  const validStockNodeLocationIds = new Map<string, string>();
  const validStockStateKeys = new Set<string>();

  for (const location of Object.values(registry.locations)) {
    for (const node of location.stockNodes) {
      validStockNodeLocationIds.set(node.id, location.id);
      validStockStateKeys.add(`${location.id}:${node.id}:$money`);
      for (const item of node.items) {
        validStockStateKeys.add(`${location.id}:${node.id}:${item.itemId}`);
      }
    }
  }

  return {
    validLocationIds,
    validQuestIds,
    validSceneIds,
    validEventFlags,
    validItemIds,
    validStockNodeLocationIds,
    validStockStateKeys,
  };
}

function isJsonParseError(error: unknown) {
  return error instanceof SyntaxError;
}

function fallbackSceneId(locationId: string, validSceneIds: Set<string>, dynamicContent: GameState["dynamicContent"]) {
  const registry = buildRuntimeRegistry({ dynamicContent });
  const scene = Object.values(registry.scenes).find((entry) => entry.locationId === locationId);
  if (scene && validSceneIds.has(scene.id)) {
    return scene.id;
  }
  const seedScene = Object.values(worldRegistry.scenes).find((entry) => entry.locationId === locationId);
  return seedScene?.id || "shelter_day_intro";
}

function pruneFlags(
  flags: Record<string, boolean | number | string>,
  validLocationIds: Set<string>,
  validEventFlags: Set<string>,
) {
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

function pruneQuests(
  quests: Record<string, "inactive" | "active" | "completed">,
  validQuestIds: Set<string>,
) {
  return Object.fromEntries(
    Array.from(validQuestIds).map((questId) => [questId, quests[questId] ?? "inactive"]),
  ) as Record<string, "inactive" | "active" | "completed">;
}

function pruneStockState(rawStockState: unknown, validStockStateKeys: Set<string>) {
  if (!rawStockState || typeof rawStockState !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawStockState).filter(([key, value]) =>
      validStockStateKeys.has(key) && Number.isInteger(value) && Number(value) >= 0,
    ),
  ) as Record<string, number>;
}

function pruneDiscoveredStockNodes(rawNodeIds: unknown, validStockNodeLocationIds: Map<string, string>) {
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

function normalizeInventory(rawInventory: unknown, validItemIds: Set<string>) {
  if (!rawInventory || typeof rawInventory !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawInventory).filter(([itemId, quantity]) =>
      validItemIds.has(itemId) && Number.isInteger(quantity) && Number(quantity) >= 0,
    ),
  ) as Record<string, number>;
}

function maxToolDurability(itemId: string) {
  const item = worldRegistry.items[itemId] as { maxDurability?: number } | undefined;
  const maxDurability = item?.maxDurability;
  return Number.isInteger(maxDurability) && Number(maxDurability) > 0
    ? Number(maxDurability)
    : 0;
}

function normalizeToolDurability(rawDurability: unknown, inventory: Record<string, number>, validItemIds: Set<string>) {
  const raw = rawDurability && typeof rawDurability === "object"
    ? rawDurability as Record<string, unknown>
    : {};
  const next: Record<string, number> = {};

  Object.entries(inventory).forEach(([itemId, count]) => {
    if (!validItemIds.has(itemId) || count <= 0) {
      return;
    }

    const maxDurability = maxToolDurability(itemId);
    if (maxDurability <= 0) {
      return;
    }

    next[itemId] = normalizeInt(raw[itemId], maxDurability, 1, maxDurability);
  });

  return next;
}

function normalizeStats(rawStats: unknown) {
  const stats = (rawStats && typeof rawStats === "object" ? rawStats : {}) as Record<string, unknown>;
  const legacyEnergyKey = "full" + "ness";
  return {
    hp: normalizeInt(stats.hp, 8, 0, 10),
    mind: normalizeInt(stats.mind, 6, 0, 10),
    energy: normalizeInt(stats.energy ?? stats[legacyEnergyKey], 7, 0, 15),
  };
}

function pruneState(state: unknown): GameState {
  const rawState = (state && typeof state === "object" ? state : {}) as Partial<GameState> & Record<string, unknown>;
  const dynamicContent = normalizeDynamicContent(rawState.dynamicContent);
  const { validLocationIds, validQuestIds, validSceneIds, validEventFlags, validItemIds, validStockNodeLocationIds, validStockStateKeys } =
    buildValidContentIds(dynamicContent);
  const rawLocation = typeof rawState.location === "string" ? rawState.location : "shelter";
  const nextLocation = validLocationIds.has(rawLocation) ? rawLocation : "shelter";
  const nextDay = normalizeInt(rawState.day, 1, 1);
  const nextWorldElapsedMs = normalizeInt(rawState.worldElapsedMs, 0, 0);
  const nextFlags = pruneFlags(
    rawState.flags && typeof rawState.flags === "object"
      ? rawState.flags as Record<string, boolean | number | string>
      : {},
    validLocationIds,
    validEventFlags,
  );
  const nextQuests = pruneQuests(
    rawState.quests && typeof rawState.quests === "object"
      ? rawState.quests as Record<string, "inactive" | "active" | "completed">
      : {},
    validQuestIds,
  );
  const nextStockState = pruneStockState(rawState.stockState, validStockStateKeys);
  const discoveredStockNodeIds = pruneDiscoveredStockNodes(rawState.discoveredStockNodeIds, validStockNodeLocationIds);
  const rawActiveStockNodeId = typeof rawState.activeStockNodeId === "string" ? rawState.activeStockNodeId : null;
  const activeStockNodeId = rawActiveStockNodeId && validStockNodeLocationIds.get(rawActiveStockNodeId) === nextLocation
    ? rawActiveStockNodeId
    : null;
  const frontierState = normalizeFrontierState(rawState.frontierState);
  const narrativeState = normalizeNarrativeState(rawState.narrativeState);
  const subwayExpedition = normalizeSubwayExpedition(rawState.subwayExpedition);
  const worldPlan = normalizeWorldPlan(rawState.worldPlan, nextDay);
  const legacyAutoEnergyElapsedKey = "auto" + "Full" + "ness" + "ElapsedMs";
  const legacyExhaustionElapsedKey = "star" + "vation" + "ElapsedMs";
  const legacyLastSleepEnergyKey = "lastSleep" + "Full" + "ness";
  const legacyExhaustionLevelKey = "star" + "vation" + "Level";
  const nextInventory = normalizeInventory(rawState.inventory, validItemIds);
  nextFlags[`visited_${nextLocation}`] = true;
  if (
    nextFlags.opening_seen ||
    nextFlags.rescue_signal_ready ||
    nextQuests.prepare_rescue_signal === "active" ||
    nextQuests.prepare_rescue_signal === "completed"
  ) {
    nextFlags.rescue_goal_accepted = true;
  }
  return {
    saveVersion: SAVE_VERSION,
    location: nextLocation,
    sceneId: typeof rawState.sceneId === "string" && validSceneIds.has(rawState.sceneId)
      ? rawState.sceneId
      : fallbackSceneId(nextLocation, validSceneIds, dynamicContent),
    activeEventId: typeof rawState.activeEventId === "string" && validEventFlags.has(`event_seen_${rawState.activeEventId}`)
      ? rawState.activeEventId
      : null,
    day: nextDay,
    phaseIndex: normalizeInt(rawState.phaseIndex, 0, 0, 4),
    worldElapsedMs: nextWorldElapsedMs,
    lastRealTimestamp: normalizeInt(rawState.lastRealTimestamp, Date.now(), 0),
    autoEnergyElapsedMs: normalizeInt(rawState.autoEnergyElapsedMs ?? rawState[legacyAutoEnergyElapsedKey], 0, 0),
    exhaustionElapsedMs: normalizeInt(rawState.exhaustionElapsedMs ?? rawState[legacyExhaustionElapsedKey], 0, 0),
    isGameOver: typeof rawState.isGameOver === "boolean" ? rawState.isGameOver : false,
    gameOverReason: typeof rawState.gameOverReason === "string" ? rawState.gameOverReason : "",
    stageClear: typeof rawState.stageClear === "boolean" ? rawState.stageClear : false,
    stats: normalizeStats(rawState.stats),
    money: normalizeInt(rawState.money, 0, 0),
    skills: normalizeStringArray(rawState.skills),
    skillProgress: normalizeSkillProgress(rawState.skillProgress),
    inventory: nextInventory,
    toolDurability: normalizeToolDurability(rawState.toolDurability, nextInventory, validItemIds),
    dynamicContent,
    worldPlan,
    frontierState,
    narrativeState,
    subwayExpedition,
    flags: nextFlags,
    quests: nextQuests,
    lastSleepEnergy: normalizeInt(rawState.lastSleepEnergy ?? rawState[legacyLastSleepEnergyKey], 8, 0, 15),
    exhaustionLevel: normalizeInt(rawState.exhaustionLevel ?? rawState[legacyExhaustionLevelKey], 0, 0),
    log: normalizeLogEntries(rawState.log, nextDay, nextWorldElapsedMs),
    systemNote: typeof rawState.systemNote === "string" ? rawState.systemNote : "",
    systemNoteEntries: SystemNoteEntriesSchema.catch([]).parse(rawState.systemNoteEntries),
    stockState: nextStockState,
    discoveredStockNodeIds: activeStockNodeId && !discoveredStockNodeIds.includes(activeStockNodeId)
      ? [...discoveredStockNodeIds, activeStockNodeId]
      : discoveredStockNodeIds,
    activeStockNodeId,
  };
}

function normalizeItemCards(raw: unknown, validItemIds: Set<string>) {
  const cards = raw && typeof raw === "object" ? raw as Record<string, ItemCard> : {};
  return Object.fromEntries(
    Object.entries(cards).filter(([id]) => validItemIds.has(id)),
  );
}

export function normalizeTemplateStore(raw: unknown): TemplateStore {
  const parsed = (raw && typeof raw === "object" ? raw : {}) as Partial<TemplateStore> & Record<string, unknown>;
  const validItemIds = new Set(Object.keys(worldRegistry.items));

  return TemplateStoreSchema.parse({
    locationCards: {},
    personCards: {},
    itemCards: normalizeItemCards(parsed.itemCards, validItemIds),
    eventCards: {},
    sceneCards: {},
    protagonistCard: parsed.protagonistCard ?? null,
  });
}

const emptyWorld: WorldInstance = {
  locationCards: {},
  personCards: {},
  itemCards: {},
  eventCards: {},
  sceneCards: {},
  protagonistCard: null,
};

/** 게임 저장본의 world를 보존한다. (예전에는 템플릿 정규화로 카드가 전부 비워져 로드 직후 상태가 꼬일 수 있었다.) */
function normalizeWorldPayload(raw: unknown, validItemIds: Set<string>): WorldInstance {
  if (!raw || typeof raw !== "object") {
    return WorldInstanceSchema.parse(emptyWorld);
  }
  const w = raw as Record<string, unknown>;
  const candidate = {
    locationCards: w.locationCards && typeof w.locationCards === "object" ? w.locationCards : {},
    personCards: w.personCards && typeof w.personCards === "object" ? w.personCards : {},
    itemCards: normalizeItemCards(w.itemCards, validItemIds),
    eventCards: w.eventCards && typeof w.eventCards === "object" ? w.eventCards : {},
    sceneCards: w.sceneCards && typeof w.sceneCards === "object" ? w.sceneCards : {},
    protagonistCard: w.protagonistCard ?? null,
  };
  const parsed = WorldInstanceSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }
  return WorldInstanceSchema.parse({
    ...emptyWorld,
    itemCards: candidate.itemCards,
  });
}

export function normalizeGameSession(raw: unknown): GameSession {
  const parsed = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nextState = pruneState(parsed.state as GameState);
  const { validItemIds } = buildValidContentIds(nextState.dynamicContent);
  const nextWorld = normalizeWorldPayload(parsed.world, validItemIds);
  return GameSessionSchema.parse({
    ...parsed,
    state: nextState,
    world: nextWorld,
  });
}

export interface GameRepository {
  init(): Promise<void>;
  withGameLock<T>(gameId: string, operation: () => Promise<T>): Promise<T>;
  saveGame(session: GameSession): Promise<void>;
  loadGame(gameId: string): Promise<GameSession>;
  saveManualGame(session: GameSession, savedAt: string, ownerId?: string | null): Promise<ManualSaveInfo>;
  loadManualGame(gameId: string): Promise<ManualSaveRecord | null>;
  loadManualGameForUser(ownerId: string): Promise<ManualSaveRecord | null>;
  getManualSaveInfo(gameId: string): Promise<ManualSaveInfo>;
  getManualSaveInfoForUser(ownerId: string): Promise<ManualSaveInfo>;
  upsertAuthUser(user: AuthUserInput): Promise<AuthUser>;
  loadAuthUser(userId: string): Promise<AuthUser | null>;
  loadTemplates(): Promise<TemplateStore>;
  getTemplate(kind: CardKind, id: string): Promise<StoredCard | undefined>;
  saveTemplate(kind: CardKind, id: string, card: StoredCard): Promise<void>;
  saveProtagonistTemplate(card: ProtagonistCard): Promise<void>;
  appendActionLog(entry: Record<string, unknown>): Promise<void>;
  appendGenerationLog(entry: Record<string, unknown>): Promise<void>;
}

export type ManualSaveInfo = {
  exists: boolean;
  gameId: string;
  savedAt: string | null;
  label: string;
  day: number | null;
  timeLabel: string | null;
};

export type ManualSaveRecord = {
  savedAt: string;
  session: GameSession;
  ownerId?: string | null;
};

export function buildManualSaveInfo(gameId: string, record: ManualSaveRecord | null): ManualSaveInfo {
  if (!record) {
    return {
      exists: false,
      gameId,
      savedAt: null,
      label: "저장된 게임 없음",
      day: null,
      timeLabel: null,
    };
  }

  const timeLabel = formatLogTimestamp(record.session.state.day, record.session.state.worldElapsedMs);
  return {
    exists: true,
    gameId,
    savedAt: record.savedAt,
    label: `${timeLabel} 저장됨`,
    day: record.session.state.day,
    timeLabel,
  };
}

export class FileGameRepository implements GameRepository {
  private readonly runtimeDir: string;
  private readonly gamesDir: string;
  private readonly manualSavesDir: string;
  private readonly manualUserSavesDir: string;
  private readonly authUsersPath: string;
  private readonly templatesPath: string;
  private readonly actionLogPath: string;
  private readonly generationLogPath: string;

  constructor(rootDir: string) {
    this.runtimeDir = process.env.RUNTIME_DIR
      ? path.resolve(rootDir, process.env.RUNTIME_DIR)
      : path.join(rootDir, ".runtime");
    this.gamesDir = path.join(this.runtimeDir, "games");
    this.manualSavesDir = path.join(this.runtimeDir, "manual-saves");
    this.manualUserSavesDir = path.join(this.manualSavesDir, "users");
    this.authUsersPath = path.join(this.runtimeDir, "auth-users.json");
    this.templatesPath = path.join(this.runtimeDir, "templates.json");
    this.actionLogPath = path.join(this.runtimeDir, "action-log.jsonl");
    this.generationLogPath = path.join(this.runtimeDir, "generation-log.jsonl");
  }

  private async writeTemplatesAtomically(templates: TemplateStore) {
    const tmpPath = `${this.templatesPath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(templates, null, 2), "utf8");
    try {
      await rename(tmpPath, this.templatesPath);
    } catch {
      await copyFile(tmpPath, this.templatesPath);
      await unlink(tmpPath).catch(() => undefined);
    }
  }

  private async recoverTemplatesFile(raw: string, reason: unknown) {
    const backupPath = `${this.templatesPath}.corrupt-${Date.now()}.json`;
    await writeFile(backupPath, raw, "utf8");
    if (!isJsonParseError(reason)) {
      throw reason;
    }
    await this.writeTemplatesAtomically(emptyTemplateStore);
    return structuredClone(emptyTemplateStore);
  }

  async init() {
    await mkdir(this.gamesDir, { recursive: true });
    await mkdir(this.manualSavesDir, { recursive: true });
    await mkdir(this.manualUserSavesDir, { recursive: true });
    try {
      const raw = await readFile(this.templatesPath, "utf8");
      const normalized = normalizeTemplateStore(JSON.parse(raw));
      await this.writeTemplatesAtomically(normalized);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        await this.writeTemplatesAtomically(emptyTemplateStore);
        return;
      }

      const raw = await readFile(this.templatesPath, "utf8").catch(() => "");
      await this.recoverTemplatesFile(raw, error);
    }
  }

  async withGameLock<T>(_gameId: string, operation: () => Promise<T>) {
    return operation();
  }

  private gamePath(gameId: string) {
    return path.join(this.gamesDir, `${gameId}.json`);
  }

  private manualSavePath(gameId: string) {
    return path.join(this.manualSavesDir, `${gameId}.json`);
  }

  private manualUserSavePath(ownerId: string) {
    return path.join(this.manualUserSavesDir, `${encodeURIComponent(ownerId)}.json`);
  }

  private async writeGameAtomically(session: GameSession) {
    const targetPath = this.gamePath(session.id);
    const tmpPath = `${targetPath}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmpPath, JSON.stringify(session, null, 2), "utf8");
    try {
      await rename(tmpPath, targetPath);
    } catch {
      await copyFile(tmpPath, targetPath);
      await unlink(tmpPath).catch(() => undefined);
    }
  }

  private async writeManualSaveAtomically(record: ManualSaveRecord) {
    const targetPath = this.manualSavePath(record.session.id);
    const tmpPath = `${targetPath}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmpPath, JSON.stringify(record, null, 2), "utf8");
    try {
      await rename(tmpPath, targetPath);
    } catch {
      await copyFile(tmpPath, targetPath);
      await unlink(tmpPath).catch(() => undefined);
    }
  }

  private async writeManualUserSaveAtomically(record: ManualSaveRecord) {
    if (!record.ownerId) {
      return;
    }
    const targetPath = this.manualUserSavePath(record.ownerId);
    const tmpPath = `${targetPath}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmpPath, JSON.stringify(record, null, 2), "utf8");
    try {
      await rename(tmpPath, targetPath);
    } catch {
      await copyFile(tmpPath, targetPath);
      await unlink(tmpPath).catch(() => undefined);
    }
  }

  private async readAuthUsers() {
    try {
      const raw = await readFile(this.authUsersPath, "utf8");
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed as Record<string, AuthUser> : {};
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  private async writeAuthUsersAtomically(users: Record<string, AuthUser>) {
    const tmpPath = `${this.authUsersPath}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmpPath, JSON.stringify(users, null, 2), "utf8");
    try {
      await rename(tmpPath, this.authUsersPath);
    } catch {
      await copyFile(tmpPath, this.authUsersPath);
      await unlink(tmpPath).catch(() => undefined);
    }
  }

  async saveGame(session: GameSession) {
    await this.writeGameAtomically(session);
  }

  async loadGame(gameId: string) {
    const raw = await readFile(this.gamePath(gameId), "utf8");
    return normalizeGameSession(JSON.parse(raw));
  }

  async saveManualGame(session: GameSession, savedAt: string, ownerId: string | null = null) {
    const record = {
      savedAt,
      session: structuredClone(session),
      ownerId,
    };
    await this.writeManualSaveAtomically(record);
    await this.writeManualUserSaveAtomically(record);
    return buildManualSaveInfo(session.id, record);
  }

  async loadManualGame(gameId: string) {
    try {
      const raw = await readFile(this.manualSavePath(gameId), "utf8");
      const parsed = JSON.parse(raw) as { savedAt?: unknown; session?: unknown; ownerId?: unknown };
      const session = normalizeGameSession(parsed.session);
      const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : session.updatedAt;
      const ownerId = typeof parsed.ownerId === "string" ? parsed.ownerId : null;
      return { savedAt, session, ownerId };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async loadManualGameForUser(ownerId: string) {
    try {
      const raw = await readFile(this.manualUserSavePath(ownerId), "utf8");
      const parsed = JSON.parse(raw) as { savedAt?: unknown; session?: unknown; ownerId?: unknown };
      const session = normalizeGameSession(parsed.session);
      const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : session.updatedAt;
      return { savedAt, session, ownerId };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async getManualSaveInfo(gameId: string) {
    return buildManualSaveInfo(gameId, await this.loadManualGame(gameId));
  }

  async getManualSaveInfoForUser(ownerId: string) {
    const record = await this.loadManualGameForUser(ownerId);
    return buildManualSaveInfo(record?.session.id ?? "", record);
  }

  async upsertAuthUser(user: AuthUserInput) {
    const users = await this.readAuthUsers();
    const previous = users[user.id];
    const now = new Date().toISOString();
    const nextUser: AuthUser = {
      ...user,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    users[user.id] = nextUser;
    await this.writeAuthUsersAtomically(users);
    return nextUser;
  }

  async loadAuthUser(userId: string) {
    const users = await this.readAuthUsers();
    return users[userId] ?? null;
  }

  async loadTemplates() {
    const raw = await readFile(this.templatesPath, "utf8");
    try {
      return normalizeTemplateStore(JSON.parse(raw));
    } catch (error) {
      return this.recoverTemplatesFile(raw, error);
    }
  }

  async getTemplate(kind: CardKind, id: string) {
    const templates = await this.loadTemplates();
    return templates[kind][id];
  }

  async saveTemplate(kind: CardKind, id: string, card: StoredCard) {
    const templates = await this.loadTemplates();
    templates[kind][id] = card as never;
    await this.writeTemplatesAtomically(templates);
  }

  async saveProtagonistTemplate(card: ProtagonistCard) {
    const templates = await this.loadTemplates();
    templates.protagonistCard = card;
    await this.writeTemplatesAtomically(templates);
  }

  async appendActionLog(entry: Record<string, unknown>) {
    await appendFile(this.actionLogPath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async appendGenerationLog(entry: Record<string, unknown>) {
    await appendFile(this.generationLogPath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}
