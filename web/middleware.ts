import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";

export const config = {
  matcher: ["/success"],
};

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) {
    const url = new URL("/", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
