import { existsSync } from "node:fs";
import { join } from "node:path";
import { defaultDataDir, defaultVaultDir } from "../db.js";
import { readKeyfile, type ScryptParams } from "./keyring.js";
import { DB_FILENAME } from "./migrate.js";
import { countSecretFiles } from "../vault/migrate-secrets.js";

/**
 * VS-8 vault status (ADR-011) — a structured, testable snapshot of the local
 * encryption state, surfaced by `attache vault status`. Pure read; never
 * unlocks or mutates anything.
 */
export interface VaultStatus {
  /** True when a keyfile exists ⇒ the database is (or should be) encrypted. */
  encrypted: boolean;
  /** KDF + params from the keyfile, when encrypted. */
  kdf?: "scrypt";
  params?: ScryptParams;
  /** True when `attache.db` exists on disk. */
  databaseExists: boolean;
  /** True when a pre-encryption plaintext backup is present. */
  plaintextBackupExists: boolean;
  /** Plaintext `.secret` files still in the credential vault (need migration). */
  plaintextSecretCount: number;
  /** Encrypted `.secret` files in the credential vault. */
  encryptedSecretCount: number;
  /** Absolute data directory inspected. */
  dataDir: string;
  /** Credential vault directory inspected. */
  vaultDir: string;
}

export function vaultStatus(
  dataDir: string = defaultDataDir(),
  vaultDir: string = defaultVaultDir(),
): VaultStatus {
  const keyfile = safeReadKeyfile(dataDir);
  const secrets = countSecretFiles(vaultDir);
  return {
    encrypted: keyfile !== null,
    kdf: keyfile?.kdf,
    params: keyfile?.params,
    databaseExists: existsSync(join(dataDir, DB_FILENAME)),
    plaintextBackupExists: existsSync(join(dataDir, `${DB_FILENAME}.plaintext.bak`)),
    plaintextSecretCount: secrets.plaintext,
    encryptedSecretCount: secrets.encrypted,
    dataDir,
    vaultDir,
  };
}

/** Treat a malformed keyfile as "not encrypted" for status reporting. */
function safeReadKeyfile(dataDir: string) {
  try {
    return readKeyfile(dataDir);
  } catch {
    return null;
  }
}
