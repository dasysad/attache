# ADR-011: Encryption at rest — SQLCipher-compatible DB + passphrase KDF

Area: security / storage

- **Status:** accepted
- **Date:** 2026-07-02
- **Deciders:** founder
- **Related:** VS-0.1 / VS-8 (PRD), ADR-004 (vault refs live outside SQLite),
  ADR-009 (standalone first), [v1 hardening roadmap](../plans/v1-hardening-roadmap.md)

## Context

Attache stores household finances — balances, obligations, bank transactions —
plus **secrets** (Plaid item creds, Gmail/IMAP OAuth refs) in a local SQLite DB
at `~/.attache/data/attache.db` and a file vault at `~/.attache/vault/`. Both
are currently **plaintext on disk**. For a local-first finance app this is the
single largest trust gap (see v1 hardening roadmap).

Constraints that shape the decision:

1. **Agent-first (project rule).** The CLI and MCP server open the DB in
   headless contexts. An agent cannot type a passphrase interactively, so unlock
   must work from an environment secret or OS keychain, not only a TTY prompt.
2. **Adapter pattern (project rule).** Key acquisition must be swappable
   (env, keychain, prompt, future WorkOS/passkey) without touching call sites.
3. **Minimal native surface.** We already ship `better-sqlite3` as a per-arch
   native module inside the Tauri DMG. Adding heavy native crypto deps
   multiplies build/signing risk.
4. **Backward compatibility.** Existing dogfood DBs are plaintext; we must
   migrate, not strand, them.

## Decision

### 1. Database cipher: `better-sqlite3-multiple-ciphers`

Replace `better-sqlite3` in `@attache/core` with
[`better-sqlite3-multiple-ciphers`](https://github.com/m4heshd/better-sqlite3-multiple-ciphers)
— a drop-in fork with the **identical API** plus SQLCipher-compatible encryption
via `PRAGMA key`. Rationale vs alternatives:

- **vs. compiling `better-sqlite3` against SQLCipher:** brittle, custom toolchain
  per arch, hard to reproduce in CI. Rejected.
- **vs. app-layer field encryption:** loses SQL query ability, huge blast radius,
  easy to get wrong. Rejected.
- **vs. `@journeyapps/sqlcipher`:** node-sqlite3 (callback) API, not the
  synchronous better-sqlite3 API our whole core is built on. Rejected.

We open with SQLCipher-compatible cipher (`PRAGMA cipher='sqlcipher'`) so the
on-disk format is a known standard.

### 2. Key derivation: scrypt (Node built-in)

Derive the 256-bit Data Encryption Key (DEK) from the user passphrase with
**`crypto.scrypt`** (memory-hard, built into Node — **zero extra dependency**).
Parameters: `N=2^15, r=8, p=1, keylen=32` (tunable, stored in the keyfile).

- Argon2id is theoretically preferable but requires a native/wasm dependency;
  scrypt-in-Node is a strong, dependency-free choice. **Argon2id is a documented
  future upgrade** (keyfile records `kdf` so we can migrate params).

### 3. Envelope encryption: random DEK wrapped by passphrase-derived KEK

We use a two-key envelope, not a passphrase-derived DB key directly:

- **DEK** (Data Encryption Key): a random 256-bit key generated once at init.
  This is the actual SQLCipher `PRAGMA key`. **It never changes** for the life
  of the DB.
- **KEK** (Key Encryption Key): `scrypt(passphrase, salt)`.
- The keyfile stores the DEK **wrapped** (AES-256-GCM encrypted) under the KEK.

`~/.attache/data/keyfile.json` (plaintext file, but reveals nothing):

```jsonc
{
  "version": 1,
  "kdf": "scrypt",
  "params": { "N": 32768, "r": 8, "p": 1, "keylen": 32 },
  "salt": "<hex 16B>",
  "wrappedDek": { "nonce": "<hex 12B>", "ciphertext": "<hex 32B>", "tag": "<hex 16B>" }
}
```

Unlock: derive KEK → AES-GCM-decrypt `wrappedDek` → DEK. A wrong passphrase makes
the **GCM auth tag fail**, which we surface as `WrongPassphraseError` (no separate
verifier needed, and it distinguishes wrong-passphrase from corrupt-DB).

**Why envelope over deriving the DB key from the passphrase directly:** changing
the passphrase only re-wraps the same DEK with a new KEK — **no full-database
rekey** required. It also lets future unlock methods (passkey, keychain, a second
household member) each wrap the same DEK independently.

The derived key is **never written to disk**; only the wrapped DEK is.

### 4. Agent-first unlock: `KeyProvider` adapter

A `KeyProvider` resolves the raw DEK in priority order:

| Priority | Source | Use case |
|----------|--------|----------|
| 1 | explicit `key` argument | tests, embedding |
| 2 | `ATTACHE_DEK` (hex) env | agents/CI caching a session key |
| 3 | `ATTACHE_PASSPHRASE` env + keyfile salt | agents/CI with passphrase |
| 4 | OS keychain (macOS `security`) | **future** — desktop convenience |
| 5 | interactive TTY prompt | humans on the CLI |

`openDatabase()` asks the provider for a key and applies `PRAGMA key`. If **no
keyfile exists**, the DB opens **unencrypted** (backward compatible) — encryption
is opt-in via `attache vault init` until the migration flips the default.

### 5. Vault files

The file vault (`~/.attache/vault/*.secret`) is encrypted with the same DEK
(AES-256-GCM per file). Keeps ADR-004's "secrets outside SQLite" while removing
the plaintext-on-disk weakness.

## Consequences

- **Native rebuild:** desktop bundle + CI must rebuild
  `better-sqlite3-multiple-ciphers` per arch; add to `allowBuilds`. `prepare-bundle`
  unchanged (deploy already pulls the built module).
- **Migration:** `attache vault encrypt` converts an existing plaintext DB
  (`sqlcipher_export` into a keyed attach, then swap). One-time, reversible via
  backup.
- **Lost passphrase = lost data** (by design). Documented; optional ZK cloud
  backup (BL-9) is the recovery story, not a backdoor.
- **Performance:** SQLCipher adds per-page AES; negligible for our data sizes.
- **Not covered:** memory-scraping / DEK-in-RAM while unlocked (out of scope for
  local-first threat model), and full-disk encryption (OS responsibility).

## Threat model (in scope)

Protects against: lost/stolen device with disk at rest, casual file copy,
backup leakage. Does **not** protect against: malware running as the user while
the app is unlocked, or a compromised passphrase.

## References

- [VS-8 plan](../plans/vs-8-encryption-at-rest.md)
- [v1 hardening roadmap](../plans/v1-hardening-roadmap.md)
- ADR-004 (ingestion/vault), ADR-009 (standalone first)
