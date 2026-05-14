import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * In-memory mock for the `kv` module. Mirrors the surface used by
 * lib/rate-limit.ts: incr / expire / ttl.
 *
 * We mock @/lib/kv wholesale so the rate-limit code never touches Redis. Both
 * rate-limit.ts (which imports via "./kv") and any test code using "@/lib/kv"
 * resolve to the same absolute module file, so a single vi.mock covers both.
 *
 * The mock state is created inside vi.hoisted so it is available when
 * vi.mock's hoisted factory runs (which happens before any top-level `const`).
 */

type Entry = { value: number; expireAt: number | null };

const memory = vi.hoisted(() => {
  const store = new Map<string, Entry>();
  let now: () => number = () => Date.now();

  function getActive(key: string): Entry | undefined {
    const e = store.get(key);
    if (!e) return undefined;
    if (e.expireAt !== null && e.expireAt <= now()) {
      store.delete(key);
      return undefined;
    }
    return e;
  }

  const kv = {
    async get<T>(key: string): Promise<T | null> {
      const e = getActive(key);
      return e ? (e.value as unknown as T) : null;
    },
    async set(
      key: string,
      value: unknown,
      opts?: { ex?: number }
    ): Promise<void> {
      store.set(key, {
        value: value as number,
        expireAt: opts?.ex ? now() + opts.ex * 1000 : null,
      });
    },
    async del(key: string): Promise<void> {
      store.delete(key);
    },
    async incr(key: string): Promise<number> {
      const e = getActive(key);
      const next = (e?.value ?? 0) + 1;
      store.set(key, {
        value: next,
        expireAt: e?.expireAt ?? null,
      });
      return next;
    },
    async expire(key: string, ttlSeconds: number): Promise<void> {
      const e = getActive(key);
      if (!e) return;
      e.expireAt = now() + ttlSeconds * 1000;
    },
    async ttl(key: string): Promise<number> {
      const e = getActive(key);
      if (!e) return -2;
      if (e.expireAt === null) return -1;
      return Math.max(0, Math.ceil((e.expireAt - now()) / 1000));
    },
    async rpush(_key: string, _value: string): Promise<number> {
      return 1;
    },
    async lpop(_key: string, _count: number): Promise<string[]> {
      return [];
    },
  };

  return {
    store,
    kv,
    setNow(fn: () => number) {
      now = fn;
    },
  };
});

vi.mock("@/lib/kv", () => ({
  kv: memory.kv,
  redis: {},
}));

describe("checkRequestCodeLimits", () => {
  beforeEach(() => {
    memory.store.clear();
    memory.setNow(() => Date.now());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first call for a phone+ip pair", async () => {
    const { checkRequestCodeLimits } = await import("@/lib/rate-limit");
    const res = await checkRequestCodeLimits("+79991234567", "1.2.3.4");
    expect(res.ok).toBe(true);
  });

  it("blocks an immediate second call for the same phone (resend cooldown)", async () => {
    const { checkRequestCodeLimits } = await import("@/lib/rate-limit");
    const phone = "+79991234567";
    const ip = "1.2.3.4";

    const first = await checkRequestCodeLimits(phone, ip);
    expect(first.ok).toBe(true);

    const second = await checkRequestCodeLimits(phone, ip);
    expect(second.ok).toBe(false);
    expect(second.retryAfter).toBeGreaterThan(0);
    expect(second.reason).toMatch(/Подождите|повторной/i);
  });

  it("uses independent counters for different phones", async () => {
    const { checkRequestCodeLimits } = await import("@/lib/rate-limit");

    const a = await checkRequestCodeLimits("+79990000001", "1.2.3.4");
    const b = await checkRequestCodeLimits("+79990000002", "1.2.3.4");
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("uses independent counters for different IPs", async () => {
    const { checkRequestCodeLimits } = await import("@/lib/rate-limit");

    const a = await checkRequestCodeLimits("+79990000001", "1.1.1.1");
    const b = await checkRequestCodeLimits("+79990000002", "2.2.2.2");
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("enforces hourly per-phone limit after cooldown expires", async () => {
    const { checkRequestCodeLimits, limits } = await import("@/lib/rate-limit");
    const phone = "+79990000003";
    const ip = "9.9.9.9";

    let fakeTime = 1_700_000_000_000;
    memory.setNow(() => fakeTime);

    // Five allowed within an hour (limits.hourlyPerPhone === 5).
    for (let i = 0; i < limits.hourlyPerPhone; i++) {
      const res = await checkRequestCodeLimits(phone, ip);
      expect(res.ok).toBe(true);
      // Advance past the resend cooldown so each call is permitted by that rule.
      fakeTime += (limits.resendCooldownSec + 1) * 1000;
    }

    // 6th call within the hour should hit the hourly cap.
    const sixth = await checkRequestCodeLimits(phone, ip);
    expect(sixth.ok).toBe(false);
    expect(sixth.reason).toMatch(/часов|номер/i);
  });

  it("enforces per-IP hourly limit across different phones", async () => {
    const { checkRequestCodeLimits, limits } = await import("@/lib/rate-limit");
    const ip = "5.5.5.5";

    let fakeTime = 1_700_000_000_000;
    memory.setNow(() => fakeTime);

    // Use a fresh phone each time so the resend & phone limits don't fire,
    // but the per-IP counter accumulates.
    for (let i = 0; i < limits.hourlyPerIp; i++) {
      const phone = `+7999000${(1000 + i).toString().padStart(4, "0")}`;
      const res = await checkRequestCodeLimits(phone, ip);
      expect(res.ok).toBe(true);
      fakeTime += 1000;
    }

    const blocked = await checkRequestCodeLimits("+79991111111", ip);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/устрой|IP|много/i);
  });
});

describe("getClientIp", () => {
  it("returns first IP from x-forwarded-for", async () => {
    const { getClientIp } = await import("@/lib/rate-limit");
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIp(headers)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", async () => {
    const { getClientIp } = await import("@/lib/rate-limit");
    const headers = new Headers({ "x-real-ip": "9.9.9.9" });
    expect(getClientIp(headers)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when no header is present", async () => {
    const { getClientIp } = await import("@/lib/rate-limit");
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
