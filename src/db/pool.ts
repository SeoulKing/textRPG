import { Pool, type PoolConfig } from "pg";

/** Bound connection acquisition and handle disconnects of idle database clients. */
export function createDatabasePool(databaseUrl: string, options: PoolConfig = {}): Pool {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
    ...options,
  });
  // pg removes failed idle clients itself. Log only the code, never credentials.
  pool.on("error", (error: Error & { code?: string }) => {
    console.error("Idle database connection lost", { code: error.code ?? "unknown" });
  });
  return pool;
}
