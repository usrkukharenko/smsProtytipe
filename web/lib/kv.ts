import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  __smsvxod_redis?: Redis;
};

function getClient(): Redis {
  if (globalForRedis.__smsvxod_redis) return globalForRedis.__smsvxod_redis;

  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const client = new Redis(url, {
    lazyConnect: false,
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

export const redis = getClient();

export const kv = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await redis.get(key);
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
      await redis.set(key, payload, "EX", opts.ex);
    } else {
      await redis.set(key, payload);
    }
  },

  async del(key: string): Promise<void> {
    await redis.del(key);
  },

  async incr(key: string): Promise<number> {
    return await redis.incr(key);
  },

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await redis.expire(key, ttlSeconds);
  },

  async ttl(key: string): Promise<number> {
    return await redis.ttl(key);
  },

  async rpush(key: string, value: string): Promise<number> {
    return await redis.rpush(key, value);
  },

  async lpop(key: string, count: number): Promise<string[]> {
    const result = await redis.lpop(key, count);
    if (!result) return [];
    return Array.isArray(result) ? result : [result];
  },
};
