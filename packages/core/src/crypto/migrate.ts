import { copyFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { hasKeyfile, KeyfileError } from "./keyring.js";

/**
 * VS-8 migration — convert an existing plaintext database to encrypted
 * (ADR-011). Kept in core (not the CLI) so it is unit-testable.
 *
 * HOW: SQLite3MultipleCiphers encrypts a plaintext database in place via
 * `PRAGMA rekey`. We first copy the plaintext file to
 * `attache.db.plaintext.bak` so a botched migration is recoverable, then rekey
 * the live file with the raw DEK.
 *
 * WHY rekey-in-place (vs. `sqlcipher_export` into an attached db): this fork
 * exposes sqlite3mc's `rekey`, not SQLCipher's `sqlcipher_export` convenience
 * function. Rekey is the supported path here; the explicit `.bak` copy gives us
 * the same recoverability an export+swap would.
 */

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

/** Name of the on-disk database file within a data directory. */
export const DB_FILENAME = "attache.db";

/**
 * Encrypt the plaintext `attache.db` in `dataDir` using raw key `dek`.
 *
 * Preconditions (throws `MigrationError` otherwise):
 *   - a keyfile must NOT already exist (that means it's already encrypted)
 *   - a plaintext `attache.db` must exist to migrate
 *
 * The caller is responsible for writing the keyfile **after** this returns
 * successfully, so a failed export never leaves an orphaned keyfile.
 */
export function encryptPlaintextDatabase(dataDir: string, dek: Buffer): void {
  if (dek.length !== 32) {
    throw new MigrationError(`DEK must be 32 bytes, got ${dek.length}`);
  }
  if (hasKeyfile(dataDir)) {
    throw new KeyfileError("A keyfile already exists — database is already encrypted");
  }

  const dbPath = join(dataDir, DB_FILENAME);
  if (!existsSync(dbPath)) {
    throw new MigrationError(`No plaintext database at ${dbPath}`);
  }

  const backupPath = join(dataDir, `${DB_FILENAME}.plaintext.bak`);
  // Snapshot the plaintext DB before mutating it, so a failure is recoverable.
  copyFileSync(dbPath, backupPath);

  const keyHex = dek.toString("hex");
  const db = new Database(dbPath);
  try {
    db.pragma("cipher='sqlcipher'");
    // rekey encrypts the currently-plaintext pages in place with the raw key.
    db.pragma(`rekey="x'${keyHex}'"`);
  } catch (err) {
    // Restore the plaintext file from backup on failure.
    db.close();
    copyFileSync(backupPath, dbPath);
    rmSync(backupPath, { force: true });
    throw new MigrationError(
      `Encryption failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  db.close();
}
