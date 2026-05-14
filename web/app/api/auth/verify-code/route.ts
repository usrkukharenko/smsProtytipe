import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import {
  CODE_MAX_ATTEMPTS,
  bumpAttempts,
  clearCode,
  loadCode,
} from "@/lib/codes";
import { createSession, setSessionCookie } from "@/lib/auth";
import { getClientIp } from "@/lib/rate-limit";
import { kv } from "@/lib/kv";
import { isIpBanned, banIp } from "@/lib/bans";
import { logAuthEvent } from "@/lib/audit";
import { upsertUser, setUserLastLogin } from "@/lib/users";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const VERIFY_LIMIT_PER_IP = 10;
const VERIFY_WINDOW_SECONDS = 15 * 60;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get("user-agent");

  try {
    if (await isIpBanned(ip)) {
      return NextResponse.json({ error: "Доступ заблокирован" }, { status: 403 });
    }

    // IP-level verify rate-limit (in Redis)
    const verifyKey = `rl:verify:${ip}`;
    const count = await kv.incr(verifyKey);
    if (count === 1) {
      await kv.expire(verifyKey, VERIFY_WINDOW_SECONDS);
    }
    if (count > VERIFY_LIMIT_PER_IP) {
      try {
        await banIp(
          ip,
          "verify-bruteforce",
          VERIFY_WINDOW_SECONDS * 1000
        );
        await logAuthEvent({ ip, userAgent, event: "banned" });
      } catch (err) {
        logger.error(
          { err: (err as Error).message, ip },
          "failed to ban IP after verify abuse"
        );
      }
      return NextResponse.json(
        { error: "Слишком много попыток. Доступ временно заблокирован" },
        { status: 429 }
      );
    }

    let body: { phone?: string; code?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Некорректный запрос" },
        { status: 400 }
      );
    }

    const phone = body.phone ? normalizePhone(body.phone) : null;
    const code = (body.code ?? "").replace(/\D/g, "");

    if (!phone || code.length !== 6) {
      return NextResponse.json(
        { error: "Введите код из СМС" },
        { status: 400 }
      );
    }

    const record = await loadCode(phone);
    if (!record) {
      await logAuthEvent({
        phone,
        ip,
        userAgent,
        event: "code_failed",
      }).catch(() => {});
      return NextResponse.json(
        { error: "Код устарел, запросите новый" },
        { status: 400 }
      );
    }

    if (record.attempts >= CODE_MAX_ATTEMPTS) {
      await clearCode(phone);
      await logAuthEvent({
        phone,
        ip,
        userAgent,
        event: "code_failed",
      }).catch(() => {});
      return NextResponse.json(
        { error: "Слишком много попыток. Запросите код ещё раз" },
        { status: 429 }
      );
    }

    if (record.code !== code) {
      await bumpAttempts(phone, record);
      await logAuthEvent({
        phone,
        ip,
        userAgent,
        event: "code_failed",
      }).catch(() => {});
      const left = CODE_MAX_ATTEMPTS - record.attempts;
      return NextResponse.json(
        {
          error:
            left > 0
              ? `Неверный код, осталось попыток: ${left}`
              : "Слишком много попыток",
        },
        { status: 400 }
      );
    }

    await clearCode(phone);

    try {
      const user = await upsertUser(phone);
      await setUserLastLogin(phone);
      await logAuthEvent({
        userId: user.id,
        phone,
        ip,
        userAgent,
        event: "code_verified",
      });
    } catch (err) {
      logger.error(
        { err: (err as Error).message, phone },
        "failed to persist auth event for code_verified"
      );
    }

    const token = await createSession({ phone });
    await setSessionCookie(token);

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error(
      { err: (err as Error).message, ip },
      "verify-code unhandled error"
    );
    return NextResponse.json(
      { error: "Внутренняя ошибка" },
      { status: 500 }
    );
  }
}
