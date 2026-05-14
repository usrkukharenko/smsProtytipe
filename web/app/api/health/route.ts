import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { redis } from "@/lib/kv";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  let redisOk = false;
  let queueDepth: number | null = null;
  let activeGateways: number | null = null;

  try {
    await db.execute(sql`select 1`);
    dbOk = true;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "health: db ping failed"
    );
  }

  try {
    const pong = await redis.ping();
    redisOk = pong === "PONG";
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "health: redis ping failed"
    );
  }

  if (redisOk) {
    try {
      queueDepth = await redis.llen("sms:queue");
    } catch {
      queueDepth = null;
    }
    try {
      const keys = await redis.keys("gateway:*:last_seen");
      activeGateways = keys.length;
    } catch {
      activeGateways = null;
    }
  }

  const status = dbOk && redisOk ? "ok" : "degraded";
  const httpStatus = dbOk && redisOk ? 200 : 503;

  return NextResponse.json(
    {
      status,
      db: dbOk ? "ok" : "fail",
      redis: redisOk ? "ok" : "fail",
      queueDepth,
      activeGateways,
    },
    { status: httpStatus }
  );
}
