import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { ContentRegistrySchema, type ContentRegistry } from "./schemas/content";

const versions = new Map<string, ContentRegistry>();
// Preview bindings never enter the immutable published/save version collection.
const previewVersions = new Map<string, ContentRegistry>();
export function setPreviewContentVersion(sessionId: string, registry: ContentRegistry) {
  const id = `studio-preview:${sessionId}`;
  previewVersions.set(id, registry);
  return id;
}
export function releasePreviewContentVersion(sessionId: string) {
  previewVersions.delete(`studio-preview:${sessionId}`);
}
let latestId: string | undefined;
let legacyId: string | undefined;

export function contentVersionId(registry: ContentRegistry) {
  return createHash("sha256").update(JSON.stringify(registry)).digest("hex");
}
export function registerContentVersion(registry: ContentRegistry, latest = false) {
  const id = contentVersionId(registry);
  versions.set(id, structuredClone(registry));
  if (latest) latestId = id;
  return id;
}
export function currentContentVersionId() { return latestId; }
export function legacyContentVersionId() { return legacyId; }
export function versionRegistry(id?: string) {
  const resolved = id ?? legacyId;
  if (!resolved) return undefined;
  const registry = resolved.startsWith("studio-preview:") ? previewVersions.get(resolved) : versions.get(resolved);
  if (!registry) throw new Error(`저장된 콘텐츠 버전 ${resolved}을 찾을 수 없습니다. 최신 버전으로 대체하지 않았습니다.`);
  return registry;
}

/** Archives are independent of the draft/published pointer and are never overwritten. */
export class ContentVersionStore {
  private pool?: Pool;
  private directory: string;
  constructor(databaseUrl: string | undefined, root: string) {
    if (databaseUrl) this.pool = new Pool({ connectionString: databaseUrl, ssl: databaseUrl.includes("supabase.co") ? { rejectUnauthorized: false } : undefined });
    this.directory = path.join(process.env.RUNTIME_DIR ? path.resolve(root, process.env.RUNTIME_DIR) : path.join(root, ".runtime"), "content-versions");
  }
  async init(current: ContentRegistry) {
    if (this.pool) {
      await this.pool.query("create table if not exists content_versions (id text primary key, payload jsonb not null, legacy boolean not null default false)");
      const result = await this.pool.query("select id, payload, legacy from content_versions");
      for (const row of result.rows) {
        versions.set(row.id, ContentRegistrySchema.parse(row.payload));
        if (row.legacy) legacyId = row.id;
      }
    } else {
      await mkdir(this.directory, { recursive: true });
      for (const name of await readdir(this.directory)) {
        if (!name.endsWith(".json")) continue;
        const row = JSON.parse(await readFile(path.join(this.directory, name), "utf8"));
        versions.set(row.id, ContentRegistrySchema.parse(row.registry));
      }
      try { legacyId = (await readFile(path.join(this.directory, "legacy"), "utf8")).trim(); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    const id = await this.archive(current);
    if (!legacyId) {
      if (this.pool) {
        await this.pool.query("update content_versions set legacy = true where id = $1", [id]);
      } else await writeFile(path.join(this.directory, "legacy"), id, { flag: "wx" });
      legacyId = id;
    }
    versionRegistry(legacyId);
    latestId = id;
  }
  async archive(registry: ContentRegistry) {
    const id = contentVersionId(registry);
    if (this.pool) {
      await this.pool.query("insert into content_versions (id, payload) values ($1, $2::jsonb) on conflict (id) do nothing", [id, JSON.stringify(registry)]);
    } else {
      await mkdir(this.directory, { recursive: true });
      try { await writeFile(path.join(this.directory, `${id}.json`), JSON.stringify({ id, registry }), { flag: "wx" }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    registerContentVersion(registry);
    return id;
  }
}
