import type { Provider } from "@household/shared";
import { getSupabaseClient } from "./supabaseClient.js";

interface HouseholdAdmin {
  household_id: string;
  user_id: string;
}

async function getHouseholdAdmin(): Promise<HouseholdAdmin> {
  const supabase = getSupabaseClient();

  const { data: members, error } = await supabase
    .from("household_members")
    .select("household_id, user_id, role")
    .eq("role", "admin")
    .limit(2);

  if (error) throw new Error(`failed to load household admins: ${error.message}`);
  if (!members || members.length === 0) {
    throw new Error("no household admin found; run bootstrap first");
  }
  if (members.length > 1) {
    throw new Error("multiple household admins found; connection creation requires a single admin");
  }

  return members[0] as HouseholdAdmin;
}

export async function addConnection(
  ref: string,
  provider: Provider,
  displayName?: string,
): Promise<string> {
  const supabase = getSupabaseClient();
  const admin = await getHouseholdAdmin();

  const { data, error } = await supabase
    .from("connections")
    .insert({
      household_id: admin.household_id,
      provider,
      display_name: displayName ?? ref,
      owner_user_id: admin.user_id,
      credential_ref: ref,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`failed to insert connection: ${error?.message ?? "no data returned"}`);
  }

  return data.id as string;
}
