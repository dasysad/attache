# Attache — agent guide

## Strategy: standalone prototype first (ADR-009)

Mesh is **backlog** — see [docs/backlog.md](docs/backlog.md).

## Current sprint: VS-7 packaging (ADR-010)

Release via **Starflow** → **GitHub Actions** (macOS DMG) → **Homebrew tap**.

| Doc | Purpose |
|-----|---------|
| [vs-7-standalone-packaging.md](docs/plans/vs-7-standalone-packaging.md) | Phases + checklist |
| [ADR-010](docs/adr/010-release-pipeline-starflow.md) | Decision |
| [homebrew-tap-template.md](docs/specs/homebrew-tap-template.md) | Tap repo starter |

Tap: [celestial-intelligence-agency/homebrew-tap](https://github.com/celestial-intelligence-agency/homebrew-tap) — set `HOMEBREW_TAP_TOKEN` on this repo for auto-bump PRs.

```bash
# Release desktop DMG:
sf run release-attache-desktop --input version=desktop-v0.1.0

# End user:
brew tap celestial-intelligence-agency/tap
brew install attache-cli          # CLI
brew install --cask attache         # desktop (arm64 + Intel)
```

**Not shipped to users:** Starsystem (`ss`), mesh, Celestial monorepo.

## Encryption at rest (VS-8 / ADR-011)

DB + vault encrypt with a passphrase-derived key. Agents unlock via env, humans
via prompt. **No keyfile ⇒ plaintext** (backward compatible). Credential files
(`~/.attache/vault/*.secret`) use the same DEK when encrypted.

```bash
attache vault init              # fresh encrypted vault (prompts / ATTACHE_PASSPHRASE)
attache vault encrypt           # migrate an existing plaintext DB (leaves .bak)
attache vault status            # kdf, params, db + backup presence
attache vault change-passphrase # re-wrap key, no DB rekey

# Agents/CI unlock headlessly:
export ATTACHE_PASSPHRASE=…      # or ATTACHE_DEK=<64 hex> for a cached session key

# Web/desktop: server serves /vault/unlock when locked; desktop polls /health
# Override data dir (tests, multi-instance):
export ATTACHE_DATA_DIR=/path/to/data
```

Uses `better-sqlite3-multiple-ciphers` (SQLCipher-compatible) via a pnpm alias;
scrypt KDF wraps a random DEK (envelope). Lost passphrase = lost data by design.
See the [v1 hardening roadmap](docs/plans/v1-hardening-roadmap.md).

## Ledger (ADR-001 P0)

Transfers post through `LedgerPort` (`SqliteLedgerAdapter`). `funding_account.balance_usd`
is a projection — the journal is authoritative after bootstrap.

```bash
# Transfers flow: propose → approve → ledger post (idempotent on proposal:{id})
attache transfer submit --from <id> --amount <usd> [--to <id>]
attache transfer approve <id>
```

TigerBeetle adapter deferred to BL-11.

## Plaid + ingestion eval (hardening slice 3)

Live Plaid when `PLAID_CLIENT_ID` + `PLAID_SECRET` set; otherwise fake sandbox.

```bash
attache plaid status
attache plaid connect                              # loopback Link — opens browser
attache plaid connect --public-token <token>       # headless exchange
attache plaid link-token                           # live Link token JSON
attache plaid connect-sandbox                      # demo without keys
attache plaid sync

attache ingest eval [--adapter sandbox]            # bill extraction accuracy (50-bill corpus)
```

Register loopback redirect in Plaid Dashboard: `http://127.0.0.1:8766/plaid/callback`
(override port via `ATTACHE_PLAID_LOOPBACK_PORT`).

See [plaid-production-ingestion-eval.md](docs/plans/plaid-production-ingestion-eval.md).

## Desktop packaging (slice 4 / ADR-012)

**Unsigned DMGs** via Starflow → GitHub macOS workers (Celestial pattern). No Apple
cert required — users right-click → Open on first launch.

```bash
# One-time: mint Tauri updater key → ss vault + gh secrets
sf run mint-tauri-updater-key
# or: pnpm mint:updater-key

# Release dual-arch DMGs
sf run release-attache-desktop --input version=desktop-v0.1.0
brew install --cask attache   # arm64 + Intel
```

See [vs-4-packaging-polish.md](docs/plans/vs-4-packaging-polish.md).

## Dev

```bash
pnpm ss:up
pnpm test
pnpm desktop:dev   # Tauri shell @ :8780
```
