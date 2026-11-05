import crypto from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import { createDatabasePool } from "../db/pool";
import type { GameRepository } from "../game/repository";
import type { GameSession } from "../game/schemas";

export interface OnlineTransaction {
  get<T>(kind: string, id: string): Promise<T | null>;
  list<T>(kind: string): Promise<T[]>;
  put(kind: string, id: string, value: unknown): Promise<void>;
  remove(kind: string, id: string): Promise<void>;
  saveGame(game: GameSession): Promise<void>;
}
type DiskState = { records: Record<string, unknown>; games: Record<string, GameSession> };
/** Checkpoint, death ledger and character rewards share a commit. */
export class OnlineStore {
  private pool: Pool | null;
  private leader: PoolClient | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private disk: DiskState = { records: {}, games: {} };
  private file: string;
  private fault: Error | null = null;
  constructor(databaseUrl: string | undefined, root: string, private repository: GameRepository) {
    this.pool = databaseUrl ? createDatabasePool(databaseUrl) : null;
    this.file = path.resolve(root, process.env.RUNTIME_DIR || ".runtime", "arcana-online.json");
  }
  async init() {
    if (this.pool) {
      await this.pool.query("create table if not exists arcana_online_records (kind text not null, id text not null, payload jsonb not null, updated_at timestamptz not null default now(), primary key(kind,id))");
    } else {
      try { this.disk = JSON.parse(await readFile(this.file, "utf8")); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      for (const game of Object.values(this.disk.games)) await this.repository.saveGame(game);
    }
  }
  async acquireWorld() {
    if (this.fault) throw this.fault;
    if (!this.pool || this.leader) return true;
    const client = await this.pool.connect();
    const result = await client.query("select pg_try_advisory_lock(hashtextextended('arcana:world:main',0)) as acquired");
    if (!result.rows[0].acquired) { client.release(); return false; }
    client.on("error", error => { this.fault = error; this.leader = null; });
    this.leader = client;
    return true;
  }
  get healthy() { return !this.fault; }
  async transaction<T>(operation: (tx: OnlineTransaction) => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      if (this.fault) throw this.fault;
      if (this.pool) {
        const client = await this.pool.connect();
        try {
          await client.query("begin");
          await client.query("select pg_advisory_xact_lock(hashtextextended('arcana:online:records',0))");
          const tx: OnlineTransaction = {
            get: async <R>(kind: string, id: string) => (await client.query("select payload from arcana_online_records where kind=$1 and id=$2", [kind,id])).rows[0]?.payload as R ?? null,
            list: async <R>(kind: string) => (await client.query("select payload from arcana_online_records where kind=$1", [kind])).rows.map(row => row.payload as R),
            put: async (kind,id,value) => { await client.query("insert into arcana_online_records(kind,id,payload) values($1,$2,$3::jsonb) on conflict(kind,id) do update set payload=excluded.payload,updated_at=now()", [kind,id,JSON.stringify(value)]); },
            remove: async (kind,id) => { await client.query("delete from arcana_online_records where kind=$1 and id=$2", [kind,id]); },
            saveGame: async game => {
              await client.query("insert into game_sessions(id,created_at,updated_at,state_payload) values($1,$2,$3,$4::jsonb) on conflict(id) do update set updated_at=excluded.updated_at,state_payload=excluded.state_payload", [game.id,game.createdAt,game.updatedAt,JSON.stringify(game.state)]);
              await client.query("insert into world_instances(game_id,world_payload) values($1,$2::jsonb) on conflict(game_id) do update set world_payload=excluded.world_payload", [game.id,JSON.stringify(game.world)]);
            },
          };
          const result = await operation(tx);
          try { await client.query("commit"); }
          catch (error) { this.fault=error instanceof Error?error:new Error("Uncertain online commit"); throw error; }
          return result;
        } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
        finally { client.release(); }
      }
      const draft = structuredClone(this.disk);
      const changed: GameSession[] = [];
      let dirty = false;
      const key = (kind: string,id: string) => JSON.stringify([kind,id]);
      const tx: OnlineTransaction = {
        get: async <R>(kind: string,id: string) => structuredClone(draft.records[key(kind,id)] ?? null) as R | null,
        list: async <R>(kind: string) => Object.entries(draft.records).filter(([k]) => JSON.parse(k)[0]===kind).map(([,v]) => structuredClone(v) as R),
        put: async (kind,id,value) => { dirty=true; draft.records[key(kind,id)] = structuredClone(value); },
        remove: async (kind,id) => { dirty=true; delete draft.records[key(kind,id)]; },
        saveGame: async game => { dirty=true; draft.games[game.id] = structuredClone(game); changed.push(structuredClone(game)); },
      };
      const result = await operation(tx);
      if(!dirty)return result;
      await mkdir(path.dirname(this.file),{recursive:true});
      const temp = this.file + "." + crypto.randomUUID() + ".tmp";
      await writeFile(temp,JSON.stringify(draft),"utf8");
      await rename(temp,this.file);
      this.disk = draft;
      try { for (const game of changed) await this.repository.saveGame(game); }
      catch(error) { this.fault=error instanceof Error?error:new Error("Local checkpoint replay failed");throw error; }
      return result;
    } finally { release(); }
  }
  async close() {
    await this.tail;
    if (this.leader) { await this.leader.query("select pg_advisory_unlock(hashtextextended('arcana:world:main',0))"); this.leader.release(); this.leader = null; }
    await this.pool?.end();
  }
}
