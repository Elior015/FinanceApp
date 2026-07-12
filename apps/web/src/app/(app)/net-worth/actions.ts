"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";

export interface CreateManualAssetInput {
  displayName: string;
  currency: string;
  initialValue: number;
  asOf: string;
}

export async function createManualAsset(input: CreateManualAssetInput): Promise<void> {
  const supabase = await createClient();
  const householdId = await getHouseholdId(supabase);

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .insert({
      household_id: householdId,
      connection_id: null,
      kind: "manual_asset",
      currency: input.currency,
      display_name: input.displayName,
    })
    .select("id")
    .single();
  if (accountError || !account) throw new Error(`failed to create manual asset: ${accountError?.message}`);

  const { error: snapshotError } = await supabase.from("asset_snapshots").insert({
    household_id: householdId,
    account_id: account.id,
    as_of: input.asOf,
    value: input.initialValue,
    currency: input.currency,
  });
  if (snapshotError) throw new Error(`failed to create initial snapshot: ${snapshotError.message}`);

  revalidatePath("/net-worth");
  revalidatePath("/");
}

export interface UpdateAssetValueInput {
  value: number;
  asOf: string;
}

/**
 * Inserts a NEW snapshot rather than mutating an existing one — this is
 * what preserves history for a future trend chart (out of scope this
 * cycle, but the data model shouldn't foreclose it).
 */
export async function updateAssetValue(accountId: string, input: UpdateAssetValueInput): Promise<void> {
  const supabase = await createClient();
  const householdId = await getHouseholdId(supabase);

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("currency")
    .eq("id", accountId)
    .single();
  if (accountError || !account) throw new Error(`asset account not found: ${accountError?.message}`);

  const { error } = await supabase.from("asset_snapshots").insert({
    household_id: householdId,
    account_id: accountId,
    as_of: input.asOf,
    value: input.value,
    currency: account.currency,
  });
  if (error) throw new Error(`failed to record asset value: ${error.message}`);

  revalidatePath("/net-worth");
  revalidatePath("/");
}
