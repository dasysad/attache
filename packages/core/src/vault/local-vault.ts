import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseLockedError } from "../crypto/key-provider.js";
import {
  isEncryptedSecretFile,
  openSecretUtf8,
  sealSecretUtf8,
  VaultSecretError,
} from "../crypto/secret-file.js";
import { hasKeyfile } from "../crypto/keyring.js";
import { resolveKeyForDir } from "../crypto/key-provider.js";
import { defaultDataDir, defaultVaultDir } from "../db.js";

/**
 * Local credential vault — VS-3 dev stand-in for @celestial/vault.
 *
 * VS-8: when a database keyfile exists and a DEK is available, each `.secret`
 * file is AES-256-GCM encrypted under the same DEK as SQLCipher (ADR-011).
 * Legacy plaintext files are still readable until migrated via
 * `attache vault encrypt`.
 *
 * `dekOverride`:
 *   - `undefined` (default) — auto-resolve from keyfile + KeyProvider
 *   - `null` — force plaintext (tests)
 *   - `Buffer` — use this DEK explicitly
 */
export interface VaultPort {
  set(ref: string, value: string): void;
  get(ref: string): string | null;
  delete(ref: string): void;
}

export class LocalVaultPort implements VaultPort {
  constructor(
    private readonly rootDir = defaultVaultDir(),
    /** See class docstring. Pass `null` in tests to keep secrets plaintext. */
    private readonly dekOverride?: Buffer | null,
    /** Data dir for keyfile lookup when auto-resolving the DEK. */
    private readonly dataDir = defaultDataDir(),
  ) {
    mkdirSync(rootDir, { recursive: true, mode: 0o700 });
  }

  private path(ref: string): string {
    const safe = ref.replace(/[^a-zA-Z0-9/_-]/g, "_");
    return join(this.rootDir, `${safe}.secret`);
  }

  /**
   * Resolve the DEK for this vault. Returns `null` when operating in plaintext
   * mode (no keyfile, forced plaintext, or tests).
   */
  private getDek(): Buffer | null {
    if (this.dekOverride !== undefined) {
      return this.dekOverride;
    }
    if (!hasKeyfile(this.dataDir)) {
      return null;
    }
    try {
      return resolveKeyForDir(this.dataDir).dek;
    } catch (e) {
      if (e instanceof DatabaseLockedError) {
        throw new VaultSecretError(
          "Cannot access encrypted secrets while the vault is locked. Set ATTACHE_PASSPHRASE or unlock the database first.",
        );
      }
      throw e;
    }
  }

  set(ref: string, value: string): void {
    const p = this.path(ref);
    mkdirSync(join(p, ".."), { recursive: true, mode: 0o700 });
    const dek = this.getDek();
    const body = dek ? sealSecretUtf8(dek, value) : value;
    writeFileSync(p, body, { encoding: "utf-8", mode: 0o600 });
  }

  get(ref: string): string | null {
    const p = this.path(ref);
    let raw: string;
    try {
      raw = readFileSync(p, "utf-8");
    } catch {
      return null;
    }
    if (isEncryptedSecretFile(raw)) {
      const dek = this.getDek();
      if (!dek) {
        throw new VaultSecretError(
          "Secret file is encrypted but no unlock key is available",
        );
      }
      return openSecretUtf8(dek, raw);
    }
    // Legacy plaintext file (pre-VS-8 or test vault with dekOverride=null).
    return raw;
  }

  delete(ref: string): void {
    try {
      unlinkSync(this.path(ref));
    } catch {
      /* missing ok */
    }
  }
}

/** Default singleton for CLI and server. */
let defaultVault: VaultPort | null = null;

export function getVault(): VaultPort {
  if (!defaultVault) defaultVault = new LocalVaultPort();
  return defaultVault;
}

export function setVaultForTests(vault: VaultPort | null): void {
  defaultVault = vault;
}

export { VaultSecretError };
