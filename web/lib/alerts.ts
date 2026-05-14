import { logger } from "./logger";

export type AlertPriority = "low" | "default" | "high";

const PRIORITY_MAP: Record<AlertPriority, string> = {
  low: "2",
  default: "3",
  high: "5",
};

export async function notify(
  title: string,
  message: string,
  priority: AlertPriority = "default"
): Promise<void> {
  const url = process.env.NTFY_URL;
  const topic = process.env.NTFY_TOPIC ?? "smsvxod-alerts";

  if (!url) {
    logger.info({ title, message, priority }, "[ntfy disabled] alert");
    return;
  }

  try {
    const endpoint = `${url.replace(/\/$/, "")}/${topic}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Title: encodeURIComponent(title),
        Priority: PRIORITY_MAP[priority] ?? "3",
        Tags: priority === "high" ? "warning" : "information_source",
      },
      body: message,
    });
    if (!res.ok) {
      logger.warn(
        { status: res.status, endpoint },
        "ntfy POST returned non-2xx"
      );
    }
  } catch (err) {
    logger.error({ err: (err as Error).message }, "ntfy request failed");
  }
}
