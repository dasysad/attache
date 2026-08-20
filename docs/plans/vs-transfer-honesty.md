# Slice 5 — Transfer honesty

**Status:** ✅ shipped  
**Parent:** [vertical-slices-readiness.md](./vertical-slices-readiness.md)

## Goal

Humans and agents never confuse **HITL approve** with a **bank move**. Plaid-linked
legs stay `approved` (audit only); only all-manual legs become `executed` via LedgerPort.

## Acceptance

1. Core `transferHonesty(db, from, to?)` — `mode: ledger_execute | approval_only`,
   canonical `note`, which legs are Plaid.
2. Dry-run / submit add an honesty **warning** when any leg is Plaid-linked.
3. Approve responses (CLI/MCP/web) include `execution` + `note` (same copy).
4. Web transfers page: page blurb, per-row badge for Plaid proposals, Approve button
   title clarifies outcome; `approved` chip reads **approved (no ACH)**.
5. AGENTS.md one-liner; tests for manual execute vs Plaid approval-only + negative
   (unknown account → approval_only).

## Out of scope

Real ACH webhooks, autonomous rules, Dwolla/Moov. TigerBeetle shipped (BL-11).

## Dogfood

```bash
attache plaid connect-sandbox
attache transfer submit --from <plaidAccountId> --amount 10
attache transfer approve <id>   # status=approved, note says no bank move
```
