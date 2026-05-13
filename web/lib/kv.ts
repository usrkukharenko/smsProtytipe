import { Redis } from "@upstash/redis";

type MemoryEntry = { value: unknown; expiresAt: number | null };

const globalForMem = globalThis as unknown as {
  __smsvxod_mem?: Map<string, MemoryEntry>;
  __smsvxod_mem_lists?: Map<string, string[]>;
};
const memory =
  globalForMem.__smsvxod_mem ??
  (globalForMem.__smsvxod_mem = new Map<string, MemoryEntry>());
const memoryLists =
  globalForMem.__smsvxod_mem_lists ??
  (globalForMem.__smsvxod_mem_lists = new Map<string, string[]>());

let cachedClient: Redis | null | undefined;

function getClient(): Redis | null {
  if (cachedClient !== undefined) return cachedClient;

  const url =
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    cachedClient = null;
    return null;
  }

  cachedClient = new Redis({ url, token });
  return cachedClient;
}

function memGet<T>(key: string): T | null {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value as T;
}

function memSet(key: string, value: unknown, ttlSeconds?: number) {
  memory.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}

export const kv = {
  async get<T>(key: string): Promise<T | null> {
    const c = getClient();
    if (c) return (await c.get<T>(key)) ?? null;
    return memGet<T>(key);
  },

  async set(
    key: string,
    value: unknown,
    opts?: { ex?: number }
  ): Promise<void> {
    const c = getClient();
    if (c) {
      if (opts?.ex) await c.set(key, value, { ex: opts.ex });
      else await c.set(key, value);
      return;
    }
    memSet(key, value, opts?.ex);
  },

  async del(key: string): Promise<void> {
    const c = getClient();
    if (c) {
      await c.del(key);
      return;
    }
    memory.delete(key);
  },

  async incr(key: string): Promise<number> {
    const c = getClient();
    if (c) return await c.incr(key);
    const current = (memGet<number>(key) ?? 0) + 1;
    const prevEntry = memory.get(key);
    memory.set(key, {
      value: current,
      expiresAt: prevEntry?.expiresAt ?? null,
    });
    return current;
  },

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const c = getClient();
    if (c) {
      await c.expire(key, ttlSeconds);
      return;
    }
    const entry = memory.get(key);
    if (!entry) return;
    entry.expiresAt = Date.now() + ttlSeconds * 1000;
  },

  async ttl(key: string): Promise<number> {
    const c = getClient();
    if (c) return await c.ttl(key);
    const entry = memory.get(key);
    if (!entry || entry.expiresAt === null) return -1;
    const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  },

  async rpush(key: string, value: string): Promise<number> {
    const c = getClient();
    if (c) return await c.rpush(key, value);
    const list = memoryLists.get(key) ?? [];
    list.push(value);
    memoryLists.set(key, list);
    return list.length;
  },

  async lpop(key: string, count: number): Promise<string[]> {
    const c = getClient();
    if (c) {
      const result = await c.lpop<string | string[] | null>(key, count);
      if (!result) return [];
      return Array.isArray(result) ? result : [result];
    }
    const list = memoryLists.get(key) ?? [];
    const popped = list.splice(0, count);
    memoryLists.set(key, list);
    return popped;
  },
};
