import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  __smsvxod_pg?: ReturnType<typeof postgres>;
  __smsvxod_db?: ReturnType<typeof drizzle<typeof schema>>;
};

function getClient() {
  if (globalForDb.__smsvxod_pg) return globalForDb.__smsvxod_pg;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  globalForDb.__smsvxod_pg = client;
  return client;
}

export function getDb() {
  if (globalForDb.__smsvxod_db) return globalForDb.__smsvxod_db;
  const client = getClient();
  const db = drizzle(client, { schema });
  globalForDb.__smsvxod_db = db;
  return db;
}

// Lazy proxy — the real client is created on first method call, not on import.
// This keeps `next build` happy when Postgres isn't reachable. Methods are
// bound to the real db so drizzle's `this`-aware methods still work.
export const db = new Proxy(
  {} as ReturnType<typeof drizzle<typeof schema>>,
  {
    get(_target, prop) {
      const real = getDb();
      const value = (real as unknown as Record<PropertyKey, unknown>)[prop];
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(real)
        : value;
    },
  }
);

export { schema };
