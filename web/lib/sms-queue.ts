import { kv } from "./kv";

export type SmsTask = {
  id: string;
  phone: string;
  text: string;
  createdAt: number;
};

const QUEUE_KEY = "sms:queue";

export async function enqueueSms(phone: string, text: string): Promise<SmsTask> {
  const task: SmsTask = {
    id: cryptoRandomId(),
    phone,
    text,
    createdAt: Date.now(),
  };
  await kv.rpush(QUEUE_KEY, JSON.stringify(task));
  return task;
}

export async function dequeueSms(max: number): Promise<SmsTask[]> {
  const raw = await kv.lpop(QUEUE_KEY, max);
  const tasks: SmsTask[] = [];
  for (const item of raw) {
    try {
      tasks.push(typeof item === "string" ? JSON.parse(item) : item);
    } catch {
      // skip malformed
    }
  }
  return tasks;
}

function cryptoRandomId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}
