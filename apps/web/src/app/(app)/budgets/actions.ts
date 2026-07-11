"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";

export interface CreateBudgetInput {
  categoryId: string;
  amount: number;
  startsOn: string;
  rollover: boolean;
}

export async function createBudget(input: CreateBudgetInput): Promise<void> {
  const supabase = await createClient();
  const householdId = await getHouseholdId(supabase);

  const { error } = await supabase.from("budgets").insert({
    household_id: householdId,
    category_id: input.categoryId,
    amount: input.amount,
    starts_on: input.startsOn,
    rollover: input.rollover,
  });
  if (error) throw new Error(`failed to create budget: ${error.message}`);
  revalidatePath("/budgets");
}

/**
 * No update action for M1 — editing an amount is delete + re-create.
 * Simple enough for a two-person household's monthly budget count;
 * a real edit form can be added later if that friction actually shows up.
 */
export async function deleteBudget(budgetId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("budgets").delete().eq("id", budgetId);
  if (error) throw new Error(`failed to delete budget: ${error.message}`);
  revalidatePath("/budgets");
}
