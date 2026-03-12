import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import type { GameSession, ProtagonistCard, TemplateStore } from "./schemas";
import type { CardKind, GameRepository, StoredCard } from "./repository";
import { emptyTemplateStore, normalizeGameSession, normalizeTemplateStore } from "./repository";

export class PostgresGameRepository implements GameRepository {
  private readonly pool: Pool;
  private readonly schemaPath: string;

  constructor(databaseUrl: string, rootDir: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
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
