import { describe, expect, it } from "vitest";
import { normalizeScrapedText } from "./normalize.js";

describe("normalizeScrapedText", () => {
  it("collapses internal whitespace and trims", () => {
    expect(normalizeScrapedText("  SOME    MERCHANT  ")).toBe("SOME MERCHANT");
  });

  it("strips bidi control characters without touching real Hebrew text", () => {
    const rlm = String.fromCharCode(0x200f);
    const lrm = String.fromCharCode(0x200e);
    const hebrew = String.fromCharCode(0x05e9, 0x05d5, 0x05e7); // shin-vav-qof
    const input = `${rlm}${hebrew}${lrm}`;
    expect(normalizeScrapedText(input)).toBe(hebrew);
  });

  it("is idempotent", () => {
    const once = normalizeScrapedText("  Test   Merchant  ");
    expect(normalizeScrapedText(once)).toBe(once);
  });

  it("NFC-normalizes decomposed Hebrew vowel points to composed form", () => {
    // Hebrew letter alef followed by a combining sign should compose
    // deterministically so identical merchant text always hashes the
    // same regardless of the scraper's internal encoding form.
    const alef = String.fromCharCode(0x05d0);
    const decomposed = alef + String.fromCharCode(0x05b7); // alef + patah
    expect(normalizeScrapedText(decomposed)).toBe(decomposed.normalize("NFC"));
  });
});
