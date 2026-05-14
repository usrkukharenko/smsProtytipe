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

export const db = getDb();
export { schema };
