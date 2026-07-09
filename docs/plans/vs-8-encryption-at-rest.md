# VS-8 — Encryption at rest

**Status:** complete (Phases A–D + file vault)  
**ADR:** [011](../adr/011-encryption-at-rest.md)  
**Roadmap:** [v1 hardening](./v1-hardening-roadmap.md) slice 1

## Goal

The local SQLite DB and credential vault are encrypted with a key derived from a
user passphrase. Agents unlock headlessly via env/keychain; humans via prompt.
No plaintext finances on disk.

**Done when:** a fresh install runs `attache vault init`, sets a passphrase, and
every subsequent `attache`/server/MCP invocation opens the encrypted DB via a
`KeyProvider`; an existing plaintext DB migrates with `attache vault encrypt`.

## Phases

### Phase A — crypto keyring (foundation) ✅

| Item | Status |
|------|--------|
| `crypto/keyring.ts` — scrypt KDF, wrapped-DEK envelope, keyfile read/write | ✅ |
| `crypto/key-provider.ts` — `KeyProvider` adapter (env/passphrase/prompt) | ✅ |
| Tests incl. negative space (wrong passphrase, missing keyfile, tampered wrap) | ✅ 30 tests |

### Phase B — DB + vault wiring

| Item | Status |
|------|--------|
| Swap `better-sqlite3` → `better-sqlite3-multiple-ciphers` (pnpm alias) | ✅ |
| `openDatabase(dataDir, keyOpts?)` applies `PRAGMA cipher/key` | ✅ |
| `allowBuilds` / `onlyBuiltDependencies` for new native module | ✅ |
| Encrypt file vault (`LocalVaultPort`) with same DEK | ✅ |

### Phase C — CLI + migration ✅

| Item | Status |
|------|--------|
| `attache vault init` — set passphrase, create keyfile, encrypt empty DB | ✅ |
| `attache vault status` — encrypted? kdf/params? backup? | ✅ |
| `attache vault encrypt` — migrate plaintext DB → encrypted (in-place rekey + `.bak`) | ✅ |
| `attache vault change-passphrase` — re-wrap DEK (no DB rekey) | ✅ |
| `encryptPlaintextDatabase` + `vaultStatus` in core with tests | ✅ 9 tests |

### Phase D — surfaces + docs ✅

| Item | Status |
|------|--------|
| Server `/vault/unlock` + middleware gate; `/health` for desktop poll | ✅ |
| Session DEK cache (unlock once per server process) | ✅ |
| MCP startup guard + tool errors when locked | ✅ |
| CLI interactive passphrase on TTY when encrypted | ✅ |
| Desktop macOS osascript prompt before sidecar spawn | ✅ |
| `ATTACHE_DATA_DIR` override for tests/agents | ✅ |
| Docs: unlock UX, agent env vars, recovery caveat | ✅ |

## Unlock resolution order (KeyProvider)

`explicit arg → ATTACHE_DEK (hex) → ATTACHE_PASSPHRASE → OS keychain (future) →
TTY prompt`. Backward compat: **no keyfile ⇒ open plaintext** until migration
flips the default.

## Agent-first notes

- Agents export `ATTACHE_PASSPHRASE` (or a cached `ATTACHE_DEK`) before invoking
  `attache …` or the MCP server; no interactive step.
- MCP server refuses to start with a clear error if the DB is encrypted and no
  key source is available, rather than silently creating a new plaintext DB.

## Test matrix (negative space required)

- KDF determinism: same passphrase+salt ⇒ same DEK; different salt ⇒ different.
- Verifier: correct passphrase decrypts; wrong passphrase throws
  `WrongPassphraseError`; tampered ciphertext/tag throws.
- Keyfile: missing ⇒ `null`; malformed JSON ⇒ typed error.
- KeyProvider precedence: DEK env beats passphrase env; neither ⇒ prompt/locked.
- DB: opened with key reads back rows; opened with wrong key throws; plaintext DB
  with no keyfile still opens.

## Non-goals (this slice)

- Argon2id (future param migration), passkey/WorkOS unlock, ZK cloud backup
  (BL-9), protecting DEK-in-RAM while unlocked.
