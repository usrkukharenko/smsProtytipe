import { eq, lt, and, gt, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { bannedIps } from "./db/schema";

export async function isIpBanned(ip: string): Promise<boolean> {
  if (!ip || ip === "unknown") return false;
  const rows = await db
    .select()
    .from(bannedIps)
    .where(eq(bannedIps.ip, ip))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  if (!row.bannedUntil) return true;
  return row.bannedUntil.getTime() > Date.now();
}

export async function banIp(
  ip: string,
  reason: string,
  durationMs: number
): Promise<void> {
  if (!ip || ip === "unknown") return;
  const bannedUntil = new Date(Date.now() + durationMs);
  await db
    .insert(bannedIps)
    .values({ ip, reason, bannedUntil })
    .onConflictDoUpdate({
      target: bannedIps.ip,
      set: { reason, bannedUntil },
    });
}

export async function cleanupExpiredBans(): Promise<number> {
  const result = await db
    .delete(bannedIps)
    .where(
      and(isNotNull(bannedIps.bannedUntil), lt(bannedIps.bannedUntil, new Date()))
    )
    .returning({ ip: bannedIps.ip });
  return result.length;
}

export async function listActiveBans() {
  return await db
    .select()
    .from(bannedIps)
    .where(
      and(isNotNull(bannedIps.bannedUntil), gt(bannedIps.bannedUntil, new Date()))
    );
}
