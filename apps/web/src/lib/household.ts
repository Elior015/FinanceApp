import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Every signed-in user belongs to exactly one household (fully-pooled,
 * two-person model — see the plan's RLS section), so looking up
 * `household_members` for the current session is enough to know which
 * household_id to scope inserts/queries by. RLS still constrains reads
 * regardless, this just saves the caller from hardcoding the id.
 */
export async function getHouseholdId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not signed in");

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .single();
  if (error || !data) throw new Error(`no household found for user: ${error?.message}`);
  return data.household_id as string;
}
