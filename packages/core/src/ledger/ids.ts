/**
 * Deterministic u128 ids for TigerBeetle (ADR-001 P1).
 *
 * WHAT: map stable Attache strings (funding ids, idempotency keys) to TB ids.
 * HOW: SHA-256 of a namespaced key, take the first 16 bytes as big-endian u128.
 * WHY: retries must reuse the same transfer id so TB `exists` is idempotent.
 *      Time-based `id()` would double-post after a crash between TB and SQLite.
 *
 * Reserved: 0 and 2^128-1 are illegal in TigerBeetle; we remap those hashes.
 */
import { createHash } from "node:crypto";

const U128_MAX = (1n << 128n) - 1n;

export function attacheIdToU128(stableKey: string): bigint {
  const digest = createHash("sha256")
    .update("attache-ledger-id:")
    .update(stableKey)
    .digest();
  let n = 0n;
  for (let i = 0; i < 16; i++) {
    n = (n << 8n) | BigInt(digest[i]!);
  }
  if (n === 0n || n === U128_MAX) return 1n;
  return n;
}

/** Funding asset in the TB cluster. */
export function fundingTbId(fundingAccountId: string): bigint {
  return attacheIdToU128(`funding:${fundingAccountId}`);
}

/** Opening-balance transfer id (equity → asset). */
export function openingTbId(fundingAccountId: string): bigint {
  return attacheIdToU128(`opening:${fundingAccountId}`);
}

/** System equity / external legs are per tenant. */
export function systemTbId(tenantId: string, role: "equity" | "external"): bigint {
  return attacheIdToU128(`system:${role}:${tenantId}`);
}

/** Posted transfer id from the LedgerPort idempotency key. */
export function transferTbId(idempotencyKey: string): bigint {
  return attacheIdToU128(`xfer:${idempotencyKey}`);
}
