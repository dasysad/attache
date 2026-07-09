import { readKeyfile, unwrapDek, type Keyfile } from "./keyring.js";

/**
 * VS-8 key provider — resolves the database DEK for `openDatabase` (ADR-011).
 *
 * WHAT: given the keyfile (or none), figure out the raw 32-byte DEK to hand to
 * SQLCipher, from whatever source is available.
 *
 * WHY an adapter: Attache is agent-first. The CLI and MCP server open the DB in
 * headless contexts where nobody can type a passphrase, so unlock must work from
 * an environment secret. Humans on a TTY get an interactive prompt. Keeping this
 * behind one resolver means call sites never branch on "how did we get the key".
 *
 * Resolution order (ADR-011 §4):
 *   1. explicit `dek` argument            (tests, embedding)
 *   2. session DEK (in-process cache)     (server /vault/unlock form)
 *   3. explicit `passphrase` argument     (programmatic unlock)
 *   4. ATTACHE_DEK env (hex)              (agents/CI caching a session key)
 *   5. ATTACHE_PASSPHRASE env             (agents/CI with the passphrase)
 *   6. `prompt()` callback                (interactive CLI; TTY only)
 *
 * If **no keyfile exists**, the DB is unencrypted and we return a null key
 * (backward compatible with pre-VS-8 plaintext databases).
 */

const DEK_HEX_LENGTH = 64; // 32 bytes

/**
 * In-process session DEK — set by the web unlock form or desktop after the user
 * enters a passphrase once. Cleared on process exit. Not written to disk.
 */
let sessionDek: Buffer | null = null;

/** Cache a derived DEK for the lifetime of this Node process (server unlock). */
export function setSessionDek(dek: Buffer | null): void {
  sessionDek = dek;
}

/** Clear a cached session DEK (tests). */
export function clearSessionDek(): void {
  sessionDek = null;
}

/** Where the resolved key came from — surfaced by `attache vault status`. */
export type KeySource =
  | "explicit-dek"
  | "session-dek"
  | "explicit-passphrase"
  | "env-dek"
  | "env-passphrase"
  | "prompt"
  | "none";

export interface ResolvedKey {
  /** Raw 32-byte SQLCipher key, or `null` when the database is unencrypted. */
  dek: Buffer | null;
  source: KeySource;
}

export interface ResolveKeyOptions {
  /** Pre-derived raw key (highest priority). */
  dek?: Buffer;
  /** Passphrase to unwrap the keyfile DEK. */
  passphrase?: string;
  /** Environment to read `ATTACHE_DEK` / `ATTACHE_PASSPHRASE` from. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Interactive resolver (CLI supplies a TTY prompt). Return `null` to abort. */
  prompt?: () => string | null;
}

/** Thrown when the DB is encrypted but no key source could supply a passphrase/DEK. */
export class DatabaseLockedError extends Error {
  constructor(
    message = "Database is encrypted but no key was provided. Set ATTACHE_PASSPHRASE or run `attache vault status`.",
  ) {
    super(message);
    this.name = "DatabaseLockedError";
  }
}

function parseHexDek(hex: string): Buffer {
  const trimmed = hex.trim();
  if (trimmed.length !== DEK_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(trimmed)) {
    throw new DatabaseLockedError(
      "ATTACHE_DEK must be 64 hex characters (32 bytes)",
    );
  }
  return Buffer.from(trimmed, "hex");
}

/**
 * Resolve the DEK for a given keyfile. Pure function over its inputs (env and
 * prompt are injected) so it is fully testable without touching `process.env`.
 */
export function resolveKey(
  keyfile: Keyfile | null,
  opts: ResolveKeyOptions = {},
): ResolvedKey {
  const env = opts.env ?? process.env;

  // 1. explicit DEK wins, regardless of keyfile presence.
  if (opts.dek) {
    if (opts.dek.length !== 32) {
      throw new DatabaseLockedError("Explicit DEK must be exactly 32 bytes");
    }
    return { dek: opts.dek, source: "explicit-dek" };
  }

  // 2. session DEK from an earlier unlock in this process (web UI).
  if (sessionDek) {
    return { dek: sessionDek, source: "session-dek" };
  }

  // No keyfile ⇒ unencrypted database (pre-VS-8 compatibility).
  if (!keyfile) {
    return { dek: null, source: "none" };
  }

  // 3. explicit passphrase.
  if (opts.passphrase !== undefined) {
    return { dek: unwrapDek(keyfile, opts.passphrase), source: "explicit-passphrase" };
  }

  // 4. cached raw DEK from env (skips scrypt — for agents doing many calls).
  const envDek = env.ATTACHE_DEK?.trim();
  if (envDek) {
    return { dek: parseHexDek(envDek), source: "env-dek" };
  }

  // 5. passphrase from env.
  const envPass = env.ATTACHE_PASSPHRASE;
  if (envPass) {
    return { dek: unwrapDek(keyfile, envPass), source: "env-passphrase" };
  }

  // 6. interactive prompt (CLI on a TTY).
  if (opts.prompt) {
    const entered = opts.prompt();
    if (entered) {
      return { dek: unwrapDek(keyfile, entered), source: "prompt" };
    }
  }

  throw new DatabaseLockedError();
}

/**
 * Convenience: read the keyfile at `dataDir` and resolve the key in one call.
 * This is what `openDatabase` uses.
 */
export function resolveKeyForDir(
  dataDir: string,
  opts: ResolveKeyOptions = {},
): ResolvedKey {
  return resolveKey(readKeyfile(dataDir), opts);
}
