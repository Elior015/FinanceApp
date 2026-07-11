"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";

/**
 * Every mutation here sets categorization_source='manual' (or leaves
 * it alone for non-category edits) — that's what makes a manual edit
 * permanently immune to the agent's rule-engine/merchant_map passes
 * (manual > rule > merchant_map > llm > none precedence, per the plan).
 */
export async function categorizeTransaction(transactionId: string, categoryId: string | null): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId, categorization_source: "manual" })
    .eq("id", transactionId);
  if (error) throw new Error(`failed to categorize transaction: ${error.message}`);
  revalidatePath("/transactions");
}

export async function bulkCategorize(transactionIds: string[], categoryId: string | null): Promise<void> {
  if (transactionIds.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId, categorization_source: "manual" })
    .in("id", transactionIds);
  if (error) throw new Error(`failed to bulk categorize transactions: ${error.message}`);
  revalidatePath("/transactions");
}

export async function updateTransactionDetails(
  transactionId: string,
  updates: { categoryId?: string | null; isPersonal?: boolean; tags?: string[]; notes?: string | null },
): Promise<void> {
  const supabase = await createClient();
  const payload: Record<string, unknown> = { categorization_source: "manual" };
  if (updates.categoryId !== undefined) payload.category_id = updates.categoryId;
  if (updates.isPersonal !== undefined) payload.is_personal = updates.isPersonal;
  if (updates.tags !== undefined) payload.tags = updates.tags;
  if (updates.notes !== undefined) payload.notes = updates.notes;

  const { error } = await supabase.from("transactions").update(payload).eq("id", transactionId);
  if (error) throw new Error(`failed to update transaction: ${error.message}`);
  revalidatePath("/transactions");
}

export interface CreateManualTransactionInput {
  accountId: string;
  date: string;
  description: string;
  chargedAmount: number;
  categoryId: string | null;
  isPersonal: boolean;
}

/**
 * Manual entries bypass the scraper entirely, so there's nothing to
 * dedupe against — a random uuid satisfies the (account_id, dedup_hash)
 * unique index without needing the real scraper hash algorithm here.
 */
export async function createManualTransaction(input: CreateManualTransactionInput): Promise<void> {
  const supabase = await createClient();
  const householdId = await getHouseholdId(supabase);

  const { error } = await supabase.from("transactions").insert({
    household_id: householdId,
    account_id: input.accountId,
    date: input.date,
    charged_amount: input.chargedAmount,
    original_amount: input.chargedAmount,
    description: input.description,
    status: "completed",
    category_id: input.categoryId,
    categorization_source: input.categoryId ? "manual" : "none",
    is_personal: input.isPersonal,
    is_manual: true,
    dedup_hash: `manual-${randomUUID()}`,
  });
  if (error) throw new Error(`failed to create manual transaction: ${error.message}`);
  revalidatePath("/transactions");
}
