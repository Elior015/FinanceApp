"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateAnomalyStatus(
  anomalyId: string,
  status: "acknowledged" | "dismissed",
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("anomalies").update({ status }).eq("id", anomalyId);
  if (error) throw new Error(`failed to update anomaly: ${error.message}`);
  revalidatePath("/insights");
}
