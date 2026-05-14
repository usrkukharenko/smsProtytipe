import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { applySecurityHeaders } from "@/lib/security";

export const config = {
  // Run on all paths except Next.js internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protected route: /success requires a valid session.
  if (pathname === "/success" || pathname.startsWith("/success/")) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await verifySessionToken(token) : null;
    if (!session) {
      const url = new URL("/", req.url);
      const redirect = NextResponse.redirect(url);
      return applySecurityHeaders(redirect);
    }
  }

  return applySecurityHeaders(NextResponse.next());
}
