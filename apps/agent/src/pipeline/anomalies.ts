import type { SupabaseClient } from "@supabase/supabase-js";

export async function detectAnomalies(
  supabase: SupabaseClient,
  householdId: string,
): Promise<{ newOpen: number }> {
  const { data, error } = await supabase.rpc("detect_anomalies", {
    p_household_id: householdId,
  });
  if (error) throw new Error(`detect_anomalies failed: ${error.message}`);
  return { newOpen: data ?? 0 };
}
