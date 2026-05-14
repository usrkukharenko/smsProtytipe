import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gatewayDevices } from "@/lib/db/schema";
import { kv } from "@/lib/kv";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

function isGatewayAuthorized(req: NextRequest): boolean {
  const expected = process.env.GATEWAY_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

export async function POST(req: NextRequest) {
  if (!isGatewayAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    deviceId?: string;
    batteryLevel?: number;
    signalStrength?: number;
    simInfo?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const deviceId = body.deviceId?.trim();
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId required" }, { status: 400 });
  }

  const now = new Date();
  try {
    await db
      .insert(gatewayDevices)
      .values({
        deviceId,
        lastSeenAt: now,
        batteryLevel: body.batteryLevel ?? null,
        signalStrength: body.signalStrength ?? null,
        simInfo: body.simInfo ?? null,
      })
      .onConflictDoUpdate({
        target: gatewayDevices.deviceId,
        set: {
          lastSeenAt: now,
          batteryLevel: body.batteryLevel ?? null,
          signalStrength: body.signalStrength ?? null,
          simInfo: body.simInfo ?? null,
        },
      });
  } catch (err) {
    logger.error(
      { err: (err as Error).message, deviceId },
      "failed to persist gateway heartbeat"
    );
  }

  try {
    await kv.set(`gateway:${deviceId}:last_seen`, now.toISOString(), {
      ex: 120,
    });
  } catch (err) {
    logger.error(
      { err: (err as Error).message, deviceId },
      "failed to set gateway last_seen in redis"
    );
  }

  return NextResponse.json({ ok: true });
}
