import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Applies the household's rule engine to transactions still at
 * categorization_source='none'. Runs once per household per sync,
 * after resolvePendingTransactions — a merged pending→completed row
 * should still be eligible for rule categorization even if it started
 * out as 'none' before the merge.
 */
export async function applyRules(supabase: SupabaseClient, householdId: string): Promise<number> {
  const { data, error } = await supabase.rpc("apply_rules", { p_household_id: householdId });
  if (error) throw new Error(`apply_rules failed: ${error.message}`);
  return (data as number) ?? 0;
}
