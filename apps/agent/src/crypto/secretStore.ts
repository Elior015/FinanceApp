import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { agentDataDir, loadOrCreateMasterKey } from "./masterKey.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

interface EncryptedRecord {
  iv: string; // base64
  authTag: string; // base64
  ciphertext: string; // base64
}

type EncryptedStoreFile = Record<string, EncryptedRecord>;

function storePath(): string {
  return process.env.AGENT_CREDENTIALS_FILE ?? join(agentDataDir(), "credentials.enc");
}

function encrypt(masterKey: Buffer, plaintext: string): EncryptedRecord {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decrypt(masterKey: Buffer, record: EncryptedRecord): string {
  const decipher = createDecipheriv(ALGORITHM, masterKey, Buffer.from(record.iv, "base64"));
  decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

function readStoreFile(): EncryptedStoreFile {
  const path = storePath();
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as EncryptedStoreFile;
}

function writeStoreFile(store: EncryptedStoreFile): void {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(store, null, 2), { mode: 0o600 });
}

/**
 * Stores an arbitrary JSON-serializable credentials object under
 * `credentialRef` (the same name referenced by connections.credential_ref
 * in Supabase — the DB only ever holds this name, never the secret).
 */
export function setCredential(credentialRef: string, credentials: unknown): void {
  const masterKey = loadOrCreateMasterKey();
  const store = readStoreFile();
  store[credentialRef] = encrypt(masterKey, JSON.stringify(credentials));
  writeStoreFile(store);
}

export function getCredential<T>(credentialRef: string): T {
  const masterKey = loadOrCreateMasterKey();
  const store = readStoreFile();
  const record = store[credentialRef];
  if (!record) {
    throw new Error(`no stored credentials for ref "${credentialRef}"`);
  }
  return JSON.parse(decrypt(masterKey, record)) as T;
}

export function listCredentialRefs(): string[] {
  return Object.keys(readStoreFile());
}

export function removeCredential(credentialRef: string): void {
  const store = readStoreFile();
  delete store[credentialRef];
  writeStoreFile(store);
}
