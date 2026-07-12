import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Populates installment_plans from transactions carrying installment
 * metadata. Runs once per household per sync, after applyRules — the
 * grouping key (account_id, description, installment_total) doesn't
 * depend on categorization, so ordering relative to applyRules doesn't
 * matter functionally, but it keeps the pipeline's "categorize, then
 * project forward liability" narrative in one consistent order.
 */
export async function syncInstallmentPlans(
  supabase: SupabaseClient,
  householdId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("sync_installment_plans", {
    p_household_id: householdId,
  });
  if (error) throw new Error(`sync_installment_plans failed: ${error.message}`);
  return (data as number) ?? 0;
}
