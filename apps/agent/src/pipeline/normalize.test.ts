import { describe, expect, it } from "vitest";
import type { ScrapedAccount } from "@household/shared";
import { buildTransactionRows } from "./normalize.js";

function fakeAccount(txns: ScrapedAccount["txns"]): ScrapedAccount {
  return { accountNumber: "123456", balance: 1000, txns };
}

describe("buildTransactionRows", () => {
  it("maps a normal completed transaction to a DB-ready row", () => {
    const account = fakeAccount([
      {
        type: "normal",
        identifier: "tx-1",
        date: "2026-07-01",
        processedDate: "2026-07-02",
        originalAmount: -55.5,
        originalCurrency: "ILS",
        chargedAmount: -55.5,
        chargedCurrency: "ILS",
        description: "  SUPERMARKET  ",
        status: "completed",
      },
    ]);

    const rows = buildTransactionRows("hh-1", "acc-1", "leumi", account);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      household_id: "hh-1",
      account_id: "acc-1",
      description: "SUPERMARKET", // whitespace normalized
      status: "completed",
      txn_type: "normal",
      provider_identifier: "tx-1",
      installment_number: null,
      installment_total: null,
    });
    expect(rows[0]!.dedup_hash).toBeTruthy();
  });

  it("stores provider_identifier as null (not the string 'null') when the scraper returns an explicit null identifier", () => {
    // Real M0 field-audit finding: a live scrape against Max returned
    // `identifier: null` on several transactions rather than omitting
    // the key entirely.
    const account = fakeAccount([
      {
        type: "normal",
        identifier: null,
        date: "2026-07-01",
        processedDate: "2026-07-01",
        originalAmount: -40,
        originalCurrency: "ILS",
        chargedAmount: -40,
        description: "SOME MERCHANT",
        status: "completed",
      },
    ]);

    const rows = buildTransactionRows("hh-1", "acc-1", "max", account);
    expect(rows[0]!.provider_identifier).toBeNull();
  });

  it("produces stable dedup hashes across repeated calls (idempotency)", () => {
    const account = fakeAccount([
      {
        type: "normal",
        date: "2026-07-01",
        processedDate: "2026-07-01",
        originalAmount: -20,
        originalCurrency: "ILS",
        chargedAmount: -20,
        description: "PHARMACY",
        status: "completed",
      },
    ]);

    const first = buildTransactionRows("hh-1", "acc-1", "hapoalim", account);
    const second = buildTransactionRows("hh-1", "acc-1", "hapoalim", account);
    expect(first[0]!.dedup_hash).toBe(second[0]!.dedup_hash);
  });

  it("keeps two identical same-day transactions distinct", () => {
    const txn = {
      type: "normal" as const,
      date: "2026-07-01",
      processedDate: "2026-07-01",
      originalAmount: -12,
      originalCurrency: "ILS",
      chargedAmount: -12,
      description: "COFFEE",
      status: "completed" as const,
    };
    const account = fakeAccount([txn, txn]);
    const rows = buildTransactionRows("hh-1", "acc-1", "max", account);
    expect(rows[0]!.dedup_hash).not.toBe(rows[1]!.dedup_hash);
  });

  it("carries installment numbers through to the row", () => {
    const account = fakeAccount([
      {
        type: "installments",
        date: "2026-07-01",
        processedDate: "2026-07-01",
        originalAmount: -300,
        originalCurrency: "ILS",
        chargedAmount: -100,
        description: "ELECTRONICS STORE",
        status: "completed",
        installments: { number: 1, total: 3 },
      },
    ]);
    const rows = buildTransactionRows("hh-1", "acc-1", "isracard", account);
    expect(rows[0]).toMatchObject({
      txn_type: "installments",
      installment_number: 1,
      installment_total: 3,
    });
  });

  it("defaults charged_currency to original_currency when the scraper omits it", () => {
    const account = fakeAccount([
      {
        type: "normal",
        date: "2026-07-01",
        processedDate: "2026-07-01",
        originalAmount: -10,
        originalCurrency: "USD",
        chargedAmount: -37,
        description: "FOREIGN MERCHANT",
        status: "completed",
      },
    ]);
    const rows = buildTransactionRows("hh-1", "acc-1", "max", account);
    expect(rows[0]!.charged_currency).toBe("USD");
  });
});
