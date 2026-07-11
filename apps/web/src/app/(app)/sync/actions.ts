"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";

/**
 * Inserts a job for the agent's polling daemon (apps/agent/src/daemon.ts)
 * to pick up — the web app can never call the agent directly (no
 * inbound ports at the home box, by design). `connectionId: null` asks
 * the daemon to sync every active connection in the household.
 */
export async function requestSync(connectionId: string | null): Promise<void> {
  const supabase = await createClient();
  const householdId = await getHouseholdId(supabase);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not signed in");

  const { error } = await supabase.from("sync_requests").insert({
    household_id: householdId,
    connection_id: connectionId,
    requested_by: user.id,
  });
  if (error) throw new Error(`failed to request sync: ${error.message}`);
  revalidatePath("/sync");
}
