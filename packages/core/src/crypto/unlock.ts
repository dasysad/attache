import { defaultDataDir } from "../db.js";
import {
  DatabaseLockedError,
  resolveKeyForDir,
  setSessionDek,
} from "./key-provider.js";
import { hasKeyfile, readKeyfile, unwrapDek, WrongPassphraseError } from "./keyring.js";

/**
 * VS-8 unlock helpers — detect locked state and unlock for long-lived processes
 * (web server, desktop sidecar) without requiring env vars after first prompt.
 *
 * WHAT: `isDatabaseUnlocked` probes whether `openDatabase` would succeed right
 * now; `unlockDatabaseWithPassphrase` verifies a passphrase and caches the DEK
 * in-process for subsequent opens (server session unlock).
 *
 * WHY separate from KeyProvider: surfaces (server UI, MCP startup, desktop)
 * need friendly messaging and one-shot unlock without threading opts through
 * every call site.
 */

/** True when there is no keyfile, or a key source (env / session / prompt) resolves. */
export function isDatabaseUnlocked(dataDir: string = defaultDataDir()): boolean {
  if (!hasKeyfile(dataDir)) return true;
  try {
    resolveKeyForDir(dataDir);
    return true;
  } catch (e) {
    if (e instanceof DatabaseLockedError || e instanceof WrongPassphraseError) {
      return false;
    }
    throw e;
  }
}

/**
 * Fail fast for headless entry points (MCP). Throws `DatabaseLockedError` when
 * no key is available, or `WrongPassphraseError` when env passphrase is wrong.
 */
export function assertDatabaseUnlocked(dataDir: string = defaultDataDir()): void {
  if (!hasKeyfile(dataDir)) return;
  resolveKeyForDir(dataDir);
}

/** Agent/human guidance printed when the database cannot be opened. */
export function databaseLockedHelp(): string {
  return `Attache database is encrypted and locked.

Agents/CI:
  export ATTACHE_PASSPHRASE='your-passphrase'
  # or cache the derived key for the session:
  export ATTACHE_DEK=<64 hex chars>

Humans:
  Web:     open /vault/unlock in the Attache UI
  CLI:     set ATTACHE_PASSPHRASE or enter passphrase when prompted

Lost passphrase = lost data. There is no recovery backdoor.`;
}

/**
 * Verify `passphrase` against the keyfile and cache the DEK for this process.
 * Used by the server unlock form and tests.
 */
export function unlockDatabaseWithPassphrase(
  passphrase: string,
  dataDir: string = defaultDataDir(),
): void {
  const keyfile = readKeyfile(dataDir);
  if (!keyfile) return;
  const dek = unwrapDek(keyfile, passphrase);
  setSessionDek(dek);
}
