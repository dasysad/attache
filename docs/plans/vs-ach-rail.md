# Slice — Licensed ACH rail (BL-12 P0)

**Status:** ✅ shipped  
**Parent:** [next-backlog-order.md](./next-backlog-order.md) · BL-12  
**ADRs:** [013](../adr/013-licensed-ach-rail.md), [001](../adr/001-tigerbeetle-financial-ledger.md)

## Goal

HITL approve of a **Plaid-to-Plaid** proposal can submit a licensed ACH (sandbox
fake by default when enabled). Settlement then posts through `LedgerPort`.
Manual legs stay local-ledger; SnapTrade stays consent-only. Autonomous rules
are **not** in this slice.

## Acceptance

1. `AchPort` + `FakeAchAdapter`; live Plaid Transfer adapter when
   `ATTACHE_ACH=plaid` + `PLAID_*` keys.
2. Default `ATTACHE_ACH` unset → existing honesty (Plaid = `approval_only`).
3. `ATTACHE_ACH=sandbox` + both legs Plaid → approve status `ach_pending`;
   `attache ach simulate <id>` → `executed` + ledger post.
4. CLI: `attache ach status|simulate|sync`. MCP: `ach_status`, `simulate_ach`,
   `sync_ach`.
5. Honesty notes distinguish sandbox vs live vs off.
6. Unlink Plaid blocked while `ach_pending`. Tests include negative space
   (SnapTrade, mixed legs, ACH off, double simulate).

## Dogfood

```bash
export ATTACHE_ACH=sandbox
attache plaid connect-sandbox
attache accounts list
attache transfer submit --from <plaidChecking> --to <plaidSavings> --amount 25
attache transfer approve <id>     # ach_pending
attache ach simulate <id>         # posted → ledger executed
attache ach status
```

## Out of scope

Autonomous rules, rule builder UI, external vendor payees, RTP/wire, live
webhooks, Dwolla/Moov/Astra, SnapTrade cash movement.
