import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScrapedAccount } from "@household/shared";
import type { TransactionRow } from "./normalize.js";

export async function upsertAccount(
  supabase: SupabaseClient,
  householdId: string,
  connectionId: string,
  kind: "checking" | "credit_card",
  account: ScrapedAccount,
): Promise<string> {
  const { data, error } = await supabase
    .from("accounts")
    .upsert(
      {
        household_id: householdId,
        connection_id: connectionId,
        provider_account_number: account.accountNumber,
        kind,
        display_name: account.accountNumber,
        latest_balance: account.balance ?? null,
        latest_balance_at: account.balance !== undefined ? new Date().toISOString() : null,
      },
      { onConflict: "connection_id,provider_account_number" },
    )
    .select("id")
    .single();

  if (error) throw new Error(`failed to upsert account: ${error.message}`);
  return data.id as string;
}

export interface UpsertTransactionsSummary {
  attempted: number;
}

export async function upsertTransactions(
  supabase: SupabaseClient,
  rows: TransactionRow[],
): Promise<UpsertTransactionsSummary> {
  if (rows.length === 0) return { attempted: 0 };

  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("transactions")
      .upsert(batch, { onConflict: "account_id,dedup_hash" });
    if (error) throw new Error(`failed to upsert transactions batch: ${error.message}`);
  }

  return { attempted: rows.length };
}
