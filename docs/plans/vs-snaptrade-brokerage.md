# Slice — SnapTrade brokerage (read-only)

**Status:** ✅ shipped  
**Parent:** [next-backlog-order.md](./next-backlog-order.md) · BL-5 / VS-9  
**ADRs:** [004](../adr/004-ingestion-pipeline.md), [006](../adr/006-pricing-and-premium-tiers.md)

## Goal

Agents and households can **connect** a brokerage (sandbox without keys), **sync**
balances onto **My Accounts**, and **unlink** — same shape as Plaid. Read-only;
no trade execution.

## Acceptance

1. Core: `SnapTradeIngestPort`, Fake + Live (when `SNAPTRADE_CLIENT_ID` +
   `SNAPTRADE_CONSUMER_KEY`), `snaptrade_connection` + vault userSecret.
2. Sync upserts funding accounts `kind=brokerage`, `provenance=snaptrade`.
3. Transfer honesty treats SnapTrade legs as `approval_only` (like Plaid).
4. CLI: `attache snaptrade status|connect-sandbox|sync|unlink`.
5. MCP: `snaptrade_status`, `snaptrade_connect_sandbox`, `snaptrade_sync`,
   `unlink_snaptrade_connection`.
6. Web: `/app/snaptrade` + accounts show brokerage rows.
7. Tests: sandbox connect → My Accounts; unlink; honesty negative on brokerage.

## Dogfood

```bash
attache snaptrade connect-sandbox
attache snaptrade sync
attache accounts list
attache snaptrade unlink <connectionId>
```

## Out of scope

Connection Portal embed polish, premium subscription gate, live ACH, positions
UI depth (positions JSON on status is enough for agents).
