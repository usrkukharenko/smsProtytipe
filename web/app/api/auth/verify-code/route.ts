import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import {
  CODE_MAX_ATTEMPTS,
  bumpAttempts,
  clearCode,
  loadCode,
} from "@/lib/codes";
import { createSession, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { phone?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const phone = body.phone ? normalizePhone(body.phone) : null;
  const code = (body.code ?? "").replace(/\D/g, "");

  if (!phone || code.length !== 6) {
    return NextResponse.json({ error: "Введите код из СМС" }, { status: 400 });
  }

  const record = await loadCode(phone);
  if (!record) {
    return NextResponse.json(
      { error: "Код устарел, запросите новый" },
      { status: 400 }
    );
  }

  if (record.attempts >= CODE_MAX_ATTEMPTS) {
    await clearCode(phone);
    return NextResponse.json(
      { error: "Слишком много попыток. Запросите код ещё раз" },
      { status: 429 }
    );
  }

  if (record.code !== code) {
    await bumpAttempts(phone, record);
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
  const token = await createSession({ phone });
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
