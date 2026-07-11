/**
 * Simple polling daemon for the manual "Sync now" flow (M1). The web
 * app has no way to call the agent directly (no inbound ports at
 * home, by design — see the plan's architecture section), so it just
 * inserts a row into `sync_requests`; this process polls for pending
 * rows and runs the real sync. Not a Supabase Realtime listener and
 * not packaged under systemd yet — both are real-home-box deployment
 * concerns, deferred until this app is off the dev machine and more
 * providers are live (see the plan's M1 section for why).
 *
 * Run manually: `pnpm exec tsx src/daemon.ts`
 */
try {
  process.loadEnvFile();
} catch {
  // no .env file present
}

import { syncConnection } from "./sync.js";
import { logger } from "./log/logger.js";
import { getSupabaseClient } from "./supabaseClient.js";

const POLL_INTERVAL_MS = 30_000;

interface SyncRequestRow {
  id: string;
  household_id: string;
  connection_id: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function claimNextRequest(): Promise<SyncRequestRow | null> {
  const supabase = getSupabaseClient();

  const { data: candidates, error: selectError } = await supabase
    .from("sync_requests")
    .select("id, household_id, connection_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);
  if (selectError) throw new Error(`failed to poll sync_requests: ${selectError.message}`);
  if (!candidates || candidates.length === 0) return null;

  const candidate = candidates[0] as SyncRequestRow;

  // Guards against two daemon instances claiming the same row — the
  // update only "wins" if status was still 'pending' at update time.
  const { data: claimed, error: claimError } = await supabase
    .from("sync_requests")
    .update({ status: "claimed", claimed_at: new Date().toISOString() })
    .eq("id", candidate.id)
    .eq("status", "pending")
    .select("id, household_id, connection_id")
    .maybeSingle();
  if (claimError) throw new Error(`failed to claim sync_requests row: ${claimError.message}`);
  return (claimed as SyncRequestRow | null) ?? null;
}

async function processRequest(request: SyncRequestRow): Promise<void> {
  const supabase = getSupabaseClient();

  const connectionIds: string[] = [];
  if (request.connection_id) {
    connectionIds.push(request.connection_id);
  } else {
    const { data: connections, error } = await supabase
      .from("connections")
      .select("id")
      .eq("household_id", request.household_id)
      .eq("status", "active");
    if (error) throw new Error(`failed to list connections for sync request: ${error.message}`);
    for (const c of connections ?? []) connectionIds.push(c.id as string);
  }

  let allSucceeded = true;
  for (const connectionId of connectionIds) {
    try {
      logger.info(`daemon: syncing connection ${connectionId} (request ${request.id})`);
      await syncConnection(connectionId, { startDate: defaultStartDate() });
    } catch (err) {
      allSucceeded = false;
      logger.error(`daemon: sync failed for connection ${connectionId}: ${(err as Error).message}`);
    }
  }

  await supabase
    .from("sync_requests")
    .update({ status: allSucceeded ? "done" : "failed" })
    .eq("id", request.id);
}

function defaultStartDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d;
}

async function pollOnce(): Promise<void> {
  const request = await claimNextRequest();
  if (!request) return;
  await processRequest(request);
}

async function main(): Promise<void> {
  logger.info(`daemon: polling sync_requests every ${POLL_INTERVAL_MS / 1000}s`);
  for (;;) {
    try {
      await pollOnce();
    } catch (err) {
      logger.error(`daemon: poll iteration failed: ${(err as Error).message}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

main();
