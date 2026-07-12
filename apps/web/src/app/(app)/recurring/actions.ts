"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";
import type { RecurringSeriesCadence, RecurringSeriesType } from "./types";

export async function confirmRecurringSeries(seriesId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_series")
    .update({ status: "confirmed" })
    .eq("id", seriesId);
  if (error) throw new Error(`failed to confirm series: ${error.message}`);
  revalidatePath("/recurring");
  revalidatePath("/insights");
}

export async function dismissRecurringSeries(seriesId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_series")
    .update({ status: "dismissed" })
    .eq("id", seriesId);
  if (error) throw new Error(`failed to dismiss series: ${error.message}`);
  revalidatePath("/recurring");
}

export interface AddRecurringSeriesInput {
  merchantKey: string;
  cadence: RecurringSeriesCadence;
  expectedAmount: number;
  nextExpectedDate: string;
  seriesType: RecurringSeriesType;
}

export async function addRecurringSeries(input: AddRecurringSeriesInput): Promise<void> {
  const supabase = await createClient();
  const householdId = await getHouseholdId(supabase);

  const normalizedKey = input.merchantKey.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalizedKey) throw new Error("merchant key is required");

  const { error } = await supabase.from("recurring_series").upsert(
    {
      household_id: householdId,
      merchant_key: normalizedKey,
      cadence: input.cadence,
      expected_amount: input.expectedAmount,
      next_expected_date: input.nextExpectedDate,
      series_type: input.seriesType,
      status: "confirmed",
      is_manual: true,
    },
    { onConflict: "household_id,merchant_key" },
  );
  if (error) throw new Error(`failed to add series: ${error.message}`);
  revalidatePath("/recurring");
  revalidatePath("/insights");
}
