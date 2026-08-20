# Slice 3 — Account lifecycle

**Status:** ✅ shipped  
**Parent:** [vertical-slices-readiness.md](./vertical-slices-readiness.md)

## Goal

Households and agents can **unlink** a Plaid bank connection, see **sync errors**
clearly, and get consistent **kind** labels from Plaid subtypes → funding accounts.

## Acceptance

1. Core `unlinkPlaidItem(db, itemId, vault)` removes vault secret, linked funding
   accounts (+ bank txs), and the item — blocks if pending transfer proposals
   reference those accounts; detaches ledger accounts (history kept).
2. CLI: `attache plaid unlink <itemId>`; MCP: `unlink_plaid_item`.
3. Web: Unlink on `/app/plaid`; item rows show `error_code` / message when status
   is `error`; My Accounts shows `error` sync chip for failed links.
4. Sync marks linked funding accounts `sync_status=error` on item failure; success
   clears to `fresh`. `syncAllPlaidItems` continues past per-item failures and
   returns per-item outcomes.
5. Shared `mapPlaidAccountKind` maps Plaid subtypes → `checking` | `savings`
   (money market / CD → savings; prepaid / other → checking).

## Out of scope

Live Link update-mode re-auth UI, SnapTrade, ACH, multi-device.

## Dogfood

```bash
attache plaid connect-sandbox
attache plaid status
attache plaid unlink <itemId>
attache accounts list
```
