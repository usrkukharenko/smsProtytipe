import { NextResponse } from "next/server";

export type SecurityHeaders = Record<string, string>;

export const securityHeaders: SecurityHeaders = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "X-DNS-Prefetch-Control": "off",
};

export function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(securityHeaders)) {
    response.headers.set(k, v);
  }
  return response;
}
