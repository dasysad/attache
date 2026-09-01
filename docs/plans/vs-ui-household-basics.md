# Vertical slice — Household basics before automation (UI P4+)

**Status:** ✅ Phases A–D + F shipped · Phase E (rules/ACH UI) shipped  
**Parent:** [ADR-014](../adr/014-household-command-center-ui.md), [ADR-015](../adr/015-discovery-onboard.md)  
**Date:** 2026-08-20

## Goal

Complete the **household model** (setup checklist, register lists, people,
income, cashflow with inflows) before projecting rules / ACH / heuristics onto
the web. CLI/MCP and web ship together each phase. Automation UI is Phase E.

```text
Setup checklist → Register lists → People + income → Cashflow in/out → Home income stat → (later) rules UI
```

## Explicitly deferred (post Phase E)

Credential hygiene screens, Sankey, mesh, CRM, document vault, SendGrid.

Phase E (rules/ACH UI): see [vs-ui-automation.md](./vs-ui-automation.md).

## Phase A — Setup coverage checklist

Domain: `getSetupCoverage` / `listSetupGaps`. Skippable groups with `cliHint`.
Web: `/app/setup`. Home attention includes setup gaps when incomplete.
`--complete-setup` still bypasses the wizard.

## Phase B — Register lists

| Route | Source |
|-------|--------|
| `/app/assets` | `listHouseholdAssets` + create/delete |
| `/app/entities` | `listHouseholdEntities` (read-only) |
| `/app/statements` | statement-class events + connect hints |

Polish empty CTAs on Accounts / Bills.

## Phase C — People + income

- `member.kind`: `account_holder` | `partner` | `dependent` | `other` | legacy
- CLI/MCP/web `/app/people`
- Table `income_stream` + CLI/MCP/web `/app/income`

## Phase D — Cashflow with inflows

Forecast/runway apply income streams. Cashflow CLI/MCP/web show planned income
vs obligation outflows alongside posted bank category spend.

## Phase F — Home solvency stats (next UI pull)

**Status:** ✅ shipped

Home shows **Planned income** beside due-in-7d / overdue. Domain:
`SolvencyForecast.plannedIncomeUsd` + `hasIncomeStreams` (same as
`get_runway` / MCP). Empty streams → value `—` and helper “Add payroll on
Income” (not a fake $0). Horizon matches runway (default 30d).


## Dogfood

Run the full agent-first ladder on a throwaway data dir:

```bash
./scripts/household-basics-ladder.sh
```

Manual steps (same flow):

```bash
attache onboard --household "Smith" --holder "Alex"
attache setup status          # lands on /app/setup after web onboard
attache accounts create --name Checking --balance 2500
attache obligations create --payee Rent --amount 1800 --due 2026-09-01 --cadence monthly
attache members add --name Jordan --kind partner
attache income create --label Payroll --amount 5000 --cadence monthly --next 2026-09-01
attache assets create --kind home --label "123 Main" --estimate 450000
attache entities list
attache income list
attache cashflow
attache agent attention
attache setup complete        # or Mark setup complete on /app/setup
# Web: /app/setup (hub) · accelerators at /onboard/* · register routes under More
```

## References

- [vs-ui-polish.md](./vs-ui-polish.md) (P0–P3 shipped)
- [vs-discovery-onboard.md](./vs-discovery-onboard.md)
- [next-backlog-order.md](./next-backlog-order.md)
