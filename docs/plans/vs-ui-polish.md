# Vertical slice — UI polish (command center)

**Status:** P3 shipped  
**Parent:** [ADR-014](../adr/014-household-command-center-ui.md)  
**Date:** 2026-08-16

## Goal

The web shell is a **household command center**: solvency first, then
attention (HITL, overdue, sync errors), then accounts grouped by kind.
CLI/MCP stay the operator surface; UI is a projection.

## Acceptance (P0)

1. **ADR-014** lists competitor complaints, the view map, and non-goals.
2. **Nav IA:** primary Home / Accounts / Bills / Activity / Transfers / Alerts;
   Connect (Plaid, SnapTrade, Ingest) and More (Pricing, Costs) in overflow.
   Active link highlighting. Mobile wrap.
3. **Home:** attention strip (empty when healthy); stats for runway, liquid,
   brokerage (if any), due-in-7d, overdue; runway chart; accounts grouped by
   kind; upcoming bills; recent activity with link to `/app/activity`.
4. **Accounts:** grouped by kind with subtotals; liquid vs brokerage totals;
   provenance/sync chips unchanged.
5. **Activity** page: transaction register (same `bank_transaction` rows).
6. **Connections** hub linking the three ingest/sync tools.
7. **Tokens:** `attache.css` exposes `--att-*` so Lit components match the shell.
8. **Agent-first:** `attache agent attention` and MCP `get_attention` return
   the same items as the Home strip (each with `cliHint`). Tests include
   negative space (healthy household → empty attention; unknown kind still
   grouped).

## Out of scope (P0)

Activity filters, SnapTrade position tables, net worth, cash-flow Sankey,
YNAB envelopes, widget customization, SPA rewrite.

## P1 acceptance

1. `listTransactions` / `listActivity` filter by account, pending, from/to date.
   Unknown account → empty (not an error). Bad dates throw.
2. Web `/app/activity` GET form uses the same filters; Accounts rows link to
   per-account register.
3. SnapTrade sync persists positions; unlink clears them.
   CLI `attache snaptrade positions`, MCP `list_snaptrade_positions`.
   Investments page (`/app/snaptrade`) lists `att-position-row` (read-only).
4. CLI `attache activity list` and MCP `list_transactions`.
5. Lens gallery models tokens (color schemes, fonts, borders, motion) plus
   position-row / command-center / investments stories. `pnpm lens` @ :7777.

## Dogfood

```bash
attache onboard --household "Smith" --holder "Alex" --complete-setup
attache accounts create --name Checking --balance 2500 --complete-setup
attache plaid connect-sandbox
attache activity list --pending
attache snaptrade connect-sandbox
attache snaptrade positions
# Web: /app/activity filters; /app/snaptrade positions
# Lens: pnpm lens → http://localhost:7777
```

## P2 acceptance

1. **Liability kinds:** `credit` | `loan` on `FundingAccountKind`. Plaid maps
   credit/loan/investment instead of collapsing to checking. Liquid runway
   excludes brokerage **and** liabilities.
2. **Net worth:** `computeNetWorth` = liquid + invested − credit/loan.
   Can be negative. CLI `attache net-worth`, MCP `get_net_worth`,
   web `/app/net-worth` (More overflow). Honest empty when no accounts.
3. **Cash-flow:** posted txs only, default last 30 UTC days, buckets by
   `category` (`(uncategorized)` when null). CLI `attache cashflow`,
   MCP `get_cashflow`, web `/app/cashflow` + `att-cashflow-bar`.
   No Sankey.
4. **Recategorize:** `setTransactionCategory`; CLI
   `attache activity recategorize <id> --category … | --clear`;
   MCP `set_transaction_category`. Unknown id throws.
5. **Lens:** liability account rows, negative money, cash-flow empty/error
   stories, net-worth pattern.

```bash
attache accounts create --name Visa --balance 400 --kind credit
attache net-worth
attache plaid connect-sandbox
attache cashflow
attache activity recategorize <id> --category Groceries
# Web: Home net-worth stat; More → Net worth / Cash flow
```

## P3 acceptance

1. **Trend domain:** `priorCashflowRange` is equal length, no overlap.
   `computeCashflowTrend` compares outflow by category (Δ and Δ% with
   `null` when prior is 0). Daily series fills zeros only when the
   **current** window has at least one posted tx — empty → `series: []`.
2. CLI `attache cashflow trend [--from] [--to]`; MCP `get_cashflow_trend`.
3. Web `/app/cashflow` shows outflow vs prior, `att-cashflow-trend`
   sparkline, and a category Δ table. No Sankey.
4. Negative space: both windows empty → no sparkline, no delta rows.
   Inverted dates throw.

```bash
attache cashflow trend
attache cashflow trend --from 2026-08-01 --to 2026-08-15
```

## Out of scope (P3)

Sankey diagrams; mesh / shared household view (BL-1, parked).
