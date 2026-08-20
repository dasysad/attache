# Attache v1 hardening roadmap

**Status:** active  
**Context:** VS-0 through VS-7 shipped a dogfood-ready, distributable, agent-first
app (forecast, obligations, ingestion, MCP/CLI, notifications, desktop DMG +
Homebrew). This roadmap sequences the work that turns that prototype into a
product a household would **trust with real money data**.

See the whole-product assessment that motivated this in the chat history; the
short version: the differentiating work is done, what remains is
**trust-and-truth infrastructure**.

## Sequence (highest leverage first)

| # | Slice | Status |
|---|-------|--------|
| 1 | **VS-8 — Encryption at rest** ([plan](./vs-8-encryption-at-rest.md), [ADR-011](../adr/011-encryption-at-rest.md)) | ✅ Shipped — DB, credential vault, CLI, server/MCP/desktop unlock |
| 2 | **LedgerPort P0** — fake adapter + double-entry model ([plan](./ledger-port-p0.md)) | ✅ Shipped — SQLite journal, projection sync, transfer rewire |
| 3 | **Plaid production path + ingestion eval** ([plan](./plaid-production-ingestion-eval.md)) | ✅ Shipped — live adapter, CLI connect, eval harness |
| 4 | **Packaging polish** — notarize, Intel DMG, auto-update ([plan](./vs-4-packaging-polish.md), [ADR-012](../adr/012-desktop-signing-and-updates.md)) | ✅ Shipped |

Slices 1–3 are **correctness/security**; slice 4 is **adoption**. Do them in
order — there's no point notarizing an app that stores plaintext finances.

## Slice 1 — VS-8 encryption at rest (in progress)

**Goal:** SQLite database and credential vault are encrypted with a key derived
from a user passphrase, unlockable headlessly by agents.

Key decisions (ADR-011):

- **Cipher:** `better-sqlite3-multiple-ciphers` (drop-in for `better-sqlite3`,
  SQLCipher-compatible `PRAGMA key`).
- **KDF:** scrypt (built into Node — zero extra native dep). Argon2id noted as
  future upgrade.
- **Agent-first unlock:** `KeyProvider` adapter resolves the key from (in order)
  explicit arg → `ATTACHE_DEK` (hex) → `ATTACHE_PASSPHRASE` → OS keychain
  (future) → interactive prompt (CLI only). Agents set an env var; humans type.
- **No key stored:** keyfile holds salt + KDF params + an encrypted verifier,
  never the derived key.

Deliverables: crypto keyring module, DB wiring, `attache vault` CLI
(init/status/encrypt/change-passphrase), plaintext→encrypted migration, tests
with negative-space assertions, docs.

## Slice 2 — LedgerPort P0 (next)

- Define `LedgerPort` interface (ADR-001): `postTransfer`, `getBalance`,
  `getAccountHistory`.
- **Fake in-memory + SQLite-backed adapter** with double-entry records; TigerBeetle
  opt-in via `ATTACHE_LEDGER=tigerbeetle` (BL-11, [plan](./vs-tigerbeetle-ledger.md)).
- Rewire transfer approval to post through `LedgerPort` instead of tweaking
  `balance_usd`; keep a projection for fast reads.
- Tests: balanced entries, insufficient funds, idempotency.

## Slice 3 — Plaid production + ingestion eval (shipped)

- Production Plaid keys behind env; `LivePlaidAdapter`, typed errors, item error state.
- CLI: `attache plaid link-token`, `connect --public-token`, `ingest eval`.
- Extraction eval harness: fixture bills → precision/recall report ([plan](./plaid-production-ingestion-eval.md)).

## Slice 4 — Packaging polish (shipped)

- Developer ID signing + notarization when CI secrets set; ad-hoc fallback.
- Dual-arch DMG matrix (arm64 + x86_64) + dual-arch Homebrew Cask bump.
- Tauri updater: signed `.tar.gz`, `latest.json`, startup check ([plan](./vs-4-packaging-polish.md)).

## Out of scope (still backlog)

Mesh (BL-1–4), merge wizard, premium billing gate, Android reader,
autonomous ACH rules (HITL ACH is BL-12 P0).
See [backlog](../backlog.md).
