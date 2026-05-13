import { kv } from "./kv";

export const CODE_TTL_SECONDS = 300; // 5 минут
export const CODE_MAX_ATTEMPTS = 3;

export type CodeRecord = {
  code: string;
  attempts: number;
  createdAt: number;
};

function key(phone: string) {
  return `code:${phone}`;
}

export function generateCode(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return n.toString().padStart(6, "0");
}

export async function saveCode(phone: string, code: string): Promise<void> {
  const record: CodeRecord = { code, attempts: 0, createdAt: Date.now() };
  await kv.set(key(phone), record, { ex: CODE_TTL_SECONDS });
}

export async function loadCode(phone: string): Promise<CodeRecord | null> {
  return await kv.get<CodeRecord>(key(phone));
}

export async function bumpAttempts(phone: string, current: CodeRecord): Promise<void> {
  current.attempts += 1;
  await kv.set(key(phone), current, { ex: CODE_TTL_SECONDS });
}

export async function clearCode(phone: string): Promise<void> {
  await kv.del(key(phone));
}
