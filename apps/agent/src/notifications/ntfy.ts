import { logger } from "../log/logger.js";

export async function sendNtfy(
  topic: string,
  title: string,
  message: string,
  priority: "low" | "default" | "high" | "urgent" = "default",
): Promise<void> {
  if (!topic) return;
  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers: {
        Title: title,
        Priority: priority,
      },
      body: message,
    });
    if (!res.ok) {
      logger.warn(`ntfy push failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    logger.warn(`ntfy push error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function notifySyncResult(
  topic: string,
  connectionDisplayName: string,
  status: string,
  errorCode?: string,
): Promise<void> {
  if (status === "success") return;
  await sendNtfy(
    topic,
    "Sync failed",
    `${connectionDisplayName}: ${status}${errorCode ? ` (${errorCode})` : ""}`,
    "high",
  );
}

export async function notifyNewAnomalies(topic: string, count: number): Promise<void> {
  if (count <= 0) return;
  await sendNtfy(
    topic,
    "New anomaly detected",
    `${count} new anomaly${count === 1 ? "" : "ies"} need${count === 1 ? "s" : ""} attention in the app.`,
    "default",
  );
}
