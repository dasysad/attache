# VS-3 — Plaid ingest

**Status:** complete  
**Date:** 2026-06-28  
**Builds on:** [VS-2](./vs-2.md), [ADR-004](../adr/004-ingestion-pipeline.md)

## Outcome

Pass-through bank sync for dogfood — sandbox without API keys; live Plaid path stubbed for server follow-up.

| Item | Status |
|------|--------|
| `ingested_event` + `bank_transaction` tables | ✅ |
| `plaid_item` + vault credential ref (not in SQLite) | ✅ |
| `PlaidIngestPort` + `FakePlaidAdapter` | ✅ |
| `LocalVaultPort` at `~/.attache/vault/` | ✅ |
| Sync → promote → dashboard transaction rows | ✅ |
| `/app/plaid` connect + sync UI | ✅ |
| CLI: `attache plaid status\|connect-sandbox\|sync` | ✅ |

## Architecture

```
PlaidIngestPort (adapter)
       ↓ fetchSnapshot
ingested_event (audit, dedupe by external_id)
       ↓ promote
bank_transaction + funding_account balance update
```

Access tokens: `vault.set("plaid/item/…")` — **never** in `attache.db`.

## Dogfood

```bash
pnpm ss:up
# Web: /app/plaid → Connect sandbox bank

pnpm attache plaid connect-sandbox
pnpm attache plaid sync
pnpm attache plaid status
```

## Next (VS-3.1 / VS-4)

- Live Plaid Link (`PLAID_CLIENT_ID` + Link token in server)
- Replace `LocalVaultPort` with `@celestial/vault`
- Document/email ingest (VS-4)

## References

- [ADR-006 pass-through pricing](../adr/006-pricing-and-premium-tiers.md)
- [PRD VS-3](../prd/attache-v1.md)
