import { z } from "zod";

/**
 * Mirrors the `Transaction` / `TransactionsAccount` shapes returned by
 * israeli-bank-scrapers (verified directly against src/transactions.ts,
 * src/definitions.ts and src/scrapers/{interface,errors,factory}.ts on
 * the library's master branch — npm dist-tag `latest` is 6.8.0, which
 * declares `puppeteer: ^24.40.0` and `node: >=22.13.0`, matching this
 * repo's toolchain). Kept intentionally separate from our DB row type
 * — if the library's actual output drifts from this, parsing fails
 * loudly in the agent instead of silently corrupting data.
 *
 * Every optional field is `.nullish()` (accepts `null` AND `undefined`)
 * rather than plain `.optional()`. This isn't in the library's own TS
 * declarations — those say `identifier?: string | number` — but a real
 * M0 field-audit scrape against Max returned `identifier: null`
 * explicitly on several transactions rather than omitting the key. The
 * declared types describe the happy path better than the real JSON;
 * treat every optional field as possibly-null everywhere, not just the
 * one we happened to catch.
 *
 * Note on the library's own API shape (not modeled here since it's
 * call-pattern, not data): `createScraper(options)` returns a scraper
 * object, and credentials are passed separately to `.scrape(credentials)`
 * — it is NOT a single combined call.
 */
export const ScrapedTransactionSchema = z.object({
  type: z.enum(["normal", "installments"]),
  /** Sometimes called "Asmachta" by the banks. */
  identifier: z.union([z.string(), z.number()]).nullish(),
  date: z.string(),
  processedDate: z.string(),
  originalAmount: z.number(),
  originalCurrency: z.string(),
  chargedAmount: z.number(),
  chargedCurrency: z.string().nullish(),
  description: z.string(),
  memo: z.string().nullish(),
  status: z.enum(["pending", "completed"]),
  installments: z
    .object({
      number: z.number(),
      total: z.number(),
    })
    .nullish(),
  category: z.string().nullish(),
  rawTransaction: z.unknown().optional(),
});
export type ScrapedTransaction = z.infer<typeof ScrapedTransactionSchema>;

export const CardTypeSchema = z.enum(["bankIssued", "companyIssued"]);
export type CardType = z.infer<typeof CardTypeSchema>;

export const ScrapedAccountSchema = z.object({
  accountNumber: z.string(),
  balance: z.number().nullish(),
  balanceDate: z.string().nullish(),
  /** Credit-card limit/frame for the current cycle — useful for billing-cycle reconciliation. */
  cardFrame: z.number().nullish(),
  cardType: CardTypeSchema.nullish(),
  txns: z.array(ScrapedTransactionSchema),
});
export type ScrapedAccount = z.infer<typeof ScrapedAccountSchema>;

/**
 * Known future debits the scraper source already reports directly
 * (distinct from txns) — a gift for cash-flow forecasting and forward
 * installment-liability tracking, since some of this doesn't need to
 * be inferred at all.
 */
export const FutureDebitSchema = z.object({
  amount: z.number(),
  amountCurrency: z.string(),
  chargeDate: z.string().nullish(),
  bankAccountNumber: z.string().nullish(),
});
export type FutureDebit = z.infer<typeof FutureDebitSchema>;

/**
 * Exact values of `ScraperErrorTypes` from src/scrapers/errors.ts.
 * `GENERAL_ERROR` (not `UNKNOWN_ERROR`) is the library's genuine
 * catch-all; `TWO_FACTOR_RETRIEVER_MISSING` fires when a scraper needs
 * an OTP callback that wasn't provided.
 */
export const ScraperErrorType = z.enum([
  "TWO_FACTOR_RETRIEVER_MISSING",
  "INVALID_PASSWORD",
  "CHANGE_PASSWORD",
  "TIMEOUT",
  "ACCOUNT_BLOCKED",
  "GENERIC",
  "GENERAL_ERROR",
]);
export type ScraperErrorType = z.infer<typeof ScraperErrorType>;

export const ScrapeResultSchema = z.object({
  success: z.boolean(),
  accounts: z.array(ScrapedAccountSchema).nullish(),
  futureDebits: z.array(FutureDebitSchema).nullish(),
  errorType: ScraperErrorType.nullish(),
  errorMessage: z.string().nullish(),
});
export type ScrapeResult = z.infer<typeof ScrapeResultSchema>;

export const Providers = ["hapoalim", "leumi", "max", "isracard"] as const;
export type Provider = (typeof Providers)[number];
