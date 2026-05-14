import { eq } from "drizzle-orm";
import { db } from "./db";
import { users, type User } from "./db/schema";

export async function upsertUser(phone: string): Promise<User> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(users)
    .values({ phone })
    .onConflictDoNothing({ target: users.phone })
    .returning();

  if (inserted[0]) return inserted[0];

  const refetch = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);
  if (!refetch[0]) {
    throw new Error("Failed to upsert user");
  }
  return refetch[0];
}

export async function findUserByPhone(phone: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);
  return rows[0] ?? null;
}

export async function setUserLastLogin(phone: string): Promise<void> {
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.phone, phone));
}

export async function setUserBanned(
  phone: string,
  banned: boolean
): Promise<void> {
  await db
    .update(users)
    .set({ isBanned: banned })
    .where(eq(users.phone, phone));
}
