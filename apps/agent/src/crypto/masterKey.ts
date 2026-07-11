import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const MASTER_KEY_BYTES = 32;

export function agentDataDir(): string {
  return process.env.AGENT_DATA_DIR ?? join(homedir(), ".household-finance-agent");
}

/**
 * Locates the master key used to encrypt/decrypt bank credentials.
 *
 * Production (systemd): the key is provisioned out-of-band via
 * `systemd-creds encrypt` and delivered to this process only through
 * `LoadCredential=` — systemd exposes it as a file inside
 * $CREDENTIALS_DIRECTORY, root-owned and never an env var or CLI arg.
 * We only ever read it here; provisioning it is an ops step, not
 * something this code does.
 *
 * Local/dev fallback: a root-owned (0600) file under the agent data
 * dir, generated on first use. This is explicitly the weaker of the
 * two options — see the secrets-handling design in the plan for the
 * threat model this accepts (OS permissions are the real boundary on
 * a single-user box; this protects against disk theft and accidental
 * `cat`/commit, not a compromised local root).
 */
export function loadOrCreateMasterKey(): Buffer {
  const credentialsDir = process.env.CREDENTIALS_DIRECTORY;
  if (credentialsDir) {
    const keyPath = join(credentialsDir, "master-key");
    return Buffer.from(readFileSync(keyPath, "utf8").trim(), "base64");
  }

  const dataDir = agentDataDir();
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const keyPath = join(dataDir, "master.key");

  if (existsSync(keyPath)) {
    return Buffer.from(readFileSync(keyPath, "utf8").trim(), "base64");
  }

  const key = randomBytes(MASTER_KEY_BYTES);
  writeFileSync(keyPath, key.toString("base64"), { mode: 0o600 });
  chmodSync(keyPath, 0o600);
  return key;
}
