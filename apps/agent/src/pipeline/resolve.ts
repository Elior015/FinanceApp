import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Merges pending transactions with their later completed counterpart
 * (see the SQL function's own comment for the matching predicate).
 * Runs once per household per sync, after every account's transactions
 * for this connection have been upserted, since the match can involve
 * rows from either row's account within the household.
 */
export async function resolvePendingTransactions(
  supabase: SupabaseClient,
  householdId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("resolve_pending_transactions", {
    p_household_id: householdId,
  });
  if (error) throw new Error(`resolve_pending_transactions failed: ${error.message}`);
  return (data as number) ?? 0;
}
