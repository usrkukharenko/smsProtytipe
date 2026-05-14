import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { checkRequestCodeLimits, getClientIp } from "@/lib/rate-limit";
import { generateCode, saveCode } from "@/lib/codes";
import { enqueueSms } from "@/lib/sms-queue";
import { isIpBanned } from "@/lib/bans";
import { logAuthEvent } from "@/lib/audit";
import { upsertUser } from "@/lib/users";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get("user-agent");

  try {
    if (await isIpBanned(ip)) {
      return NextResponse.json({ error: "Доступ заблокирован" }, { status: 403 });
    }

    let body: { phone?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Некорректный запрос" },
        { status: 400 }
      );
    }

    const phone = body.phone ? normalizePhone(body.phone) : null;
    if (!phone) {
      return NextResponse.json(
        { error: "Введите корректный российский номер" },
        { status: 400 }
      );
    }

    const limit = await checkRequestCodeLimits(phone, ip);
    if (!limit.ok) {
      return NextResponse.json(
        { error: limit.reason, retryAfter: limit.retryAfter },
        { status: 429 }
      );
    }

    const code = generateCode();
    await saveCode(phone, code);
    await enqueueSms(phone, `Код для входа: ${code}`);

    try {
      const user = await upsertUser(phone);
      await logAuthEvent({
        userId: user.id,
        phone,
        ip,
        userAgent,
        event: "code_requested",
      });
    } catch (err) {
      logger.error(
        { err: (err as Error).message, phone },
        "failed to persist auth event for code_requested"
      );
    }

    return NextResponse.json({ ok: true, resendAfter: 60 });
  } catch (err) {
    logger.error(
      { err: (err as Error).message, ip },
      "request-code unhandled error"
    );
    return NextResponse.json(
      { error: "Внутренняя ошибка" },
      { status: 500 }
    );
  }
}
