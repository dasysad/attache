# ADR-014: Household command-center UI

Area: product / information architecture

- **Status:** accepted
- **Date:** 2026-08-15
- **Deciders:** founder
- **Related:** ADR-006 (pricing), ADR-011 (vault), ADR-013 (ACH honesty),
  [vs-ui-polish.md](../plans/vs-ui-polish.md)

## Context

Attache already has a solvency forecast, My Accounts, obligations, HITL
transfers with honesty chips, Plaid/SnapTrade/ingest connections, and
encryption at rest. The web shell is a **dogfood projection** of CLI/MCP —
agent-first — but the human surface is a flat nav of ten peer links and a
dashboard that lists accounts + bills without a household **command center**.

Consumer tools we are compared to (Firefly III, Monarch Money, YNAB, Copilot
Money, Actual Budget, Empower) are either:

- **books + widgets** (Firefly) — powerful, overwhelming, ops-heavy;
- **pretty all-in-one dashboards** (Monarch, Empower) that still fail on
  bank sync and do not change spending behavior;
- **methodology apps** (YNAB) that demand a ritual most households will not
  keep;
- **beautiful but gated** (Copilot: Apple-only, no real couples mode).

We need a view map that is **best at Attache’s job** (household CFO:
solvency, obligations, honest money movement, agent-operable, local-first)
rather than a clone of any of those products.

## Competitor matrix (features vs complaints)

| Product | What they do well | Recurring complaints | Attache response |
|---------|-------------------|----------------------|------------------|
| **Firefly III** | Double-entry books, bills, piggy banks, reports, REST API, self-hosted | Dashboard dense/overwhelming, especially mobile; customization refused as maintenance burden ([#8234](https://github.com/firefly-iii/firefly-iii/issues/8234), [#2955](https://github.com/firefly-iii/firefly-iii/issues/2955)); balances can lag; Docker/importer ops; no first-party native mobile | **Fixed command center**, not 12 widgets. No expense/revenue accounts in My Accounts. No self-host stack for the household. |
| **Actual Budget** | Local-first envelopes; cleaner than Firefly | Weaker long history/reporting; envelope methodology | Keep **local-first**. Do **not** copy envelopes. Runway is the daily question. |
| **Monarch Money** | All-in-one home (budget + investments + net worth + goals); best **household/couples** sharing; Sankey; 3 aggregators | Bank sync still fails; 7-day trial needs a card; **pretty dashboard does not change behavior**; some flows require a bank link; duplicates / lost edits; shallow investments | **Works without a bank link.** Sync errors are first-class. Investments stay read-only (SnapTrade) — do not fake depth. |
| **YNAB** | Zero-based “give every dollar a job”; behavior change | **YNAB fatigue** (micromanage every txn); steep learning curve; price; sync breaks; weak investments; partner = shared login; no offline | **Solvency + HITL**, not zero-based. Manual accounts are the fallback when sync dies. |
| **Copilot Money** | Best-looking register + AI categorization | **Apple-only** (largest complaint); no real couples mode; limited web | Cross-platform web + desktop. Household is the tenant. |
| **Empower / Origin** | Net-worth command center | Sync/re-auth; undeletable presets; tracker not coach | Command center answers **“can we cover bills?”** first. Coaching = HITL queue + overdue, not a score. |

### Gaps we exploit (do not copy)

1. **Command center without clutter** — Monarch density without Firefly’s 12 widgets.
2. **Solvency first** — runway and upcoming obligations, not buried in a budget.
3. **Works without a bank link** — manual accounts are first-class (Mint/Monarch complaint).
4. **Honest money movement** — approve ≠ ACH (unique; ADR-013).
5. **Agent-first** — CLI/MCP is the primary operator; UI is a projection.
6. **Local-first + encryption** — no cloud required (ADR-011).
7. **Household HITL** without YNAB ritual or a forced shared login.
8. **Sync errors visible** — unlink/lifecycle already in CLI; surface them on Home.

## Decision

The web UI is a **household command center**: a thin SSR projection of the
same operations agents run. It is **not** a consumer SPA, not YNAB, and not
Firefly’s customizable dashboard.

### Jobs to be done (in order)

1. Can we cover the next 7–30 days of bills? (**solvency**)
2. What needs a human now? (**attention**: overdue, HITL, sync errors, ingest review)
3. What do we own, liquid vs invested? (**accounts**)
4. What is due, and what just posted? (**obligations + activity**)
5. What money movement is in flight, and is it real ACH? (**transfers**)
6. Are connections healthy? (**Plaid / SnapTrade / ingest**)

### Information architecture

| View | Path | Job | vs competitors |
|------|------|-----|----------------|
| **Home / command center** | `/` | Runway + liquid vs invested + upcoming bills + HITL + connection health + recent activity | Monarch home **without** 12 widgets |
| **My Accounts** | `/app/accounts` | Group by kind (checking / savings / cash / brokerage / credit / loan); balances; provenance + sync chips; manual edit | Firefly account types without expense/revenue in the household list |
| **Activity** | `/app/activity` | Transaction register (Plaid/manual), filter later | Copilot/Monarch register; we already store `bank_transaction` |
| **Bills** | `/app/obligations` | Timeline, confirm ingest, mark paid | Firefly bills — Attache is already stronger (HITL confirm) |
| **Transfers** | `/app/transfers` | Queue + honesty chips (`approved` / `ach_pending` / `executed`) | Unique |
| **Alerts** | `/app/notifications` | Action-required and warnings | Keep |
| **Connections** | `/app/connections` | Hub: Plaid, SnapTrade, Gmail/IMAP ingest | Stop polluting primary nav |
| **Investments** | `/app/snaptrade` | Read-only positions / sync | Monarch complaint: shallow — **do not overbuild** |
| **Pricing / Costs** | `/pricing`, `/app/costs` | Honest receipts (ADR-006) | Demote to footer / More |
| **Net worth** | `/app/net-worth` | Liquid + invested − credit/loan | More overflow — not a Monarch dashboard |
| **Cash flow** | `/app/cashflow` | Posted spend by Plaid category | More overflow — bars, not Sankey |
| **Vault** | `/vault/unlock` | Encryption status when locked | Unique |

Primary nav (human daily): **Home · Accounts · Bills · Activity · Transfers · Alerts**.

Overflow: **Connect** (Plaid / SnapTrade / Ingest) and **More** (Pricing / Costs / Net worth / Cash flow).

### Features we will ship (phased)

| Phase | Features |
|-------|----------|
| **P0 — this slice** | IA regroup; Home attention strip + grouped accounts + liquid vs brokerage stats; Accounts grouped by kind; Activity register; Connections hub; `--att-*` tokens wired; mobile nav wrap; active nav; CLI/MCP `attention` |
| **P1** | Activity filters (account, pending, date); per-account register; SnapTrade positions on Investments (read-only, not a Bloomberg); Lens tokens (themes, borders, fonts) |
| **P2** | ✅ Net worth (assets − liabilities) with `credit`/`loan` kinds; cash-flow by existing Plaid `category`; recategorize via CLI/MCP. Honest empty — no Sankey. |
| **P3** | ✅ Spending trends (current vs prior equal-length window + daily outflow). No Sankey. Mesh household view still parked (BL-1). |

### Explicit non-goals

- YNAB envelopes / zero-based “give every dollar a job”
- Firefly-style widget customization or 12-panel dashboards
- Apple-only (or any single-OS) client as the human surface
- Bank-link-required onboarding
- Deep investment analytics (tax lots, performance attribution)
- Bill pay / originating ACH from the dashboard (HITL + CLI remain the rails)
- Consumer SPA rewrite (keep Hono SSR + Lit primitives)

## Alternatives considered

| Option | Verdict |
|--------|---------|
| **Clone Monarch home** | Looks finished; hides solvency; requires bank link; we would inherit sync-failure UX |
| **Clone Firefly** | Correct books, wrong household job; ops and overwhelm |
| **Clone YNAB** | Methodology lock-in; fatigue; not our wedge |
| **Skip web, CLI only** | Agents are primary, but the household still needs a shared screen for HITL and runway |
| **Dashboard customization** | Firefly already proved this is a maintenance trap |

## Consequences

- CLI/MCP remain source of truth; every Home attention item has a `cliHint`.
- Nav gets shorter; connection tools move under Connect.
- Home is allowed to be **opinionated** (fixed sections). Users who want
  Grafana can wait for P3 exports — we will not ship a widget editor.
- P2 shipped liability kinds + category cash-flow. Empty charts stay forbidden;
  `/app/net-worth` and `/app/cashflow` sit under More, not primary nav.
- P3 is period-over-period spend, not a Sankey and not a mesh couples view.

## Implementation plan

See [vs-ui-polish.md](../plans/vs-ui-polish.md). P0 is the command-center
slice; later phases stay in this ADR’s view map.
