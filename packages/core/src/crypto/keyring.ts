import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defaultDataDir } from "../db.js";

/**
 * VS-8 keyring — encryption-at-rest key management (ADR-011).
 *
 * WHAT: derives an encryption key from a user passphrase and manages a keyfile
 * that lets us open the SQLCipher database and encrypt the file vault.
 *
 * HOW (envelope encryption):
 *   - A random 256-bit **DEK** (Data Encryption Key) is generated once at init.
 *     The DEK is the actual SQLCipher `PRAGMA key`; it never changes.
 *   - A **KEK** (Key Encryption Key) is derived from the passphrase via scrypt.
 *   - The keyfile stores the DEK **wrapped** (AES-256-GCM) under the KEK, plus
 *     the scrypt salt + params. The DEK itself is never written to disk.
 *
 * WHY envelope, not passphrase→DB-key directly: changing the passphrase only
 * re-wraps the same DEK (no full-DB rekey), and multiple unlock methods
 * (passkey, keychain, second member) can each wrap the same DEK independently.
 *
 * Uses Node's built-in `crypto.scrypt` (memory-hard) so we add **zero** native
 * dependencies for the KDF. Argon2id is a documented future upgrade; the keyfile
 * records `kdf` + `params` so we can migrate.
 */

/** scrypt cost parameters. N must be a power of two. */
export interface ScryptParams {
  N: number;
  r: number;
  p: number;
  keylen: number;
}

/**
 * Defaults: N=2^15 (~32 MiB), r=8, p=1. Balances brute-force resistance against
 * unlock latency on a laptop (~100ms). Stored per-keyfile so we can raise later.
 */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = {
  N: 32768,
  r: 8,
  p: 1,
  keylen: 32,
};

/** AES-256 needs a 32-byte key; GCM uses a 12-byte nonce and 16-byte tag. */
const DEK_BYTES = 32;
const SALT_BYTES = 16;
const GCM_NONCE_BYTES = 12;

/** An AES-256-GCM sealed blob, hex-encoded for JSON storage. */
export interface SealedBlob {
  nonce: string;
  ciphertext: string;
  tag: string;
}

/** On-disk keyfile shape (`~/.attache/data/keyfile.json`). Reveals nothing secret. */
export interface Keyfile {
  version: 1;
  kdf: "scrypt";
  params: ScryptParams;
  salt: string;
  /** The random DEK, AES-256-GCM encrypted under the passphrase-derived KEK. */
  wrappedDek: SealedBlob;
}

/** Thrown when the passphrase cannot unwrap the DEK (wrong passphrase or tampering). */
export class WrongPassphraseError extends Error {
  constructor(message = "Incorrect passphrase or corrupted keyfile") {
    super(message);
    this.name = "WrongPassphraseError";
  }
}

/** Thrown when the keyfile exists but is malformed. */
export class KeyfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyfileError";
  }
}

/** Absolute path to the keyfile for a given data directory. */
export function keyfilePath(dataDir: string = defaultDataDir()): string {
  return join(dataDir, "keyfile.json");
}

/**
 * Derive the KEK from a passphrase + salt via scrypt.
 *
 * scryptSync throws if memory exceeds the default `maxmem` (32 MiB) for larger
 * N, so we set maxmem generously (256 MiB) to allow tuning params upward.
 */
export function deriveKek(
  passphrase: string,
  saltHex: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Buffer {
  if (passphrase.length === 0) {
    throw new WrongPassphraseError("Passphrase must not be empty");
  }
  const salt = Buffer.from(saltHex, "hex");
  return scryptSync(passphrase, salt, params.keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 256 * 1024 * 1024,
  });
}

/** Seal `plaintext` under `key` with AES-256-GCM and a fresh random nonce. */
function seal(key: Buffer, plaintext: Buffer): SealedBlob {
  const nonce = randomBytes(GCM_NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    nonce: nonce.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
    tag: tag.toString("hex"),
  };
}

/**
 * Open a sealed blob under `key`. Throws `WrongPassphraseError` if the GCM auth
 * tag does not verify (wrong key or tampered ciphertext) — we deliberately do
 * not leak which.
 */
function open(key: Buffer, blob: SealedBlob): Buffer {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(blob.nonce, "hex"),
    );
    decipher.setAuthTag(Buffer.from(blob.tag, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(blob.ciphertext, "hex")),
      decipher.final(),
    ]);
  } catch {
    throw new WrongPassphraseError();
  }
}

/**
 * Create a brand-new keyfile for `passphrase`: generate a random DEK, derive the
 * KEK, and store the wrapped DEK. Returns both the keyfile and the raw DEK so the
 * caller can immediately key a database without a second scrypt pass.
 */
export function createKeyfile(
  passphrase: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): { keyfile: Keyfile; dek: Buffer } {
  if (passphrase.length === 0) {
    throw new WrongPassphraseError("Passphrase must not be empty");
  }
  const dek = randomBytes(DEK_BYTES);
  const saltHex = randomBytes(SALT_BYTES).toString("hex");
  const kek = deriveKek(passphrase, saltHex, params);
  const keyfile: Keyfile = {
    version: 1,
    kdf: "scrypt",
    params,
    salt: saltHex,
    wrappedDek: seal(kek, dek),
  };
  return { keyfile, dek };
}

/**
 * Unwrap the DEK from `keyfile` using `passphrase`. Throws `WrongPassphraseError`
 * on an incorrect passphrase. This is the core "unlock" primitive.
 */
export function unwrapDek(keyfile: Keyfile, passphrase: string): Buffer {
  const kek = deriveKek(passphrase, keyfile.salt, keyfile.params);
  const dek = open(kek, keyfile.wrappedDek);
  if (dek.length !== DEK_BYTES) {
    throw new WrongPassphraseError("Unwrapped key has unexpected length");
  }
  return dek;
}

/**
 * Produce a new keyfile that wraps the SAME DEK under a new passphrase. Used by
 * `attache vault change-passphrase` — no database rekey needed because the DEK
 * is unchanged.
 */
export function rewrapDek(
  dek: Buffer,
  newPassphrase: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Keyfile {
  if (dek.length !== DEK_BYTES) {
    throw new KeyfileError(`DEK must be ${DEK_BYTES} bytes, got ${dek.length}`);
  }
  if (newPassphrase.length === 0) {
    throw new WrongPassphraseError("Passphrase must not be empty");
  }
  const saltHex = randomBytes(SALT_BYTES).toString("hex");
  const kek = deriveKek(newPassphrase, saltHex, params);
  return {
    version: 1,
    kdf: "scrypt",
    params,
    salt: saltHex,
    wrappedDek: seal(kek, dek),
  };
}

/** Validate an untrusted object as a Keyfile, throwing `KeyfileError` if not. */
function assertKeyfile(value: unknown): asserts value is Keyfile {
  const k = value as Partial<Keyfile>;
  if (
    !k ||
    k.version !== 1 ||
    k.kdf !== "scrypt" ||
    typeof k.salt !== "string" ||
    !k.params ||
    typeof k.params.N !== "number" ||
    typeof k.params.r !== "number" ||
    typeof k.params.p !== "number" ||
    typeof k.params.keylen !== "number" ||
    !k.wrappedDek ||
    typeof k.wrappedDek.nonce !== "string" ||
    typeof k.wrappedDek.ciphertext !== "string" ||
    typeof k.wrappedDek.tag !== "string"
  ) {
    throw new KeyfileError("Malformed keyfile");
  }
}

/** Read + validate the keyfile. Returns `null` if none exists (unencrypted DB). */
export function readKeyfile(dataDir: string = defaultDataDir()): Keyfile | null {
  let raw: string;
  try {
    raw = readFileSync(keyfilePath(dataDir), "utf-8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new KeyfileError("Keyfile is not valid JSON");
  }
  assertKeyfile(parsed);
  return parsed;
}

/** Write the keyfile with restrictive permissions (dir 700, file 600). */
export function writeKeyfile(
  keyfile: Keyfile,
  dataDir: string = defaultDataDir(),
): void {
  const path = keyfilePath(dataDir);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(keyfile, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
}

/** True if an encryption keyfile is present (i.e. the DB should be encrypted). */
export function hasKeyfile(dataDir: string = defaultDataDir()): boolean {
  return readKeyfileSafe(dataDir) !== null;
}

/** Like `readKeyfile` but returns `null` instead of throwing on malformed files. */
function readKeyfileSafe(dataDir: string): Keyfile | null {
  try {
    return readKeyfile(dataDir);
  } catch {
    return null;
  }
}
