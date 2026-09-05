import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import type { GameSession, ProtagonistCard, TemplateStore } from "./schemas";
import type { AuthUser, AuthUserInput, CardKind, GameRepository, ManualSaveRecord, StoredCard } from "./repository";
import { buildManualSaveInfo, emptyTemplateStore, normalizeGameSession, normalizeTemplateStore } from "./repository";

export class PostgresGameRepository implements GameRepository {
  private readonly pool: Pool;
  private readonly lockPool: Pool;
  private readonly schemaPath: string;

  constructor(databaseUrl: string, rootDir: string) {
    const connectionOptions = {
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
    };
    this.pool = new Pool(connectionOptions);
    // Lock waiters use a separate, small pool so they cannot occupy every data
    // connection while the lock holder is trying to load or save the session.
    this.lockPool = new Pool({
      ...connectionOptions,
      max: 4,
    });
    this.schemaPath = path.join(rootDir, "src", "db", "schema.sql");
  }

  async init() {
    const sql = await readFile(this.schemaPath, "utf8");
    await this.pool.query(sql);

    await this.pool.query(
      `insert into content_templates (kind, template_id, payload)
       values ($1, $2, $3)
       on conflict (kind, template_id) do nothing`,
      ["__meta__", "bootstrap", JSON.stringify(emptyTemplateStore)],
    );
  }

  async withGameLock<T>(gameId: string, operation: () => Promise<T>) {
    const client = await this.lockPool.connect();
    let transactionOpen = false;
    try {
      await client.query("begin");
      transactionOpen = true;
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [gameId],
      );
      const result = await operation();
      await client.query("commit");
      transactionOpen = false;
      return result;
    } catch (error) {
      if (transactionOpen) {
        await client.query("rollback").catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async saveGame(session: GameSession) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into game_sessions (id, created_at, updated_at, state_payload)
         values ($1, $2::timestamptz, $3::timestamptz, $4::jsonb)
         on conflict (id) do update
         set updated_at = excluded.updated_at,
             state_payload = excluded.state_payload`,
        [session.id, session.createdAt, session.updatedAt, JSON.stringify(session.state)],
      );
      await client.query(
        `insert into world_instances (game_id, world_payload)
         values ($1, $2::jsonb)
         on conflict (game_id) do update
         set world_payload = excluded.world_payload`,
        [session.id, JSON.stringify(session.world)],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async loadGame(gameId: string) {
    const result = await this.pool.query(
      `select gs.id, gs.created_at, gs.updated_at, gs.state_payload, wi.world_payload
       from game_sessions gs
       join world_instances wi on wi.game_id = gs.id
       where gs.id = $1`,
      [gameId],
    );
    if (result.rowCount === 0) {
      throw new Error("게임 세션을 찾을 수 없습니다.");
    }

    const row = result.rows[0] as {
      id: string;
      created_at: Date | string;
      updated_at: Date | string;
      state_payload: unknown;
      world_payload: unknown;
    };
    return normalizeGameSession({
      id: row.id,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      state: row.state_payload,
      world: row.world_payload,
    });
  }

  async saveManualGame(session: GameSession, savedAt: string, ownerId: string | null = null) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      if (ownerId) {
        await client.query(
          "delete from manual_saves where owner_id = $1 and game_id <> $2",
          [ownerId, session.id],
        );
      }
      await client.query(
        `insert into manual_saves (game_id, owner_id, saved_at, state_payload, world_payload)
         values ($1, $2, $3::timestamptz, $4::jsonb, $5::jsonb)
         on conflict (game_id) do update
         set owner_id = excluded.owner_id,
             saved_at = excluded.saved_at,
             state_payload = excluded.state_payload,
             world_payload = excluded.world_payload`,
        [session.id, ownerId, savedAt, JSON.stringify(session.state), JSON.stringify(session.world)],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return buildManualSaveInfo(session.id, { savedAt, session, ownerId });
  }

  async loadManualGame(gameId: string): Promise<ManualSaveRecord | null> {
    const result = await this.pool.query(
      `select game_id, owner_id, saved_at, state_payload, world_payload
       from manual_saves
       where game_id = $1`,
      [gameId],
    );
    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0] as {
      game_id: string;
      owner_id: string | null;
      saved_at: Date | string;
      state_payload: unknown;
      world_payload: unknown;
    };
    const savedAt = new Date(row.saved_at).toISOString();
    return {
      savedAt,
      ownerId: row.owner_id,
      session: normalizeGameSession({
        id: row.game_id,
        createdAt: savedAt,
        updatedAt: savedAt,
        state: row.state_payload,
        world: row.world_payload,
      }),
    };
  }

  async loadManualGameForUser(ownerId: string): Promise<ManualSaveRecord | null> {
    const result = await this.pool.query(
      `select game_id, owner_id, saved_at, state_payload, world_payload
       from manual_saves
       where owner_id = $1`,
      [ownerId],
    );
    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0] as {
      game_id: string;
      owner_id: string | null;
      saved_at: Date | string;
      state_payload: unknown;
      world_payload: unknown;
    };
    const savedAt = new Date(row.saved_at).toISOString();
    return {
      savedAt,
      ownerId: row.owner_id,
      session: normalizeGameSession({
        id: row.game_id,
        createdAt: savedAt,
        updatedAt: savedAt,
        state: row.state_payload,
        world: row.world_payload,
      }),
    };
  }

  async getManualSaveInfo(gameId: string) {
    return buildManualSaveInfo(gameId, await this.loadManualGame(gameId));
  }

  async getManualSaveInfoForUser(ownerId: string) {
    const record = await this.loadManualGameForUser(ownerId);
    return buildManualSaveInfo(record?.session.id ?? "", record);
  }

  async upsertAuthUser(user: AuthUserInput): Promise<AuthUser> {
    const result = await this.pool.query(
      `insert into auth_users (id, provider, provider_user_id, nickname, email, created_at, updated_at)
       values ($1, $2, $3, $4, $5, now(), now())
       on conflict (provider, provider_user_id) do update
       set nickname = excluded.nickname,
           email = excluded.email,
           updated_at = now()
       returning id, provider, provider_user_id, nickname, email, created_at, updated_at`,
      [user.id, user.provider, user.providerUserId, user.nickname, user.email],
    );
    return this.authUserFromRow(result.rows[0]);
  }

  async loadAuthUser(userId: string): Promise<AuthUser | null> {
    const result = await this.pool.query(
      `select id, provider, provider_user_id, nickname, email, created_at, updated_at
       from auth_users
       where id = $1`,
      [userId],
    );
    return result.rowCount ? this.authUserFromRow(result.rows[0]) : null;
  }

  private authUserFromRow(row: {
    id: string;
    provider: AuthUser["provider"];
    provider_user_id: string;
    nickname: string | null;
    email: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }): AuthUser {
    return {
      id: row.id,
      provider: row.provider,
      providerUserId: row.provider_user_id,
      nickname: row.nickname,
      email: row.email,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async loadTemplates() {
    const result = await this.pool.query(
      `select kind, template_id, payload
       from content_templates
       where kind <> '__meta__'`,
    );

    const store: TemplateStore = {
      ...emptyTemplateStore,
      locationCards: {},
      personCards: {},
      itemCards: {},
      eventCards: {},
      sceneCards: {},
      protagonistCard: null,
    };

    for (const row of result.rows as Array<{ kind: string; template_id: string; payload: unknown }>) {
      if (row.kind === "protagonistCard") {
        store.protagonistCard = row.payload as ProtagonistCard;
        continue;
      }
      const bucket = store[row.kind as CardKind] as Record<string, unknown> | undefined;
      if (bucket) {
        bucket[row.template_id] = row.payload;
      }
    }

    return normalizeTemplateStore(store);
  }

  async getTemplate(kind: CardKind, id: string) {
    const result = await this.pool.query(
      `select payload from content_templates where kind = $1 and template_id = $2`,
      [kind, id],
    );
    return result.rowCount ? (result.rows[0].payload as StoredCard) : undefined;
  }

  async saveTemplate(kind: CardKind, id: string, card: StoredCard) {
    await this.pool.query(
      `insert into content_templates (kind, template_id, payload)
       values ($1, $2, $3::jsonb)
       on conflict (kind, template_id) do update
       set payload = excluded.payload`,
      [kind, id, JSON.stringify(card)],
    );
  }

  async saveProtagonistTemplate(card: ProtagonistCard) {
    await this.pool.query(
      `insert into content_templates (kind, template_id, payload)
       values ('protagonistCard', 'protagonist', $1::jsonb)
       on conflict (kind, template_id) do update
       set payload = excluded.payload`,
      [JSON.stringify(card)],
    );
  }

  async appendActionLog(entry: Record<string, unknown>) {
    await this.pool.query(
      `insert into action_logs (game_id, payload)
       values ($1, $2::jsonb)`,
      [String(entry.gameId ?? ""), JSON.stringify(entry)],
    );
  }

  async appendGenerationLog(entry: Record<string, unknown>) {
    await this.pool.query(
      `insert into generation_logs (game_id, kind, payload)
       values ($1, $2, $3::jsonb)`,
      [String(entry.gameId ?? ""), String(entry.kind ?? "unknown"), JSON.stringify(entry)],
    );
  }
}
