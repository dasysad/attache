# Vertical slice — Automation UI (Phase E)

**Status:** ✅ shipped (rules + ACH; credential hygiene deferred)  
**Parent:** [vs-ui-household-basics.md](./vs-ui-household-basics.md), [ADR-017](../adr/017-transfer-rules-typed-local-policies.md), [ADR-013](../adr/013-licensed-ach-rail.md)  
**Date:** 2026-08-26

## Goal

Project typed transfer rules and ACH rail onto the web after household basics
dogfood. CLI/MCP remain the operator surface; web is buttons on the same domain.

## Shipped

| Route | Domain |
|-------|--------|
| `/app/transfer-rules` | `listTransferRules`, create, disable, evaluate, schedule install/uninstall |
| `/app/ach` | `achStatus`, `achWebhookStatus`, sync, sandbox simulate |

Cross-links from `/app/transfers`. Nav under **More → Rules / ACH**.

## Explicitly deferred

Credential hygiene screens, Sankey, mesh, CRM, document vault, SendGrid.

## Dogfood

```bash
export ATTACHE_ACH=sandbox
attache accounts create --name Checking --balance 5000 --complete-setup
attache accounts create --name Savings --balance 100
attache transfer rules create --name Sweep --from <checking> --to <savings> \
  --amount 200 --max-run 500 --max-month 1000 --autonomy proposal
# Web: /app/transfer-rules → Evaluate · Install schedule
# Web: /app/ach → webhook path · Sync · Simulate (sandbox)
attache transfer rules evaluate
attache transfer list --pending
```

## References

- [vs-transfer-rules.md](./vs-transfer-rules.md)
- [vs-ach-rail.md](./vs-ach-rail.md)
