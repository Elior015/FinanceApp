import { parseArgs } from "node:util";
import { Providers, type Provider } from "@household/shared";

// `creds`/`audit` never need Supabase, so a missing .env (e.g. in CI,
// or before the service-role key is ever provisioned) is not an error
// — only `sync` actually requires SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY,
// and it will fail loudly on its own if they're absent.
try {
  process.loadEnvFile();
} catch {
  // no .env file present — fine for creds/audit commands
}
import { listCredentialRefs, removeCredential, setCredential } from "./crypto/secretStore.js";
import { PROVIDER_CREDENTIAL_FIELDS } from "./scraper/credentials.js";
import { closePromptInterface, promptHidden, prompt } from "./cli/prompt.js";
import { runFieldAudit } from "./fieldAudit.js";
import { syncConnection } from "./sync.js";
import { logger } from "./log/logger.js";

function usageAndExit(): never {
  console.log(`
Usage:
  agent creds set <ref> <provider>      Interactively store credentials for a connection
  agent creds list                      List stored credential refs
  agent creds remove <ref>              Remove stored credentials
  agent sync <connectionId> [--start-date YYYY-MM-DD] [--show-browser]
  agent audit <ref> <provider> [--start-date YYYY-MM-DD] [--show-browser]
                                         Dry-run field audit (no DB writes)

Providers: ${Providers.join(", ")}
`);
  process.exit(1);
}

function isProvider(value: string): value is Provider {
  return (Providers as readonly string[]).includes(value);
}

function parseStartDate(value: string | undefined): Date {
  if (!value) {
    const d = new Date();
    d.setMonth(d.getMonth() - 1); // default: last month
    return d;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid --start-date "${value}", expected YYYY-MM-DD`);
  }
  return parsed;
}

async function credsSet(ref: string, providerArg: string): Promise<void> {
  if (!isProvider(providerArg)) {
    console.error(`unknown provider "${providerArg}". Known: ${Providers.join(", ")}`);
    process.exit(1);
  }
  const fields = PROVIDER_CREDENTIAL_FIELDS[providerArg];
  const credentials: Record<string, string> = {};
  for (const field of fields) {
    const fieldName = String(field);
    const isSecretField = fieldName === "password" || fieldName === "card6Digits";
    credentials[fieldName] = isSecretField
      ? await promptHidden(`${fieldName}: `)
      : await prompt(`${fieldName}: `);
  }
  closePromptInterface();
  setCredential(ref, { provider: providerArg, ...credentials });
  logger.info(`stored credentials for "${ref}" (${providerArg})`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "creds") {
    const [sub, ...subRest] = rest;
    if (sub === "set") {
      const [ref, providerArg] = subRest;
      if (!ref || !providerArg) usageAndExit();
      await credsSet(ref, providerArg);
      return;
    }
    if (sub === "list") {
      for (const ref of listCredentialRefs()) console.log(ref);
      return;
    }
    if (sub === "remove") {
      const [ref] = subRest;
      if (!ref) usageAndExit();
      removeCredential(ref);
      logger.info(`removed credentials for "${ref}"`);
      return;
    }
    usageAndExit();
  }

  if (command === "sync") {
    const { positionals, values } = parseArgs({
      args: rest,
      options: { "start-date": { type: "string" }, "show-browser": { type: "boolean" } },
      allowPositionals: true,
    });
    const [connectionId] = positionals;
    if (!connectionId) usageAndExit();
    await syncConnection(connectionId, {
      startDate: parseStartDate(values["start-date"]),
      showBrowser: values["show-browser"] as boolean | undefined,
    });
    return;
  }

  if (command === "audit") {
    const { positionals, values } = parseArgs({
      args: rest,
      options: { "start-date": { type: "string" }, "show-browser": { type: "boolean" } },
      allowPositionals: true,
    });
    const [ref, providerArg] = positionals;
    if (!ref || !providerArg || !isProvider(providerArg)) usageAndExit();
    await runFieldAudit(
      providerArg,
      ref,
      parseStartDate(values["start-date"]),
      values["show-browser"] as boolean | undefined,
    );
    return;
  }

  usageAndExit();
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
