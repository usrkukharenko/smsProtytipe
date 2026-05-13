import { NextRequest, NextResponse } from "next/server";

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

  let body: { results?: Array<{ id: string; ok: boolean; error?: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const results = body.results ?? [];
  for (const r of results) {
    if (r.ok) {
      console.log(`[sms] sent task=${r.id}`);
    } else {
      console.warn(`[sms] failed task=${r.id} error=${r.error}`);
    }
  }

  return NextResponse.json({ ok: true, received: results.length });
}
