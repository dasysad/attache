# Slice — TigerBeetle LedgerPort P1 (BL-11)

**Status:** ✅ shipped  
**Parent:** [next-backlog-order.md](./next-backlog-order.md) · BL-11  
**ADRs:** [001](../adr/001-tigerbeetle-financial-ledger.md) (amended: Node client, not Litestar)  
**P0:** [ledger-port-p0.md](./ledger-port-p0.md) (SQLite journal — remains default)

## Goal

Manual transfer approval can post through a **TigerBeetle** replica via the same
`LedgerPort` agents already use. SQLite stays the zero-ops default; TB is
opt-in when a replica is running. Tests never require a binary.

## Why Node, not Python

ADR-001 sketched a Litestar sidecar because the Python client existed first.
`tigerbeetle-node` is first-class now, and Attache is a TypeScript standalone
app (ADR-009). Python stays for AI/ML. The sidecar is deferred.

## Acceptance

1. `TigerBeetleLedgerAdapter` implements `LedgerPort` (async). TB post **then**
   SQLite journal/projection (crash-safe: TB `exists` + SQLite idempotency).
2. Fake TB client covers opening, internal/outbound, idempotency, insufficient
   funds, `exists` with a different amount (negative).
3. Default backend remains SQLite (`ATTACHE_LEDGER` unset).
4. `ATTACHE_LEDGER=tigerbeetle` uses the live Node client
   (`ATTACHE_TB_ADDRESS`, default `3000`; `ATTACHE_TB_CLUSTER_ID`, default `0`).
5. CLI: `attache ledger status`. MCP: `ledger_status`.
6. Approve path awaits the port (CLI / MCP / web).

## Dogfood

```bash
# Default — unchanged:
attache transfer submit --from <id> --amount 10
attache transfer approve <id>
attache ledger status   # backend: sqlite

# Optional replica (binary on PATH, version-matched to tigerbeetle-node):
mkdir -p ~/.attache/ledger
tigerbeetle format --cluster=0 --replica=0 --replica-count=1 ~/.attache/ledger/0_0.tigerbeetle
tigerbeetle start --addresses=3000 --development ~/.attache/ledger/0_0.tigerbeetle

export ATTACHE_LEDGER=tigerbeetle
attache ledger status   # backend: tigerbeetle, reachable: true
attache transfer approve <id>
```

## Account chart (TB)

| Role | TB `code` | Flags | Transfer direction |
|------|-----------|-------|--------------------|
| Funding asset | 10 | `debits_must_not_exceed_credits` | Opening credits the asset; outbound debits it |
| Opening equity | 20 | none | Debited on bootstrap |
| External sink | 30 | none | Credited on outbound (no `to`) |

Ledger number is `1` (household USD). Account/transfer ids are SHA-256→u128 of
stable Attache keys (`funding:{id}`, `opening:{id}`, `proposal:{id}`).

## Out of scope

- Replay of historical SQLite journals into a new replica (fresh TB + current
  `balance_usd` opening).
- Two-phase TB pending transfers (HITL stays the SQLite proposal queue).
- Bundling/downloading the TigerBeetle binary.
- Plaid reconciliation into the ledger (ADR-001 P2).
- Mesh ledger primary (BL-3).
- Python/Litestar sidecar.
