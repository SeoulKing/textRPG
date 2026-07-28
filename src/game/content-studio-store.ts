import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import {
  CONTENT_STUDIO_PATH,
  parseContentStudioDocument,
  type ContentStudioDocument,
} from "./content-studio";

export type ContentStudioStage = "draft" | "published";

export type StoredContentStudioDocument = {
  document: ContentStudioDocument;
  updatedAt: string;
  publishedAt: string | null;
};

export interface ContentStudioStore {
  init(): Promise<void>;
  load(stage: ContentStudioStage): Promise<StoredContentStudioDocument | null>;
  saveDraft(document: ContentStudioDocument): Promise<StoredContentStudioDocument>;
  publish(document: ContentStudioDocument): Promise<StoredContentStudioDocument>;
}

async function writeJsonAtomically(targetPath: string, document: ContentStudioDocument) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}-${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  try {
    await rename(temporaryPath, targetPath);
  } catch {
    await copyFile(temporaryPath, targetPath);
    await unlink(temporaryPath).catch(() => undefined);
  }
}

class FileContentStudioStore implements ContentStudioStore {
  private readonly draftPath: string;

  constructor(private readonly rootDir: string) {
    const runtimeDir = process.env.RUNTIME_DIR
      ? path.resolve(rootDir, process.env.RUNTIME_DIR)
      : path.join(rootDir, ".runtime");
    this.draftPath = path.join(runtimeDir, "content-studio-draft.json");
  }

  async init() {
    await mkdir(path.dirname(this.draftPath), { recursive: true });
    await mkdir(path.dirname(CONTENT_STUDIO_PATH), { recursive: true });
  }

  private async loadFile(filePath: string, stage: ContentStudioStage) {
    try {
      const [raw, fileStat] = await Promise.all([
        readFile(filePath, "utf8"),
        stat(filePath),
      ]);
      const updatedAt = fileStat.mtime.toISOString();
      return {
        document: parseContentStudioDocument(JSON.parse(raw)),
        updatedAt,
        publishedAt: stage === "published" ? updatedAt : null,
      };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async load(stage: ContentStudioStage) {
    return this.loadFile(stage === "draft" ? this.draftPath : CONTENT_STUDIO_PATH, stage);
  }

  async saveDraft(document: ContentStudioDocument) {
    const parsed = parseContentStudioDocument(document);
    await writeJsonAtomically(this.draftPath, parsed);
    const stored = await this.load("draft");
    if (!stored) {
      throw new Error("초안을 저장하지 못했습니다.");
    }
    return stored;
  }

  async publish(document: ContentStudioDocument) {
    const parsed = parseContentStudioDocument(document);
    await writeJsonAtomically(this.draftPath, parsed);
    await writeJsonAtomically(CONTENT_STUDIO_PATH, parsed);
    const stored = await this.load("published");
    if (!stored) {
      throw new Error("콘텐츠를 공개하지 못했습니다.");
    }
    return stored;
  }
}

class PostgresContentStudioStore implements ContentStudioStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
    });
  }

  async init() {
    await this.pool.query(`
      create table if not exists content_studio_documents (
        stage text primary key check (stage in ('draft', 'published')),
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        published_at timestamptz
      )
    `);
  }

  async load(stage: ContentStudioStage) {
    const result = await this.pool.query(
      `select payload, updated_at, published_at
       from content_studio_documents
       where stage = $1`,
      [stage],
    );
    if (!result.rowCount) {
      return null;
    }
    const row = result.rows[0] as {
      payload: unknown;
      updated_at: Date | string;
      published_at: Date | string | null;
    };
    return {
      document: parseContentStudioDocument(row.payload),
      updatedAt: new Date(row.updated_at).toISOString(),
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    };
  }

  async saveDraft(document: ContentStudioDocument) {
    const parsed = parseContentStudioDocument(document);
    const result = await this.pool.query(
      `insert into content_studio_documents (stage, payload, updated_at, published_at)
       values ('draft', $1::jsonb, now(), null)
       on conflict (stage) do update
       set payload = excluded.payload,
           updated_at = now()
       returning payload, updated_at, published_at`,
      [JSON.stringify(parsed)],
    );
    const row = result.rows[0] as {
      payload: unknown;
      updated_at: Date | string;
      published_at: Date | string | null;
    };
    return {
      document: parseContentStudioDocument(row.payload),
      updatedAt: new Date(row.updated_at).toISOString(),
      publishedAt: null,
    };
  }

  async publish(document: ContentStudioDocument) {
    const parsed = parseContentStudioDocument(document);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into content_studio_documents (stage, payload, updated_at, published_at)
         values ('draft', $1::jsonb, now(), null)
         on conflict (stage) do update
         set payload = excluded.payload,
             updated_at = now()`,
        [JSON.stringify(parsed)],
      );
      const result = await client.query(
        `insert into content_studio_documents (stage, payload, updated_at, published_at)
         values ('published', $1::jsonb, now(), now())
         on conflict (stage) do update
         set payload = excluded.payload,
             updated_at = now(),
             published_at = now()
         returning payload, updated_at, published_at`,
        [JSON.stringify(parsed)],
      );
      await client.query("commit");
      const row = result.rows[0] as {
        payload: unknown;
        updated_at: Date | string;
        published_at: Date | string;
      };
      return {
        document: parseContentStudioDocument(row.payload),
        updatedAt: new Date(row.updated_at).toISOString(),
        publishedAt: new Date(row.published_at).toISOString(),
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

export function createContentStudioStore(
  databaseUrl: string | undefined,
  rootDir: string,
): ContentStudioStore {
  return databaseUrl
    ? new PostgresContentStudioStore(databaseUrl)
    : new FileContentStudioStore(rootDir);
}
