# LedgerPort P0 — double-entry fake adapter

**Status:** complete  
**ADR:** [001](../adr/001-tigerbeetle-financial-ledger.md) (Phase P0)  
**Roadmap:** [v1 hardening](./v1-hardening-roadmap.md) slice 2

## Goal

Money movement has an **auditable double-entry journal** instead of silently
mutating `funding_account.balance_usd`. Transfers post through a `LedgerPort`
adapter; the funding account row becomes a **projection** for fast UI reads.

TigerBeetle remains backlog (BL-11). P0 ships a SQLite-backed adapter in
`@attache/core` — same database file, new tables.

**Done when:** approving a manual transfer proposal posts balanced ledger entries,
updates projected balances, is idempotent on retry, and rejects insufficient funds.

## Design

### Account chart (per tenant)

| Ledger account | Role | Maps to |
|----------------|------|---------|
| One per `funding_account` | `asset` | Checking, savings, etc. |
| `Opening Balance` | `equity` | Contra for initial manual balances |
| `External` | `external` | Outbound transfers with no destination leg |

### Double-entry invariant

Every `ledger_transfer` has entries whose `amount_minor` **sum to zero**.
Amounts are **integer cents** (no floats in the journal).

### Idempotency

`postTransfer` accepts `idempotencyKey` (e.g. `proposal:{uuid}`). A duplicate
key returns the existing transfer without double-posting (ADR-001).

### Projection

After each post, `syncFundingBalanceProjection` writes
`funding_account.balance_usd = ledger_balance_cents / 100` for affected asset
accounts. UI and forecast keep reading `funding_account` — no surface changes.

### Opening balances

When a funding account first enters the ledger, an opening entry is posted from
the equity account (`idempotency: opening:{fundingAccountId}`) to match the
current `balance_usd`. Existing dogfood data bootstraps lazily on first post.

## Phases

| Item | Status |
|------|--------|
| `ledger/port.ts` — interface | ✅ |
| `ledger/sqlite-adapter.ts` — journal + post/get/history | ✅ |
| DB migration — `ledger_account`, `ledger_transfer`, `ledger_entry` | ✅ |
| Rewire `approveTransferProposal` | ✅ |
| Tests incl. negative space | ✅ 11 tests |

## Non-goals (P0)

- TigerBeetle binary / Litestar service (P1 / BL-11)
- Pending two-phase transfers (HITL uses proposal queue + post on approve)
- Plaid balance reconciliation into ledger (P2)
- Rewiring manual `updateManualAccount({ balanceUsd })` — still allowed for edits; ledger is source of truth after first post

## Test matrix

- Opening balance bootstrap matches `funding_account.balance_usd`
- Internal transfer: balanced entries, projected balances correct
- Outbound transfer (no `to`): external leg credited
- Idempotent repost returns same transfer, no balance drift
- Insufficient funds throws before any entry
- Entries for a transfer sum to zero
