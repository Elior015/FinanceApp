import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Provider } from "@household/shared";
import { agentDataDir } from "./crypto/masterKey.js";
import { getCredential } from "./crypto/secretStore.js";
import { logger } from "./log/logger.js";
import { runScrape } from "./scraper/runner.js";
import type { ProviderCredentials } from "./scraper/credentials.js";

/**
 * M0 gate: scrapes real data for one provider and reports, from that
 * real data, the facts the rest of the pipeline design depends on —
 * whether `identifier` is actually populated, whether installment
 * totals are present, whether memo shows up, etc. Never touches
 * Supabase; writes only to a local gitignored file.
 */
export async function runFieldAudit(
  provider: Provider,
  credentialRef: string,
  startDate: Date,
  showBrowser?: boolean,
): Promise<void> {
  const credentials = getCredential<ProviderCredentials[Provider]>(credentialRef);
  const { result } = await runScrape(provider, credentials, { startDate, showBrowser });

  if (!result.success) {
    logger.error(`field audit scrape failed for ${provider}: ${result.errorType} ${result.errorMessage ?? ""}`);
    return;
  }

  const outDir = join(agentDataDir(), "field-audit");
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const outPath = join(outDir, `${provider}-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2), { mode: 0o600 });

  const allTxns = (result.accounts ?? []).flatMap((a) => a.txns);
  // `!= null` intentionally uses loose equality to catch both null and
  // undefined in one check — the field audit itself is what caught a
  // real Max scrape returning `identifier: null` explicitly, so this
  // report has to be null-aware or it silently overstates coverage.
  const withIdentifier = allTxns.filter((t) => t.identifier != null && t.identifier !== "").length;
  const withMemo = allTxns.filter((t) => !!t.memo).length;
  const installmentTxns = allTxns.filter((t) => t.type === "installments");
  const installmentsWithTotal = installmentTxns.filter((t) => t.installments?.total != null).length;
  const pendingCount = allTxns.filter((t) => t.status === "pending").length;

  logger.info(`\n=== Field audit report: ${provider} ===`);
  logger.info(`accounts: ${(result.accounts ?? []).length}`);
  logger.info(`total transactions: ${allTxns.length}`);
  logger.info(`  with identifier: ${withIdentifier} / ${allTxns.length}`);
  logger.info(`  with memo: ${withMemo} / ${allTxns.length}`);
  logger.info(`  pending status: ${pendingCount} / ${allTxns.length}`);
  logger.info(`  installment-type transactions: ${installmentTxns.length}`);
  logger.info(`    with installments.total populated: ${installmentsWithTotal} / ${installmentTxns.length}`);
  if (installmentTxns.length > 0) {
    const sample = installmentTxns[0]!;
    logger.info(
      `    sample installment txn — originalAmount=${sample.originalAmount}, chargedAmount=${sample.chargedAmount}, installments=${JSON.stringify(sample.installments)}`,
    );
    logger.info(
      `    (compare originalAmount/chargedAmount to installments.total * chargedAmount to determine whether originalAmount is the full purchase or one monthly slice)`,
    );
  }
  logger.info(`futureDebits reported: ${result.futureDebits?.length ?? 0}`);
  logger.info(`raw scrape output saved to: ${outPath}`);
}
