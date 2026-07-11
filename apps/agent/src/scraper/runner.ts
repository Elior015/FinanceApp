import { CompanyTypes, createScraper } from "israeli-bank-scrapers";
import { ScrapeResultSchema, type Provider, type ScrapeResult } from "@household/shared";
import { logger, registerSecrets } from "../log/logger.js";
import type { ProviderCredentials } from "./credentials.js";

const RETRYABLE_ERROR_TYPES = new Set(["TIMEOUT", "GENERIC"]);

export interface ScrapeOptions {
  startDate: Date;
  showBrowser?: boolean;
  timeoutMs?: number;
}

export interface ScrapeAttemptResult {
  result: ScrapeResult;
  /** True when the failure is durable and the connection needs a human (bad password, blocked account, etc.) — never retried automatically. */
  needsAttention: boolean;
}

/**
 * Runs one scrape for one provider/credentials pair. Retries once on
 * TIMEOUT/GENERIC (transient); anything else (INVALID_PASSWORD,
 * ACCOUNT_BLOCKED, CHANGE_PASSWORD, TWO_FACTOR_RETRIEVER_MISSING,
 * GENERAL_ERROR) is durable and surfaces as `needsAttention` so the
 * caller can mark the connection and stop, rather than hammering a
 * bank's login endpoint.
 *
 * Note the library's real call shape: `createScraper(options)` builds
 * the scraper, and credentials are passed separately to `.scrape()` —
 * they are not combined into one call.
 */
export async function runScrape<P extends Provider>(
  provider: P,
  credentials: ProviderCredentials[P],
  options: ScrapeOptions,
): Promise<ScrapeAttemptResult> {
  registerSecrets(credentials);

  const scraperOptions = {
    companyId: CompanyTypes[provider],
    startDate: options.startDate,
    combineInstallments: false,
    showBrowser: options.showBrowser ?? false,
    defaultTimeout: options.timeoutMs,
  };

  const attempt = async () => {
    const scraper = createScraper(scraperOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return scraper.scrape(credentials as any);
  };

  let rawResult = await attempt();

  if (!rawResult.success && rawResult.errorType && RETRYABLE_ERROR_TYPES.has(rawResult.errorType)) {
    logger.warn(`scrape failed with retryable error ${rawResult.errorType} for ${provider}, retrying once`);
    rawResult = await attempt();
  }

  const parsed = ScrapeResultSchema.safeParse(rawResult);
  if (!parsed.success) {
    logger.error(`scrape result for ${provider} did not match the expected shape — the library's API may have drifted`, parsed.error.message);
    throw new Error(`unexpected scrape result shape for provider ${provider}`);
  }

  const needsAttention = !parsed.data.success && !!parsed.data.errorType && !RETRYABLE_ERROR_TYPES.has(parsed.data.errorType);

  return { result: parsed.data, needsAttention };
}
