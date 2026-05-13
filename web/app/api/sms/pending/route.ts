import { NextRequest, NextResponse } from "next/server";
import { dequeueSms } from "@/lib/sms-queue";

export const runtime = "nodejs";

function isGatewayAuthorized(req: NextRequest): boolean {
  const expected = process.env.GATEWAY_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!isGatewayAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const max = Math.min(
    Math.max(parseInt(url.searchParams.get("max") ?? "10", 10) || 10, 1),
    50
  );

  const tasks = await dequeueSms(max);
  return NextResponse.json({ tasks });
}
