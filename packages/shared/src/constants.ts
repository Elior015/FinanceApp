import type { Provider } from "./transaction.js";

export const DEFAULT_CURRENCY = "ILS";

export const PENDING_MATCH_AMOUNT_TOLERANCE_PCT = 0.005; // +/- 0.5%
export const PENDING_MATCH_DATE_TOLERANCE_DAYS = 4;
export const PENDING_MAX_AGE_DAYS = 14;

export const CATEGORIZATION_SOURCE_PRIORITY = [
  "manual",
  "rule",
  "merchant_map",
  "llm",
  "none",
] as const;
export type CategorizationSource = (typeof CATEGORIZATION_SOURCE_PRIORITY)[number];

/** Hapoalim/Leumi are banks (checking accounts); Max/Isracard are credit-card companies. */
export const PROVIDER_ACCOUNT_KIND: Record<Provider, "checking" | "credit_card"> = {
  hapoalim: "checking",
  leumi: "checking",
  max: "credit_card",
  isracard: "credit_card",
};
