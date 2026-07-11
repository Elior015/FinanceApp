import {
  assignDedupHashes,
  normalizeScrapedText,
  type Provider,
  type ScrapedAccount,
} from "@household/shared";

/**
 * A row ready for `transactions` upsert. Deliberately omits
 * category_id/categorization_source/applied_rule_id/is_personal/
 * owner_user_id/exclude_from_totals/tags/notes/billing_cycle_id/
 * is_manual — those are either DB defaults on first insert or owned
 * by the rule engine / manual edits (M1+), and must never be
 * clobbered by a re-scrape. Supabase's upsert only SETs the columns
 * present in the payload on conflict, so simply not including those
 * fields here is what keeps them untouched across re-runs.
 */
export interface TransactionRow {
  household_id: string;
  account_id: string;
  date: string;
  processed_date: string | null;
  charged_amount: number;
  charged_currency: string;
  original_amount: number;
  original_currency: string;
  description: string;
  memo: string | null;
  status: "pending" | "completed";
  txn_type: "normal" | "installments";
  installment_number: number | null;
  installment_total: number | null;
  provider_identifier: string | null;
  dedup_hash: string;
  raw: unknown;
}

export function buildTransactionRows(
  householdId: string,
  accountId: string,
  provider: Provider,
  account: ScrapedAccount,
): TransactionRow[] {
  const dedupHashes = assignDedupHashes(
    provider,
    account.txns.map((txn) => ({
      identifier: txn.identifier,
      date: txn.date,
      chargedAmount: txn.chargedAmount,
      description: txn.description,
      installmentNumber: txn.installments?.number,
      installmentTotal: txn.installments?.total,
    })),
  );

  return account.txns.map((txn, index) => ({
    household_id: householdId,
    account_id: accountId,
    date: txn.date,
    processed_date: txn.processedDate ?? null,
    charged_amount: txn.chargedAmount,
    charged_currency: txn.chargedCurrency ?? txn.originalCurrency,
    original_amount: txn.originalAmount,
    original_currency: txn.originalCurrency,
    description: normalizeScrapedText(txn.description),
    memo: txn.memo ? normalizeScrapedText(txn.memo) : null,
    status: txn.status,
    txn_type: txn.type,
    installment_number: txn.installments?.number ?? null,
    installment_total: txn.installments?.total ?? null,
    // A real scrape can return `identifier: null` explicitly (not just
    // omitted) — treat null the same as undefined here, or it would
    // get stored as the literal string "null".
    provider_identifier: txn.identifier !== undefined && txn.identifier !== null ? String(txn.identifier) : null,
    dedup_hash: dedupHashes[index]!,
    raw: txn.rawTransaction ?? null,
  }));
}
