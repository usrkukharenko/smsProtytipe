import { kv } from "./kv";

type LimitRule = { key: string; max: number; windowSeconds: number };

async function check(rule: LimitRule): Promise<{ ok: boolean; retryAfter: number }> {
  const count = await kv.incr(rule.key);
  if (count === 1) {
    await kv.expire(rule.key, rule.windowSeconds);
  }
  if (count > rule.max) {
    const ttl = await kv.ttl(rule.key);
    return { ok: false, retryAfter: ttl > 0 ? ttl : rule.windowSeconds };
  }
  return { ok: true, retryAfter: 0 };
}

export const limits = {
  resendCooldownSec: 60,
  hourlyPerPhone: 5,
  hourlyPerIp: 20,
  maxCodeAttempts: 3,
};

export async function checkRequestCodeLimits(
  phone: string,
  ip: string
): Promise<{ ok: boolean; reason?: string; retryAfter?: number }> {
  const resend = await check({
    key: `rl:resend:${phone}`,
    max: 1,
    windowSeconds: limits.resendCooldownSec,
  });
  if (!resend.ok) {
    return {
      ok: false,
      reason: `Подождите ${resend.retryAfter} сек перед повторной отправкой`,
      retryAfter: resend.retryAfter,
    };
  }

  const hourly = await check({
    key: `rl:hourly:${phone}`,
    max: limits.hourlyPerPhone,
    windowSeconds: 3600,
  });
  if (!hourly.ok) {
    return {
      ok: false,
      reason: "Превышен часовой лимит запросов для этого номера",
      retryAfter: hourly.retryAfter,
    };
  }

  const perIp = await check({
    key: `rl:ip:${ip}`,
    max: limits.hourlyPerIp,
    windowSeconds: 3600,
  });
  if (!perIp.ok) {
    return {
      ok: false,
      reason: "Слишком много запросов с этого устройства",
      retryAfter: perIp.retryAfter,
    };
  }

  return { ok: true };
}

export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
