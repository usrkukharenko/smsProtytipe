import { db } from "./db";
import { authLog } from "./db/schema";

export type AuthEvent =
  | "code_requested"
  | "code_verified"
  | "code_failed"
  | "banned";

export async function logAuthEvent(args: {
  userId?: number | null;
  phone?: string | null;
  ip: string;
  userAgent?: string | null;
  event: AuthEvent;
}): Promise<void> {
  await db.insert(authLog).values({
    userId: args.userId ?? null,
    phone: args.phone ?? null,
    ip: args.ip,
    userAgent: args.userAgent ?? null,
    event: args.event,
  });
}
