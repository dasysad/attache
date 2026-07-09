import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultVaultDir } from "../db.js";
import {
  isEncryptedSecretFile,
  openSecretUtf8,
  sealSecretUtf8,
  VaultSecretError,
} from "../crypto/secret-file.js";

/**
 * VS-8 — migrate legacy plaintext `.secret` files to AES-256-GCM envelopes.
 * Called by `attache vault encrypt` alongside database rekey.
 */

export class SecretMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretMigrationError";
  }
}

export interface SecretMigrationResult {
  /** Files rewritten from plaintext to encrypted. */
  migrated: number;
  /** Files already in encrypted format. */
  skipped: number;
}

/**
 * Encrypt every plaintext `*.secret` in `vaultDir` under `dek`.
 * Idempotent: already-encrypted files are counted in `skipped`.
 */
export function encryptPlaintextSecrets(
  dek: Buffer,
  vaultDir: string = defaultVaultDir(),
): SecretMigrationResult {
  if (dek.length !== 32) {
    throw new SecretMigrationError(`DEK must be 32 bytes, got ${dek.length}`);
  }
  if (!existsSync(vaultDir)) {
    return { migrated: 0, skipped: 0 };
  }

  let migrated = 0;
  let skipped = 0;

  for (const name of readdirSync(vaultDir)) {
    if (!name.endsWith(".secret")) continue;
    const path = join(vaultDir, name);
    const raw = readFileSync(path, "utf-8");
    if (isEncryptedSecretFile(raw)) {
      skipped++;
      continue;
    }
    writeFileSync(path, sealSecretUtf8(dek, raw), { encoding: "utf-8", mode: 0o600 });
    migrated++;
  }

  return { migrated, skipped };
}

/** Count plaintext vs encrypted secret files (for vault status). */
export function countSecretFiles(vaultDir: string = defaultVaultDir()): {
  plaintext: number;
  encrypted: number;
} {
  if (!existsSync(vaultDir)) {
    return { plaintext: 0, encrypted: 0 };
  }
  let plaintext = 0;
  let encrypted = 0;
  for (const name of readdirSync(vaultDir)) {
    if (!name.endsWith(".secret")) continue;
    const raw = readFileSync(join(vaultDir, name), "utf-8");
    if (isEncryptedSecretFile(raw)) encrypted++;
    else plaintext++;
  }
  return { plaintext, encrypted };
}

/** Re-export for callers handling read errors. */
export { VaultSecretError };
