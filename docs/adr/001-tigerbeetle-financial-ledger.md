# ADR-001: TigerBeetle as financial ledger substrate

Area: finance / persistence

- **Status:** accepted
- **Date:** 2026-06-22
- **Amended:** 2026-08-15 (P1: `tigerbeetle-node` in-process; Litestar sidecar deferred)
- **Deciders:** founder
- **Related:** planning brief (local-first attache), `attache-python/src/models.py`,
  Starflow (transfer rules, HITL approval DAGs), Spacecraft (agent MCP tools)

## Context

Attache is a **focused life-finance attache**, not a universal assistant. Core
capabilities depend on a trustworthy record of money:

- **Balance truth** — know what is available now and projected across accounts.
- **Obligation solvency** — forecast whether monthly bills will be met.
- **Transfer execution** — rules-based autonomous sweeps within policy caps,
  plus agent-proposed transfers that require HITL approval before execution.
- **Audit trail** — immutable history of who moved what, when, and under which
  rule or approval.

The existing Python prototype (`attache-python`) has Pydantic domain models
(`Entity`, `Account`, `Debt`, `Subscription`, etc.), Fernet-encrypted credential
files, and JSON-on-disk scraped-data storage. There is **no ledger** today; the
scraper even carries a `# TODO: Store results in database` comment. Balances on
`Account` are optional floats with no invariant guarantees.

We need a **system of record for monetary state** that is separate from:

| Store | Role | Why not the ledger |
|-------|------|--------------------|
| SQLite (+ SQLCipher) | Local-first metadata, calendar, obligations, tenant/member graph | General-purpose; weak transfer invariants at scale |
| Supabase | Auth, tenant registry, encrypted sync metadata | Cloud metadata; not authoritative for money movement |
| Cloudflare R2 | ZK ciphertext blobs, exports, attachments | Object storage; no balance semantics |
| SpaceTimeDB | Realtime UI state, approval queues, agent sessions | Coordination layer; not a financial ledger |
| External bank APIs (Plaid, SimpleFIN, …) | Source of truth for *external* institution balances | Eventually consistent; read-only in v1; not our transfer journal |

TigerBeetle is a purpose-built financial transactions database: double-entry
transfers, strict balance invariants, idempotent clients, and a design aimed at
correctness under concurrent writers. It fits Attache's **rules engine + HITL**
model better than ad-hoc SQL or JSON balance fields.

## Decision

Adopt **TigerBeetle** as the **authoritative financial ledger** for Attache.
All internal monetary movements — balance adjustments from bank sync,
inter-account sweeps, obligation allocations, and posted transfer outcomes —
flow through a **`LedgerPort` adapter** with a TigerBeetle reference
implementation (`TigerBeetleLedgerAdapter`).

TigerBeetle is **not** the only database in Attache. It owns **ledger accounts
and transfers only**. Everything else stays in SQLite / sync layers.

### Layering

```
┌─────────────────────────────────────────────────────────────┐
│  Surfaces: Web (Hono+htmx+Lit) │ CLI │ MCP (Spacecraft)     │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  Attache Core (TS): ObligationEngine, Forecast, Rules, HITL   │
└──────┬──────────────────────────────┬───────────────────────┘
       │                              │
┌──────▼──────────┐          ┌────────▼────────────────────────┐
│ SQLite          │          │ LedgerPort                       │
│ obligations,    │          │  ├─ SqliteLedgerAdapter (default)│
│ calendar,       │          │  └─ TigerBeetleLedgerAdapter     │
│ tenant graph,   │          │       (tigerbeetle-node, opt-in) │
│ bank tx cache   │          └────────┬────────────────────────┘
└─────────────────┘                   │
                             ┌────────▼────────┐
                             │ TigerBeetle      │
                             │ (local replica)  │
                             └─────────────────┘
```

### What TigerBeetle stores

| TigerBeetle concept | Attache mapping |
|---------------------|-----------------|
| `Account` (ledger) | One per tracked funding bucket: checking, savings, credit (liability), internal "envelope", pending-transfer escrow |
| `Transfer` | Double-entry movement between ledger accounts; carries `user_data` for idempotency key, rule id, approval id, external ref |
| `PendingTransfer` (two-phase) | HITL proposals and in-flight ACH intents before settlement |
| Balance queries | Solvency engine input; dashboard "available now" |

### What TigerBeetle does **not** store

- Merchant names, categories, receipt images → SQLite + R2
- Calendar events, school activities → SQLite
- Plaid access tokens → `@celestial/vault` (platform secrets)
- User passphrase / DEK material → client only (ZK path)

### Adapter interface (sketch)

Implement in `attache-python` behind a port; expose to TypeScript core via
HTTP (Litestar) or gRPC. The interface is intentionally small:

```python
# attache-python/src/ledger/port.py

class LedgerPort(ABC):
    async def ensure_account(self, tenant_id: str, account_ref: str, code: int) -> LedgerAccountId: ...
    async def post_transfer(
        self,
        *,
        idempotency_key: str,
        debit: LedgerAccountId,
        credit: LedgerAccountId,
        amount_minor: int,
        user_data: bytes,
    ) -> TransferId: ...
    async def create_pending_transfer(self, ...) -> PendingTransferId: ...
    async def post_pending_transfer(self, pending_id: PendingTransferId) -> TransferId: ...
    async def void_pending_transfer(self, pending_id: PendingTransferId) -> None: ...
    async def get_balance(self, account_id: LedgerAccountId) -> int: ...
    async def lookup_transfer(self, idempotency_key: str) -> TransferId | None: ...
```

**Idempotency:** Starflow rule runs and agent proposals MUST pass a stable
`idempotency_key` (e.g. `rule:{rule_id}:period:{YYYY-MM}` or
`approval:{approval_id}`) so retries never double-post.

**Amounts:** Integer minor units (cents) only; no floats in the ledger layer.

### Transfer lifecycle

| Stage | Mechanism | Autonomy |
|-------|-----------|----------|
| Bank sync adjustment | `post_transfer` from external-reconciliation account to user account | Automatic (reconciliation job) |
| Rule-based sweep | `post_transfer` with `user_data.rule_id` | Autonomous within pre-authorized policy |
| Agent proposal | `create_pending_transfer` → HITL queue | Requires approval |
| Approved agent / HITL | `post_pending_transfer` | After explicit confirm |
| Rejected / expired | `void_pending_transfer` | — |
| External ACH (future) | Pending until rail callback; then post or void | Rail adapter owns side effects |

### Deployment (v1)

| Mode | Target | Notes |
|------|--------|-------|
| **Local-first** | TigerBeetle single-replica alongside SQLite on user machine | Default for self-hosted; data dir under `~/.attache/ledger/` |
| **Hetzner worker** | Single-node TigerBeetle on existing long-running box | For users who want always-on rules without open laptop |
| **Clustered** | Defer | TigerBeetle clustering adds ops burden; not needed until multi-region or high HA |

TigerBeetle replication across P2P mesh is **out of scope for v1**. Mesh sync
carries encrypted SQLite metadata and ledger **export snapshots** for
disaster recovery; the ledger replica on each device is a consistency
problem we solve in a later ADR (likely: one primary writer per tenant).

### Client placement (amended 2026-08-15)

P1 uses **`tigerbeetle-node` in-process** behind `LedgerPort`. SQLite remains
the default (`ATTACHE_LEDGER` unset). Opt-in: `ATTACHE_LEDGER=tigerbeetle` plus
a local replica (`ATTACHE_TB_ADDRESS`, default `3000`).

The original Litestar sidecar is **deferred**. Python is reserved for AI/ML
(user convention); Attache core is TypeScript, and the Node client is
first-class. A dedicated ledger HTTP service can return if we ever split the
replica onto another host without embedding the client.

HITL pending stays the SQLite proposal queue (P0). TB two-phase
`PendingTransfer` is unused until ACH (BL-12).

## Alternatives considered

| Option | Verdict |
|--------|---------|
| **SQLite double-entry tables** | Simple for v0, but no built-in transfer invariants, idempotency, or concurrent-write story; we'd rebuild TigerBeetle poorly |
| **PostgreSQL / Supabase as ledger** | Familiar, but balance races and audit semantics require careful schema + locking; not purpose-built |
| **Firefly III–style journal in SQLite** | Good for personal accounting UX reference; weak for high-frequency rule execution and pending-transfer two-phase commit |
| **SpaceTimeDB as ledger** | Wrong tool; realtime coordination ≠ financial correctness |
| **Event sourcing only (no TigerBeetle)** | Flexible audit log, but projections and invariant enforcement become custom infrastructure |

TigerBeetle wins on **correctness guarantees** and **idempotent transfer
posting** for the rules + HITL product shape.

## Consequences

### Positive

- Hard balance invariants; no silent float drift on `Account.balance`.
- Natural model for pending (HITL) vs posted (executed) transfers.
- Idempotent Starflow retries without duplicate sweeps.
- Clear audit boundary: "what moved" in TigerBeetle; "why" in SQLite
  (`rule_id`, `obligation_id`, approval metadata).

### Negative / risks

- **Operational component:** another process to run, backup, and monitor.
- **Split brain:** domain `Account` (SQLite) must stay mapped 1:1 to ledger
  accounts; mapping table required (`ledger_account_map`).
- **Bank sync ≠ ledger truth:** external balances reconcile *into* the ledger;
  periodic reconciliation jobs must detect drift and surface alerts.
- **Local-first + TigerBeetle on laptop:** acceptable for power users; mobile-only
  users may prefer Hetzner-hosted ledger — tenant setting.
- **Learning curve:** team must internalize TigerBeetle account codes, flags,
  and two-phase transfer semantics.

### Mitigations

- Ship `LedgerPort` with an in-memory or SQLite **fake adapter** for tests and
  offline UI development without a TigerBeetle binary.
- Document account chart conventions in `docs/specs/ledger-account-chart.md`
  (follow-up).
- Starflow steps that touch money always go through `LedgerPort`; no direct
  balance mutation elsewhere (lint / code review rule).

## Implementation plan

| Phase | Deliverable |
|-------|-------------|
| **P0** | `LedgerPort` + SQLite adapter + unit tests (idempotency, opening, funds) — **done** |
| **P1** | `TigerBeetleLedgerAdapter` + fake client tests + CLI/MCP `ledger status`; local replica opt-in — **BL-11** |
| **P2** | `ledger_account_map` in SQLite; sync job from bank adapters → reconciliation transfers |
| **P3** | Starflow steps: `ledger.post_pending`, `ledger.post`, `ledger.void` |
| **P4** | HITL approval queue wired to pending transfers |
| **P5** | Hetzner provisioning via starsystem module (optional hosted ledger) |

**Explicitly deferred:** multi-device active-active ledger, investment lot
accounting inside TigerBeetle (v1 investments remain read-only analytics fed
from broker adapters, not ledger positions).

**Mesh (ADR-003):** One **ledger primary** `site_id` per tenant. Secondary household
peers consume balance snapshots; they do not run concurrent TigerBeetle writers.

## Open questions (to resolve before `accepted`)

1. Per-tenant TigerBeetle cluster id vs single cluster with tenant-scoped account id encoding?
2. Backup strategy: TigerBeetle snapshot frequency + encrypted export to R2?
3. Credit-card liability accounts: single liability account per card or per statement period?

**Resolved:** Household mesh does not replicate ledger writes (see ADR-003).

## References

- [TigerBeetle docs](https://docs.tigerbeetle.com/)
- [TigerBeetle Python client](https://github.com/tigerbeetle/tigerbeetle/tree/main/src/clients/python)
- Attache planning brief: local-first, rules-based autonomous + HITL agent transfers
- `attache-python/src/models.py` — domain models (pre-ledger)
- Celestial Intelligence ADR-013 — provider adapter interface (pattern reference)
