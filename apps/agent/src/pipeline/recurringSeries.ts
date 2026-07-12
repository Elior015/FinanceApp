import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Proposes/updates recurring_series rows from recent transaction history.
 * Runs once per household per sync, after installment plan sync and before
 * anomaly detection, so confirmed series feed the subscription_increase and
 * missed_recurring anomaly branches.
 */
export async function populateRecurringSeries(
  supabase: SupabaseClient,
  householdId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("populate_recurring_series", {
    p_household_id: householdId,
  });
  if (error) throw new Error(`populate_recurring_series failed: ${error.message}`);
  return (data as number) ?? 0;
}
