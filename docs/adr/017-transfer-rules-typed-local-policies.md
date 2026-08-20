# ADR-017: Transfer rules as typed local policies (not Starflow/Decider)

Area: finance / agents

- **Status:** accepted
- **Date:** 2026-08-20
- **Deciders:** founder
- **Related:** ADR-001 (ledger + rule idempotency), ADR-013 (ACH), BL-12 P3,
  [vs-transfer-rules.md](../plans/vs-transfer-rules.md),
  Celestial Starflow ADR-048 (CEL), Decider product (scored decisions)

## Context

Households need **pre-authorized sweeps** (e.g. Friday excess → savings) without
re-proposing every transfer by hand. ADRs already name Starflow for transfer
DAGs (BL-13) and Decider for multi-criteria branching. Celestial Starflow uses
**CEL** for edge conditions; Decider scores alternatives against rubrics.

Attache is **local-first** (ADR-009). Rules must evaluate on the Mac without a
Starflow server. Money still flows through the existing proposal → honesty →
ACH/ledger path — rules are policy that *feeds* that path, not a second rail.

## Decision

### Source of truth: typed SQLite documents

Store each rule as structured JSON fields on `transfer_rule`:

| Field | Role |
|-------|------|
| `trigger` | When to consider the rule (`always` on evaluate, `balance_above`, …) |
| `action` | What to do (`sweep` fixed amount from → to) |
| `policy` | Caps + autonomy (`maxPerRunUsd`, `maxPerMonthUsd`, `proposal` \| `auto`) |

Optional CEL `when` expressions are **P1** (same grammar as Starflow ADR-048 via
`cel-js`). P0 uses deterministic triggers only.

### Execution

1. `evaluateTransferRules` loads a household snapshot and enabled rules.
2. Enforce period idempotency: `rule:{id}:period:{YYYY-MM}` (ADR-001).
3. Enforce per-run and per-month caps.
4. Create a `transfer_proposal` (HITL) or, when `autonomy=auto` **and** the
   dry-run is allowed, call the same `approveTransferProposal` path used by
   humans/agents.
5. Record each attempt in `transfer_rule_run`.

### Starflow and Decider (reuse later, not P0 deps)

| System | Role for Attache |
|--------|------------------|
| **@attache/core evaluator** | Source of truth; offline dogfood |
| **Starflow (BL-13)** | Cron / HITL wait / notify that shells `attache transfer rules evaluate` |
| **Decider** | Multi-option agent choices (“which account to fund?”) — not sweep storage |
| **CEL** | Optional `when:` guards (P1), aligned with Starflow |

## Alternatives considered

| Option | Verdict |
|--------|---------|
| Starflow YAML as the only rule store | Rejected — breaks standalone / offline |
| Decider as rule engine | Rejected — wrong abstraction (scored options ≠ recurring policy) |
| Full CEL-only rules | Rejected for P0 — caps and account IDs must be typed fields |
| json-rules-engine / OPA | Overkill; not shared with Celestial stack |

## Consequences

- Agents: `attache transfer rules …` / MCP `list_transfer_rules`,
  `create_transfer_rule`, `disable_transfer_rule`, `evaluate_transfer_rules`.
- Auto autonomy never bypasses honesty: Plaid legs still need ACH on to move
  bank money; otherwise approve stays consent-only or ledger for manual.
- Rule builder UI remains out of P0 (CLI/MCP first).

## References

- [vs-transfer-rules.md](../plans/vs-transfer-rules.md)
- Celestial: Starflow ADR-048 (CEL), ADR-045 (`decider-decision` step)
- [ADR-001](./001-tigerbeetle-financial-ledger.md), [ADR-013](./013-licensed-ach-rail.md)
