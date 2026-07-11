import { describe, expect, it } from "vitest";
import { assignDedupHashes, computeDedupHash } from "./dedup.js";

describe("computeDedupHash", () => {
  it("is stable across repeated calls with an identifier", () => {
    const input = {
      provider: "leumi" as const,
      identifier: "abc123",
      date: "2026-07-01",
      chargedAmount: 55.5,
      description: "SUPERMARKET",
      occurrenceOrdinal: 0,
    };
    expect(computeDedupHash(input)).toBe(computeDedupHash(input));
  });

  it("ignores non-identifier fields when identifier is present", () => {
    const a = computeDedupHash({
      provider: "leumi",
      identifier: "abc123",
      date: "2026-07-01",
      chargedAmount: 55.5,
      description: "SUPERMARKET",
      occurrenceOrdinal: 0,
    });
    const b = computeDedupHash({
      provider: "leumi",
      identifier: "abc123",
      date: "2026-07-02", // different date
      chargedAmount: 99.9, // different amount
      description: "DIFFERENT DESC",
      occurrenceOrdinal: 5,
    });
    expect(a).toBe(b);
  });

  it("differs across providers for the same identifier", () => {
    const shared = {
      identifier: "abc123",
      date: "2026-07-01",
      chargedAmount: 55.5,
      description: "SUPERMARKET",
      occurrenceOrdinal: 0,
    };
    const leumi = computeDedupHash({ provider: "leumi", ...shared });
    const hapoalim = computeDedupHash({ provider: "hapoalim", ...shared });
    expect(leumi).not.toBe(hapoalim);
  });

  it("falls back to composite key when identifier is absent, and is order-of-fields safe", () => {
    // "v1" + "hapoalim" concatenated without a separator would collide
    // with "v1h" + "apoalim" if FIELD_SEP were empty. Assert distinctness
    // across a case constructed to probe exactly that class of bug.
    const a = computeDedupHash({
      provider: "hapoalim",
      date: "2026-07-01",
      chargedAmount: 10,
      description: "X",
      occurrenceOrdinal: 0,
    });
    const b = computeDedupHash({
      provider: "hapoalim",
      date: "2026-07-010", // shifted digit across the field boundary
      chargedAmount: 0,
      description: "X",
      occurrenceOrdinal: 0,
    });
    expect(a).not.toBe(b);
  });

  it("differs by occurrence ordinal for identical duplicate transactions", () => {
    const base = {
      provider: "max" as const,
      date: "2026-07-01",
      chargedAmount: 12,
      description: "COFFEE SHOP",
    };
    const first = computeDedupHash({ ...base, occurrenceOrdinal: 0 });
    const second = computeDedupHash({ ...base, occurrenceOrdinal: 1 });
    expect(first).not.toBe(second);
  });

  it("normalizes description text before hashing (whitespace/bidi-insensitive)", () => {
    const a = computeDedupHash({
      provider: "isracard",
      date: "2026-07-01",
      chargedAmount: 20,
      description: "  SOME   MERCHANT  ",
      occurrenceOrdinal: 0,
    });
    const b = computeDedupHash({
      provider: "isracard",
      date: "2026-07-01",
      chargedAmount: 20,
      description: "SOME MERCHANT",
      occurrenceOrdinal: 0,
    });
    expect(a).toBe(b);
  });

  it("treats an explicit null identifier the same as a missing one (real Max scrapes return null, not undefined)", () => {
    const withNull = computeDedupHash({
      provider: "max",
      identifier: null,
      date: "2026-07-01",
      chargedAmount: 40,
      description: "SOME MERCHANT",
      occurrenceOrdinal: 0,
    });
    const withUndefined = computeDedupHash({
      provider: "max",
      date: "2026-07-01",
      chargedAmount: 40,
      description: "SOME MERCHANT",
      occurrenceOrdinal: 0,
    });
    expect(withNull).toBe(withUndefined);
  });

  it("does not collide two different null-identifier transactions under the literal string 'null'", () => {
    const a = computeDedupHash({
      provider: "max",
      identifier: null,
      date: "2026-07-01",
      chargedAmount: 40,
      description: "MERCHANT A",
      occurrenceOrdinal: 0,
    });
    const b = computeDedupHash({
      provider: "max",
      identifier: null,
      date: "2026-07-01",
      chargedAmount: 99,
      description: "MERCHANT B",
      occurrenceOrdinal: 0,
    });
    expect(a).not.toBe(b);
  });

  it("distinguishes installment legs of the same purchase", () => {
    const base = {
      provider: "isracard" as const,
      date: "2026-07-01",
      chargedAmount: 100,
      description: "ELECTRONICS STORE",
    };
    const leg1 = computeDedupHash({ ...base, installmentNumber: 1, installmentTotal: 3, occurrenceOrdinal: 0 });
    const leg2 = computeDedupHash({ ...base, installmentNumber: 2, installmentTotal: 3, occurrenceOrdinal: 0 });
    expect(leg1).not.toBe(leg2);
  });
});

describe("assignDedupHashes", () => {
  it("produces identical hashes for an identical batch run twice (idempotency)", () => {
    const batch = [
      { date: "2026-07-01", chargedAmount: 55.5, description: "SUPERMARKET" },
      { date: "2026-07-01", chargedAmount: 12, description: "COFFEE" },
      { date: "2026-07-01", chargedAmount: 12, description: "COFFEE" }, // true duplicate txn
    ];
    const run1 = assignDedupHashes("leumi", batch);
    const run2 = assignDedupHashes("leumi", batch);
    expect(run1).toEqual(run2);
    // the two identical coffee purchases must NOT collide with each other
    expect(run1[1]).not.toBe(run1[2]);
  });

  it("uses the provider identifier when present, ignoring ordinal grouping", () => {
    const batch = [
      { identifier: "tx-1", date: "2026-07-01", chargedAmount: 12, description: "COFFEE" },
      { identifier: "tx-2", date: "2026-07-01", chargedAmount: 12, description: "COFFEE" },
    ];
    const hashes = assignDedupHashes("max", batch);
    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it("falls back to the composite key for a batch mixing real and null identifiers (real Max data)", () => {
    const batch = [
      { identifier: "tx-1", date: "2026-07-01", chargedAmount: 55.5, description: "SUPERMARKET" },
      { identifier: null, date: "2026-07-01", chargedAmount: 12, description: "COFFEE" },
      { identifier: null, date: "2026-07-01", chargedAmount: 12, description: "COFFEE" },
    ];
    const hashes = assignDedupHashes("max", batch);
    expect(new Set(hashes).size).toBe(3);
    // re-running the identical batch must be fully idempotent
    expect(assignDedupHashes("max", batch)).toEqual(hashes);
  });

  it("keeps unrelated transactions from colliding", () => {
    const batch = [
      { date: "2026-07-01", chargedAmount: 55.5, description: "SUPERMARKET" },
      { date: "2026-07-02", chargedAmount: 20, description: "PHARMACY" },
    ];
    const hashes = assignDedupHashes("hapoalim", batch);
    expect(new Set(hashes).size).toBe(2);
  });
});
