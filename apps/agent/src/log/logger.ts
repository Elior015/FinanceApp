/**
 * Redacting logger. Rather than trying to pattern-match "things that
 * look like secrets" (fragile — a bank password can look like
 * anything), every actual secret value the agent ever loads gets
 * registered here explicitly at the moment it's loaded. Every log
 * call then scans for those exact substrings before printing.
 *
 * This matters because israeli-bank-scrapers error messages can embed
 * raw page HTML/text on failure, which could otherwise echo a
 * password or card digits straight into stdout/a log file.
 */
const knownSecrets = new Set<string>();

export function registerSecret(value: string | undefined | null): void {
  if (!value) return;
  if (value.length < 3) return; // avoid redacting trivially short/common substrings
  knownSecrets.add(value);
}

export function registerSecrets(values: Record<string, unknown>): void {
  for (const value of Object.values(values)) {
    if (typeof value === "string") registerSecret(value);
  }
}

function redact(input: string): string {
  let out = input;
  for (const secret of knownSecrets) {
    out = out.split(secret).join("[REDACTED]");
  }
  return out;
}

function redactArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (typeof arg === "string") return redact(arg);
    if (arg instanceof Error) {
      const redacted = new Error(redact(arg.message));
      redacted.stack = arg.stack ? redact(arg.stack) : undefined;
      redacted.name = arg.name;
      return redacted;
    }
    return arg;
  });
}

export const logger = {
  info(...args: unknown[]): void {
    console.log("[info]", ...redactArgs(args));
  },
  warn(...args: unknown[]): void {
    console.warn("[warn]", ...redactArgs(args));
  },
  error(...args: unknown[]): void {
    console.error("[error]", ...redactArgs(args));
  },
};
