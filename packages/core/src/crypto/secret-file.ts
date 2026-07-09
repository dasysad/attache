import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import type { SealedBlob } from "./keyring.js";

/**
 * VS-8 secret-file envelope — AES-256-GCM encryption for vault credential files.
 *
 * WHAT: seal/open UTF-8 secrets under the same 32-byte DEK used for SQLCipher.
 * HOW: each file stores a versioned JSON envelope prefixed with a magic string so
 *      we can distinguish encrypted blobs from legacy plaintext `.secret` files.
 * WHY: ADR-004 keeps secrets outside SQLite; without this layer they stayed
 *      plaintext on disk even after VS-8 DB encryption.
 */

const GCM_NONCE_BYTES = 12;
/** Prefix every encrypted vault file so legacy plaintext is obvious on read. */
export const SECRET_ENVELOPE_PREFIX = "attache-secret-v1:";

/** On-disk envelope (after the prefix). */
export interface SecretEnvelope {
  version: 1;
  nonce: string;
  ciphertext: string;
  tag: string;
}

/** Thrown when an encrypted secret cannot be opened (missing key or tampering). */
export class VaultSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultSecretError";
  }
}

function sealBytes(key: Buffer, plaintext: Buffer): SealedBlob {
  if (key.length !== 32) {
    throw new VaultSecretError(`DEK must be 32 bytes, got ${key.length}`);
  }
  const nonce = randomBytes(GCM_NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    nonce: nonce.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

function openBytes(key: Buffer, blob: SealedBlob): Buffer {
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
    throw new VaultSecretError("Cannot decrypt secret — wrong key or corrupted file");
  }
}

/** True when `raw` is a VS-8 encrypted vault file (not legacy plaintext). */
export function isEncryptedSecretFile(raw: string): boolean {
  return raw.startsWith(SECRET_ENVELOPE_PREFIX);
}

/** Serialize a sealed secret for writing to a `.secret` file. */
export function serializeSecretFile(sealed: SealedBlob): string {
  const envelope: SecretEnvelope = { version: 1, ...sealed };
  return SECRET_ENVELOPE_PREFIX + JSON.stringify(envelope);
}

/** Parse the envelope from a file's contents. */
export function parseSecretFile(raw: string): SecretEnvelope {
  if (!isEncryptedSecretFile(raw)) {
    throw new VaultSecretError("Not an encrypted secret file");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(SECRET_ENVELOPE_PREFIX.length));
  } catch {
    throw new VaultSecretError("Malformed encrypted secret file");
  }
  const env = parsed as Partial<SecretEnvelope>;
  if (
    env.version !== 1 ||
    typeof env.nonce !== "string" ||
    typeof env.ciphertext !== "string" ||
    typeof env.tag !== "string"
  ) {
    throw new VaultSecretError("Malformed encrypted secret envelope");
  }
  return env as SecretEnvelope;
}

/** Encrypt a UTF-8 string under `dek` and return the on-disk file body. */
export function sealSecretUtf8(dek: Buffer, value: string): string {
  return serializeSecretFile(sealBytes(dek, Buffer.from(value, "utf-8")));
}

/** Decrypt a file body back to UTF-8. */
export function openSecretUtf8(dek: Buffer, raw: string): string {
  const env = parseSecretFile(raw);
  return openBytes(dek, env).toString("utf-8");
}
