import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Pool } from "pg";
import { CONTENT_STUDIO_PATH, parseContentStudioDocument, type ContentStudioDocument } from "./content-studio";
export type ContentStudioStage = "draft" | "published";
export type StoredContentStudioDocument = { document: ContentStudioDocument; updatedAt: string; publishedAt: string | null };
export class StudioConflict extends Error { constructor() { super("다른 탭에서 초안이 변경되었습니다. 현재 원고를 내보낸 뒤 최신 초안을 불러와 주세요."); } }
export interface ContentStudioStore {
  init(): Promise<void>;
  load(stage: ContentStudioStage): Promise<StoredContentStudioDocument | null>;
  saveDraft(document: ContentStudioDocument, expected?: string | null): Promise<StoredContentStudioDocument>;
  publish(document: ContentStudioDocument, expected?: string | null): Promise<StoredContentStudioDocument>;
}
class FileContentStudioStore implements ContentStudioStore {
  private draftPath: string;
  private bundlePath: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(root: string) {
    const dir = process.env.RUNTIME_DIR ? path.resolve(root, process.env.RUNTIME_DIR) : path.join(root, ".runtime");
    this.draftPath = path.join(dir, "content-studio-draft.json");
    this.bundlePath = path.join(dir, "content-studio-store.json");
  }
  async init() { await mkdir(path.dirname(this.bundlePath), { recursive: true }); }
  private async bundle(): Promise<Partial<Record<ContentStudioStage, StoredContentStudioDocument>>> {
    try { return JSON.parse(await readFile(this.bundlePath, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const result: Partial<Record<ContentStudioStage, StoredContentStudioDocument>> = {};
    for (const [stage, file] of [["draft", this.draftPath], ["published", CONTENT_STUDIO_PATH]] as const) {
      try {
        const document = parseContentStudioDocument(JSON.parse(await readFile(file, "utf8")));
        const updatedAt = (await stat(file)).mtime.toISOString();
        result[stage] = { document, updatedAt, publishedAt: stage === "published" ? updatedAt : null };
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    return result;
  }
  async load(stage: ContentStudioStage) {
    const row = (await this.bundle())[stage];
    return row ? { ...row, document: parseContentStudioDocument(row.document) } : null;
  }
  private write(document: ContentStudioDocument, publish: boolean, expected?: string | null) {
    const task = this.queue.then(async () => {
      const bundle = await this.bundle();
      if (expected !== undefined && expected !== (bundle.draft?.updatedAt ?? null)) throw new StudioConflict();
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(bundle.draft?.updatedAt ?? "1970-01-01") + 1)).toISOString();
      const stored = { document: parseContentStudioDocument(document), updatedAt, publishedAt: publish ? updatedAt : null };
      bundle.draft = { ...stored, publishedAt: null };
      if (publish) bundle.published = stored;
      const temporary = `${this.bundlePath}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(bundle), "utf8");
      await rename(temporary, this.bundlePath);
      return stored;
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
  saveDraft(document: ContentStudioDocument, expected?: string | null) { return this.write(document, false, expected); }
  publish(document: ContentStudioDocument, expected?: string | null) { return this.write(document, true, expected); }
}
class PostgresContentStudioStore implements ContentStudioStore {
  private pool: Pool;
  constructor(url: string) { this.pool = new Pool({ connectionString: url, ssl: url.includes("supabase.co") ? { rejectUnauthorized: false } : undefined }); }
  async init() {
    await this.pool.query("create table if not exists content_studio_documents (stage text primary key check (stage in ('draft','published')), payload jsonb not null, updated_at timestamptz not null default now(), published_at timestamptz)");
  }
  async load(stage: ContentStudioStage) {
    const result = await this.pool.query("select payload, updated_at, published_at from content_studio_documents where stage=$1", [stage]);
    const row = result.rows[0];
    return row ? { document: parseContentStudioDocument(row.payload), updatedAt: new Date(row.updated_at).toISOString(), publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null } : null;
  }
  private async write(document: ContentStudioDocument, publish: boolean, expected?: string | null) {
    const parsed = parseContentStudioDocument(document);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(7826419)");
      const previous = (await client.query("select updated_at from content_studio_documents where stage='draft' for update")).rows[0];
      const previousTime = previous ? new Date(previous.updated_at).toISOString() : null;
      if (expected !== undefined && expected !== previousTime) throw new StudioConflict();
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(previousTime ?? "1970-01-01") + 1)).toISOString();
      for (const stage of publish ? ["draft", "published"] : ["draft"]) {
        await client.query("insert into content_studio_documents(stage,payload,updated_at,published_at) values($1,$2::jsonb,$3,$4) on conflict(stage) do update set payload=excluded.payload,updated_at=excluded.updated_at,published_at=excluded.published_at", [stage, JSON.stringify(parsed), updatedAt, stage === "published" ? updatedAt : null]);
      }
      await client.query("commit");
      return { document: parsed, updatedAt, publishedAt: publish ? updatedAt : null };
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }
  saveDraft(document: ContentStudioDocument, expected?: string | null) { return this.write(document, false, expected); }
  publish(document: ContentStudioDocument, expected?: string | null) { return this.write(document, true, expected); }
}
export function createContentStudioStore(url: string | undefined, root: string): ContentStudioStore {
  return url ? new PostgresContentStudioStore(url) : new FileContentStudioStore(root);
}
