import { createHash } from "node:crypto";
import type { Provider } from "./transaction.js";
import { normalizeScrapedText } from "./normalize.js";

// ASCII unit separator, built from its char code so no literal
// control byte ever lives in this source file.
const FIELD_SEP = String.fromCharCode(31);

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * A real M0 field-audit scrape against Max returned `identifier: null`
 * explicitly on several transactions, not just omitted keys. Treat
 * null exactly like undefined/empty-string here — anything else would
 * hash a batch of unrelated null-identifier transactions together
 * under the literal string "null".
 */
function hasIdentifier(identifier: string | number | null | undefined): identifier is string | number {
  return identifier !== undefined && identifier !== null && identifier !== "";
}

export interface DedupHashInput {
  provider: Provider;
  /** The scraper's own transaction identifier, when it provides one. */
  identifier?: string | number | null;
  date: string;
  chargedAmount: number;
  description: string;
  installmentNumber?: number;
  installmentTotal?: number;
  /**
   * Disambiguates same-day/same-amount/same-description transactions
   * that would otherwise collide when `identifier` is absent (e.g. two
   * identical coffee purchases). Assigned by `assignDedupHashes` below
   * via a stable sort within one scrape batch — never invented ad hoc,
   * since ordinal assignment must be deterministic run-to-run for the
   * hash to stay stable.
   */
  occurrenceOrdinal: number;
}

/**
 * Deterministic identity for one scraped transaction, used as the
 * unique key for (account_id, dedup_hash) upserts. Re-running a scrape
 * must produce the same hash for the same real-world transaction so
 * the upsert is a no-op instead of a duplicate row.
 */
export function computeDedupHash(input: DedupHashInput): string {
  if (hasIdentifier(input.identifier)) {
    return sha256Hex(
      ["v1", input.provider, "id", String(input.identifier)].join(FIELD_SEP),
    );
  }

  const normalizedDescription = normalizeScrapedText(input.description);
  const installmentPart =
    input.installmentNumber !== undefined && input.installmentTotal !== undefined
      ? `${input.installmentNumber}/${input.installmentTotal}`
      : "none";

  return sha256Hex(
    [
      "v1",
      input.provider,
      "fallback",
      input.date,
      input.chargedAmount.toFixed(2),
      normalizedDescription,
      installmentPart,
      String(input.occurrenceOrdinal),
    ].join(FIELD_SEP),
  );
}

export interface BatchDedupTxn {
  identifier?: string | number | null;
  date: string;
  chargedAmount: number;
  description: string;
  installmentNumber?: number;
  installmentTotal?: number;
}

/**
 * Computes dedup hashes for a whole scrape batch, assigning stable
 * occurrence ordinals to transactions that share the same
 * (date, amount, description, installment) key and have no provider
 * identifier. Ordinals are assigned in the batch's original order, so
 * as long as the provider returns same-day duplicates in a consistent
 * relative order across runs, the hashes stay stable. If the provider
 * ever reorders identical twins across runs, the pair still hashes to
 * the same *set* of two hashes — no data loss, just a possible swap of
 * which specific row absorbs which update.
 */
export function assignDedupHashes(
  provider: Provider,
  transactions: readonly BatchDedupTxn[],
): string[] {
  const seenCounts = new Map<string, number>();

  return transactions.map((txn) => {
    if (hasIdentifier(txn.identifier)) {
      return computeDedupHash({
        provider,
        identifier: txn.identifier,
        date: txn.date,
        chargedAmount: txn.chargedAmount,
        description: txn.description,
        installmentNumber: txn.installmentNumber,
        installmentTotal: txn.installmentTotal,
        occurrenceOrdinal: 0,
      });
    }

    const groupKey = [
      txn.date,
      txn.chargedAmount.toFixed(2),
      normalizeScrapedText(txn.description),
      txn.installmentNumber ?? "",
      txn.installmentTotal ?? "",
    ].join(FIELD_SEP);

    const ordinal = seenCounts.get(groupKey) ?? 0;
    seenCounts.set(groupKey, ordinal + 1);

    return computeDedupHash({
      provider,
      date: txn.date,
      chargedAmount: txn.chargedAmount,
      description: txn.description,
      installmentNumber: txn.installmentNumber,
      installmentTotal: txn.installmentTotal,
      occurrenceOrdinal: ordinal,
    });
  });
}
