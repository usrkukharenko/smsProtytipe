import { NextResponse } from "next/server";
import { createChallenge } from "@/lib/altcha";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST() {
  try {
    const challenge = await createChallenge();
    return NextResponse.json(challenge);
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      "altcha-challenge generation failed"
    );
    return NextResponse.json(
      { error: "Не удалось создать challenge" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
