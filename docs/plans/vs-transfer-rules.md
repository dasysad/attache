# Slice — Autonomous transfer rules (BL-12 P3 / ADR-017)

**Status:** ✅ P0 + P1 (CEL when + schedule) shipped  
**Parent:** [next-backlog-order.md](./next-backlog-order.md) · BL-12  
**ADRs:** [017](../adr/017-transfer-rules-typed-local-policies.md), [013](../adr/013-licensed-ach-rail.md), [001](../adr/001-tigerbeetle-financial-ledger.md)

## Goal

Agent-first **typed transfer policies** in SQLite. Evaluate creates HITL
proposals (or auto-approves within caps). No Starflow/Decider dependency.
Starflow remains BL-13 orchestration.

## P0 acceptance

1. Tables `transfer_rule` + `transfer_rule_run`.
2. Triggers: `always` | `balance_above` (account + thresholdUsd).
3. Action: `sweep` fixed `amountUsd` from → to (accounts must exist and differ).
4. Policy: `maxPerRunUsd`, `maxPerMonthUsd`, `autonomy: proposal | auto`.
5. Idempotency: one successful fire per rule per calendar month
   (`rule:{id}:period:{YYYY-MM}`).
6. Caps enforced; dry-run blockers → `blocked` run, no proposal.
7. CLI: `attache transfer rules list|create|disable|evaluate`.
8. MCP: `list_transfer_rules`, `create_transfer_rule`, `disable_transfer_rule`,
   `evaluate_transfer_rules`.
9. Negatives: not onboarded, same from/to, amount over maxPerRun, disabled
   rules skipped, second evaluate in month is `skipped`.

## Dogfood

```bash
attache accounts create --name Checking --balance 5000 --complete-setup
attache accounts create --name Savings --balance 100
# use ids from accounts list
attache transfer rules create --name "Sweep" --from <checking> --to <savings> \
  --amount 200 --max-run 500 --max-month 1000 --autonomy proposal
attache transfer rules evaluate
attache transfer list --pending
attache transfer approve <proposalId>
```

## Out of scope (P0)

Starflow pipeline, Decider scoring, rule builder UI, excess-above-balance amount
kinds.

## P1 (shipped with follow-ons)

1. **CEL `when`:** optional `policy.whenCel` — false skips without burning the
   month. Vars: `liquidBalanceUsd`, `runwayDays`, `dueIn7dUsd`,
   `fromBalanceUsd`, `toBalanceUsd`, `amountUsd`. CLI `--when`, MCP `whenCel`.
2. **Local schedule:** `attache transfer rules schedule install|uninstall|status`
   — launchd daily 06:00 (macOS) or crontab line file (Linux).
3. **ACH webhooks:** `POST /api/ach/webhook` with Bearer
   `ATTACHE_ACH_WEBHOOK_SECRET` (ADR-013 P2). Poll via `ach sync` when off.

