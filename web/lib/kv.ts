import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  __smsvxod_redis?: Redis;
};

function getClient(): Redis {
  if (globalForRedis.__smsvxod_redis) return globalForRedis.__smsvxod_redis;

  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const client = new Redis(url, {
    // Don't open the TCP connection until the first command — keeps
    // `next build` (and unit tests) from crashing when Redis is unreachable.
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

  client.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[redis] error:", err.message);
  });

  globalForRedis.__smsvxod_redis = client;
  return client;
}

// Lazy proxy — the real client is constructed on first command,
// so `next build` won't fail when Redis isn't reachable yet.
// Methods are bound to the real client to keep ioredis's `this` happy.
export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const real = getClient();
    const value = (real as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
});

export const kv = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await getClient().get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  },

  async set(
    key: string,
    value: unknown,
    opts?: { ex?: number }
  ): Promise<void> {
    const payload =
      typeof value === "string" ? value : JSON.stringify(value);
    if (opts?.ex) {
      await getClient().set(key, payload, "EX", opts.ex);
    } else {
      await getClient().set(key, payload);
    }
  },

  async del(key: string): Promise<void> {
    await getClient().del(key);
  },

  async incr(key: string): Promise<number> {
    return await getClient().incr(key);
  },

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await getClient().expire(key, ttlSeconds);
  },

  async ttl(key: string): Promise<number> {
    return await getClient().ttl(key);
  },

  async rpush(key: string, value: string): Promise<number> {
    return await getClient().rpush(key, value);
  },

  async lpop(key: string, count: number): Promise<string[]> {
    const result = await getClient().lpop(key, count);
    if (!result) return [];
    return Array.isArray(result) ? result : [result];
  },
};
