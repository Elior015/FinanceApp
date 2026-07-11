import { PROVIDER_ACCOUNT_KIND, type Provider } from "@household/shared";
import { getCredential } from "./crypto/secretStore.js";
import { logger } from "./log/logger.js";
import { applyRules } from "./pipeline/applyRules.js";
import { buildTransactionRows } from "./pipeline/normalize.js";
import { resolvePendingTransactions } from "./pipeline/resolve.js";
import { upsertAccount, upsertTransactions } from "./pipeline/upsert.js";
import { runScrape } from "./scraper/runner.js";
import { getSupabaseClient } from "./supabaseClient.js";
import type { ProviderCredentials } from "./scraper/credentials.js";

interface ConnectionRow {
  id: string;
  household_id: string;
  provider: Provider;
  credential_ref: string;
}

async function loadConnection(connectionId: string): Promise<ConnectionRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("connections")
    .select("id, household_id, provider, credential_ref")
    .eq("id", connectionId)
    .single();
  if (error || !data) throw new Error(`connection ${connectionId} not found: ${error?.message}`);
  return data as ConnectionRow;
}

export interface SyncConnectionOptions {
  startDate: Date;
  showBrowser?: boolean;
}

export async function syncConnection(connectionId: string, options: SyncConnectionOptions): Promise<void> {
  const supabase = getSupabaseClient();
  const connection = await loadConnection(connectionId);

  const { data: syncRun, error: syncRunError } = await supabase
    .from("sync_runs")
    .insert({ household_id: connection.household_id, connection_id: connectionId, status: "running" })
    .select("id")
    .single();
  if (syncRunError || !syncRun) throw new Error(`failed to create sync_runs row: ${syncRunError?.message}`);

  try {
    const credentials = getCredential<ProviderCredentials[Provider]>(connection.credential_ref);

    logger.info(`starting scrape for connection ${connectionId} (${connection.provider})`);
    const { result, needsAttention } = await runScrape(connection.provider, credentials, {
      startDate: options.startDate,
      showBrowser: options.showBrowser,
    });

    if (!result.success) {
      if (needsAttention) {
        await supabase.from("connections").update({ status: "needs_attention" }).eq("id", connectionId);
      }
      await supabase
        .from("sync_runs")
        .update({
          status: "failed",
          error_code: result.errorType ?? "GENERAL_ERROR",
          finished_at: new Date().toISOString(),
        })
        .eq("id", syncRun.id);
      logger.error(`scrape failed for connection ${connectionId}: ${result.errorType}`);
      return;
    }

    let txnsAttempted = 0;
    const kind = PROVIDER_ACCOUNT_KIND[connection.provider];

    for (const account of result.accounts ?? []) {
      const accountId = await upsertAccount(supabase, connection.household_id, connectionId, kind, account);
      const rows = buildTransactionRows(connection.household_id, accountId, connection.provider, account);
      const summary = await upsertTransactions(supabase, rows);
      txnsAttempted += summary.attempted;
    }

    const pendingResolved = await resolvePendingTransactions(supabase, connection.household_id);
    const rulesApplied = await applyRules(supabase, connection.household_id);

    await supabase
      .from("connections")
      .update({ status: "active", last_success_at: new Date().toISOString() })
      .eq("id", connectionId);

    // txns_new currently holds the attempted count, not a true
    // new-vs-updated split — Supabase's upsert() doesn't report which
    // rows were inserted vs. matched an existing dedup_hash. Good
    // enough for M0's idempotency proof; the Sync Health screen (M1)
    // should distinguish these properly (e.g. via a RETURNING xmax
    // trick or a dedicated upsert RPC).
    await supabase
      .from("sync_runs")
      .update({
        status: "success",
        txns_new: txnsAttempted,
        pending_resolved: pendingResolved,
        finished_at: new Date().toISOString(),
      })
      .eq("id", syncRun.id);

    logger.info(
      `sync complete for connection ${connectionId}: ${txnsAttempted} transactions processed, ` +
        `${pendingResolved} pending resolved, ${rulesApplied} categorized by rules`,
    );
  } catch (err) {
    await supabase
      .from("sync_runs")
      .update({
        status: "failed",
        error_code: "GENERAL_ERROR",
        finished_at: new Date().toISOString(),
      })
      .eq("id", syncRun.id);
    throw err;
  }
}
