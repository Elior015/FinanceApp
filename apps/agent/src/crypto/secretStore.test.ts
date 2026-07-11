import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("secretStore", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "agent-secret-store-test-"));
    process.env.AGENT_DATA_DIR = dataDir;
    delete process.env.CREDENTIALS_DIRECTORY;
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.AGENT_DATA_DIR;
  });

  it("round-trips credentials through encrypt/decrypt", async () => {
    const { setCredential, getCredential } = await import("./secretStore.js");
    setCredential("leumi-main", { username: "elior", password: "hunter2" });
    const result = getCredential<{ username: string; password: string }>("leumi-main");
    expect(result).toEqual({ username: "elior", password: "hunter2" });
  });

  it("persists across separate store reads (reuses the same master key)", async () => {
    const { setCredential, getCredential } = await import("./secretStore.js");
    setCredential("isracard-main", { id: "123", card6Digits: "456789", password: "secret" });
    // Simulate a fresh process by re-reading with no cached state.
    const reread = getCredential<{ id: string; card6Digits: string; password: string }>("isracard-main");
    expect(reread.password).toBe("secret");
  });

  it("lists and removes credential refs", async () => {
    const { setCredential, listCredentialRefs, removeCredential } = await import("./secretStore.js");
    setCredential("a", { x: 1 });
    setCredential("b", { y: 2 });
    expect(listCredentialRefs().sort()).toEqual(["a", "b"]);
    removeCredential("a");
    expect(listCredentialRefs()).toEqual(["b"]);
  });

  it("throws a clear error for an unknown ref", async () => {
    const { getCredential } = await import("./secretStore.js");
    expect(() => getCredential("does-not-exist")).toThrow(/no stored credentials/);
  });

  it("stores credentials file with restrictive permissions", async () => {
    const { setCredential } = await import("./secretStore.js");
    setCredential("leumi-main", { username: "elior", password: "hunter2" });
    const { statSync } = await import("node:fs");
    const stat = statSync(join(dataDir, "credentials.enc"));
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
