# Attache — agent guide

## Strategy: standalone prototype first (ADR-009)

Mesh is **backlog** — see [docs/backlog.md](docs/backlog.md).

## Current sprint: household basics before automation (UI P4+)

Discovery onboard and BL-6 / BL-7 / BL-8 P0 are shipped. **BL-7 P2** assisted
credential change shipped. **BL-12 transfer rules** shipped through P1 (CEL
`when` + launchd/cron). **ACH webhooks** (ADR-013 P2) shipped. Mobile companion
skipped. Mesh parked. **SendGrid parked.**

Next pull: **household basics UI** — setup checklist, register lists, people,
income, cashflow inflows — before rules/ACH web surfaces. See
[vs-ui-household-basics.md](docs/plans/vs-ui-household-basics.md).

| Doc | Purpose |
|-----|---------|
| [vs-ui-household-basics.md](docs/plans/vs-ui-household-basics.md) | Setup → lists → income → cashflow; automation UI deferred |
| [ADR-014](docs/adr/014-household-command-center-ui.md) | Command center IA |
| [ADR-017](docs/adr/017-transfer-rules-typed-local-policies.md) | Typed local policies; CEL when + schedule |
| [vs-transfer-rules.md](docs/plans/vs-transfer-rules.md) | P0+P1 acceptance (agent-first; UI deferred) |
| [ADR-013](docs/adr/013-licensed-ach-rail.md) | ACH rail + webhooks |
| [vs-hosted-mail-ingress.md](docs/plans/vs-hosted-mail-ingress.md) | BL-8 P0 BYO Mailgun |

```bash
attache setup status
attache members add --name Jordan --kind partner
attache income create --label Payroll --amount 5000 --cadence monthly --next 2026-09-01
attache assets list
attache entities list
```

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

## Ledger (ADR-001 P0 + P1 / BL-11)

Transfers post through `LedgerPort`. Default adapter is SQLite
(`SqliteLedgerAdapter`). `funding_account.balance_usd` is a projection.

```bash
# Transfers flow: propose → approve → ledger post (idempotent on proposal:{id})
attache transfer submit --from <id> --amount <usd> [--to <id>]
attache transfer approve <id>
attache ledger status
```

Opt-in TigerBeetle (`ATTACHE_LEDGER=tigerbeetle`, replica at
`ATTACHE_TB_ADDRESS` default `3000`). Tests use an in-memory fake client — no
binary required. See [vs-tigerbeetle-ledger.md](docs/plans/vs-tigerbeetle-ledger.md).

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

## My Accounts (vertical slice 1)

Agent-first onboard + funding accounts — no browser required.

```bash
attache onboard --household "Smith" --holder "Alex" [--complete-setup]
attache accounts create --name Checking --balance 2500 [--complete-setup]
attache accounts create --name Visa --balance 400 --kind credit
attache accounts list
attache plaid connect-sandbox   # or live connect — upserts into same list
```

Web: **/app/accounts** (My Accounts). After Plaid connect/sync, UI redirects there.
MCP: `onboard`, `list_accounts`, `create_account`.

See [vs-accounts-my-accounts.md](docs/plans/vs-accounts-my-accounts.md).

## Obligations CLI/MCP (parity)

Create and mark paid without the web UI. Same domain as `/app/obligations`.
Marking paid does **not** ACH.

```bash
attache obligations list
attache obligations create --payee Rent --amount 1800 --due 2026-09-01 [--cadence monthly] [--autopay] [--notes …]
attache obligations paid <id>
```

MCP: `list_obligations`, `create_obligation`, `mark_obligation_paid`.
See [vs-obligations-parity.md](docs/plans/vs-obligations-parity.md).

## Agent HITL parity (vertical slice 2)

MCP matches CLI for transfer review and Plaid dogfood (no browser Link).

```text
# Transfer HITL
approve_transfer_proposal { id, note? }
reject_transfer_proposal  { id, note? }
list_transfer_proposals   { pendingOnly? }

# Plaid (sandbox / status — live Link stays CLI)
plaid_status
plaid_connect_sandbox
plaid_sync
```

Live Link: `attache plaid connect`. See [vs-agent-hitl-parity.md](docs/plans/vs-agent-hitl-parity.md).

## Account lifecycle (vertical slice 3)

Unlink banks, surface sync errors, consistent kind mapping.

```bash
attache plaid unlink <itemId>     # vault + linked My Accounts gone
attache accounts delete <id>      # manual only
```

MCP: `unlink_plaid_item`, `delete_account`. Web: Unlink on `/app/plaid`.

See [vs-account-lifecycle.md](docs/plans/vs-account-lifecycle.md).

## Ingest reliability (vertical slice 4)

Gmail/IMAP errors, unlink, and agent poll → confirm → obligation.

```bash
attache ingest gmail connect-sandbox
attache ingest discover              # ranked candidates (HITL; no auto-promote)
attache ingest discover-sandbox      # mixed bill + Chase + Fidelity fixtures
attache ingest poll-gmail
attache ingest status
attache ingest confirm <eventId>
attache ingest gmail unlink <id>
```

MCP: `ingest_status`, `ingest_discover`, `poll_gmail`, `poll_imap`, `confirm_bill_ingest`,
`gmail_connect_sandbox`, `unlink_gmail_account`, `unlink_imap_account`.

See [vs-ingest-obligation-reliability.md](docs/plans/vs-ingest-obligation-reliability.md).

## Transfer honesty (vertical slice 5)

**Approve ≠ bank ACH** unless the ACH rail is on (BL-12) and both legs are Plaid.

```bash
attache transfer submit --from <id> --amount 10   # JSON includes execution.mode
attache transfer approve <id>                     # message explains outcome
```

MCP `propose_transfer` / `submit_transfer_proposal` / `approve_transfer_proposal`
return `execution` + `message`. Web chips: **approved (no ACH)** / **ACH submitted**.

See [vs-transfer-honesty.md](docs/plans/vs-transfer-honesty.md).

## Licensed ACH (BL-12 / ADR-013)

Opt-in Plaid Transfer rail for **Plaid-to-Plaid** HITL. Default off (honesty unchanged).

```bash
export ATTACHE_ACH=sandbox          # fake rail — not a real bank move
attache ach status
attache transfer approve <id>       # ach_pending when both legs are Plaid
attache ach simulate <proposalId>   # posted → local ledger
# Live: ATTACHE_ACH=plaid + PLAID_* keys; then attache ach sync
# Optional: ATTACHE_ACH_WEBHOOK_SECRET → POST /api/ach/webhook (Bearer)
attache ach webhook-status
```

MCP: `ach_status`, `simulate_ach`, `sync_ach`, `ach_webhook_status`.
See [vs-ach-rail.md](docs/plans/vs-ach-rail.md).

## Transfer rules (BL-12 / ADR-017)

Typed SQLite policies — not Starflow YAML, not a password-manager-style script.
Evaluate creates HITL proposals or auto-approves within caps (same honesty path).
Optional CEL `when` guard; daily launchd/cron via schedule install.

```bash
attache transfer rules create --name Sweep --from <checking> --to <savings> \
  --amount 200 --max-run 500 --max-month 1000 --autonomy proposal \
  --when 'liquidBalanceUsd >= 1000.0 && runwayDays > 14'
attache transfer rules evaluate
attache transfer rules schedule install   # daily 06:00 local
attache transfer list --pending
```

MCP: `list_transfer_rules`, `create_transfer_rule`, `disable_transfer_rule`,
`evaluate_transfer_rules`, `transfer_rules_schedule_status`,
`install_transfer_rules_schedule`, `uninstall_transfer_rules_schedule`.
See [vs-transfer-rules.md](docs/plans/vs-transfer-rules.md).

## SnapTrade brokerage (BL-5)

Read-only brokerage on My Accounts (`kind=brokerage`). Sandbox without keys;
live when `SNAPTRADE_CLIENT_ID` + `SNAPTRADE_CONSUMER_KEY` set.

```bash
attache snaptrade connect-sandbox
attache snaptrade sync
attache snaptrade status
attache snaptrade unlink <connectionId>
attache snaptrade positions
```

MCP: `snaptrade_status`, `snaptrade_connect_sandbox`, `snaptrade_sync`,
`list_snaptrade_positions`, `unlink_snaptrade_connection`. Web: `/app/snaptrade`.

## Command-center UI (ADR-014)

Web is a household command center (solvency + attention), not a Monarch/Firefly clone.
Primary nav: Home, Accounts, Bills, Activity, Transfers, Alerts. Connections sit under Connect.

```bash
attache agent attention   # same items as the Home attention strip
attache activity list [--account id] [--pending|--posted] [--from d] [--to d]
attache activity recategorize <id> --category Groceries
attache net-worth
attache cashflow [--from YYYY-MM-DD] [--to YYYY-MM-DD]
attache cashflow trend [--from YYYY-MM-DD] [--to YYYY-MM-DD]
attache accounts create --name Visa --balance 400 --kind credit
```

MCP: `get_attention`, `list_transactions`, `get_net_worth`, `get_cashflow`,
`get_cashflow_trend`, `set_transaction_category`. Web: `/app/net-worth`,
`/app/cashflow` under More.
Lens: `pnpm lens` (:7777) for Lit primitives + tokens.
See [vs-ui-polish.md](docs/plans/vs-ui-polish.md).

## Android FCM devices (BL-6 P0)

Local API for the notification companion. Kotlin app is follow-on. Default
`ATTACHE_FCM` off stores tokens without Google send.

```bash
attache devices register --token <fcm> [--label Pixel]
attache devices list
attache devices unlink <id>
# Companion: POST /devices/register { fcm_token, platform: "android" }
```

MCP: `register_device`, `list_devices`, `unlink_device`.
See [vs-android-fcm.md](docs/plans/vs-android-fcm.md).

## Credential hygiene (BL-7 / ADR-016)

HIBP mailbox emails + high-value name shortlist. **Not a password manager.**

```bash
attache ingest gmail connect-sandbox
attache credentials check --sandbox
attache credentials assist --email sandbox@gmail.com
```

MCP: `credentials_check`, `credentials_assist`. Live: `HIBP_API_KEY`.
See [vs-credential-hygiene.md](docs/plans/vs-credential-hygiene.md).

## Hosted mail ingress (BL-8 / ADR-007 Phase B P0)

BYO Mailgun inbound. IMAP/Gmail stay primary. Mailgun sees plaintext.

```bash
export ATTACHE_MAILGUN_SIGNING_KEY=…
attache ingest ingress-status
# Mailgun route → POST /api/ingest/mailgun
```

MCP: `ingest_ingress_status`. Attache does not operate SMTP.
See [vs-hosted-mail-ingress.md](docs/plans/vs-hosted-mail-ingress.md).

Next backlog: Mesh parked. Mobile companion skipped. SendGrid parked.
**Household basics UI** next — rules/ACH web deferred — see
[vs-ui-household-basics.md](docs/plans/vs-ui-household-basics.md).

## Dev

```bash
pnpm ss:up
pnpm test
pnpm desktop:dev   # Tauri shell @ :8780
pnpm lens          # Lit gallery @ :7777 (needs sibling celestial-intelligence)
```
