import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isEncryptedSecretFile,
  openSecretUtf8,
  sealSecretUtf8,
  VaultSecretError,
} from "./secret-file.js";

describe("secret-file envelope", () => {
  const dek = randomBytes(32);

  it("round-trips UTF-8 under seal/open", () => {
    const raw = sealSecretUtf8(dek, "plaid-access-token-xyz");
    expect(isEncryptedSecretFile(raw)).toBe(true);
    expect(raw.includes("plaid-access-token-xyz")).toBe(false);
    expect(openSecretUtf8(dek, raw)).toBe("plaid-access-token-xyz");
  });

  it("throws VaultSecretError on wrong DEK", () => {
    const raw = sealSecretUtf8(dek, "secret");
    expect(() => openSecretUtf8(randomBytes(32), raw)).toThrow(VaultSecretError);
  });

  it("throws VaultSecretError on malformed envelope", () => {
    expect(() => openSecretUtf8(dek, "attache-secret-v1:{bad json")).toThrow(
      VaultSecretError,
    );
  });

  it("does not treat legacy plaintext as encrypted", () => {
    expect(isEncryptedSecretFile("plain-oauth-token")).toBe(false);
  });
});

describe("encryptPlaintextSecrets migration", () => {
  let vaultDir: string;
  const dek = randomBytes(32);

  beforeEach(() => {
    vaultDir = mkdtempSync(join(tmpdir(), "attache-vault-mig-"));
  });

  afterEach(() => {
    rmSync(vaultDir, { recursive: true, force: true });
  });

  it("rewrites plaintext files and skips already-encrypted ones", async () => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(vaultDir, "plaid_item_1.secret"), "token-a", { mode: 0o600 });
    writeFileSync(join(vaultDir, "gmail_oauth.secret"), sealSecretUtf8(dek, "token-b"), {
      mode: 0o600,
    });

    const { encryptPlaintextSecrets } = await import("../vault/migrate-secrets.js");
    const result = encryptPlaintextSecrets(dek, vaultDir);
    expect(result).toEqual({ migrated: 1, skipped: 1 });

    const migrated = readFileSync(join(vaultDir, "plaid_item_1.secret"), "utf-8");
    expect(isEncryptedSecretFile(migrated)).toBe(true);
    expect(openSecretUtf8(dek, migrated)).toBe("token-a");
  });
});

describe("LocalVaultPort encryption", () => {
  let vaultDir: string;
  const dek = randomBytes(32);

  beforeEach(() => {
    vaultDir = mkdtempSync(join(tmpdir(), "attache-local-vault-"));
  });

  afterEach(() => {
    rmSync(vaultDir, { recursive: true, force: true });
  });

  it("writes encrypted files when constructed with an explicit DEK", async () => {
    const { LocalVaultPort } = await import("../vault/local-vault.js");
    const vault = new LocalVaultPort(vaultDir, dek);
    vault.set("plaid-item-1", "super-secret-token");

    const raw = readFileSync(join(vaultDir, "plaid-item-1.secret"), "utf-8");
    expect(isEncryptedSecretFile(raw)).toBe(true);
    expect(raw.includes("super-secret-token")).toBe(false);
    expect(vault.get("plaid-item-1")).toBe("super-secret-token");
  });

  it("reads legacy plaintext when dekOverride is null", async () => {
    const { writeFileSync } = await import("node:fs");
    const { LocalVaultPort } = await import("../vault/local-vault.js");
    writeFileSync(join(vaultDir, "legacy.secret"), "old-plaintext", { mode: 0o600 });

    const vault = new LocalVaultPort(vaultDir, null);
    expect(vault.get("legacy")).toBe("old-plaintext");
  });

  it("throws when reading encrypted file without a DEK", async () => {
    const { writeFileSync } = await import("node:fs");
    const { LocalVaultPort } = await import("../vault/local-vault.js");
    writeFileSync(join(vaultDir, "locked.secret"), sealSecretUtf8(dek, "hidden"), {
      mode: 0o600,
    });

    const vault = new LocalVaultPort(vaultDir, null);
    expect(() => vault.get("locked")).toThrow(VaultSecretError);
  });
});
