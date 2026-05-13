import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { checkRequestCodeLimits, getClientIp } from "@/lib/rate-limit";
import { generateCode, saveCode } from "@/lib/codes";
import { enqueueSms } from "@/lib/sms-queue";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const phone = body.phone ? normalizePhone(body.phone) : null;
  if (!phone) {
    return NextResponse.json(
      { error: "Введите корректный российский номер" },
      { status: 400 }
    );
  }

  const ip = getClientIp(req.headers);
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

  return NextResponse.json({ ok: true, resendAfter: 60 });
}
