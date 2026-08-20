# Vertical slice — Discovery onboarding

**Status:** P4 shipped  
**Parent:** [ADR-015](../adr/015-discovery-onboard.md)  
**Date:** 2026-08-16

## Goal

A household (or agent) can go from empty vault to a useful command center
with **minimal typing**: find bills/statements/invoices in Gmail (or IMAP),
confirm what matters, then add cards/banks/investments — or skip any of
those and use manual accounts/obligations.

## Current state (after P3)

| Step | Human | Agent |
|------|-------|-------|
| Household | Web `/onboard` or CLI | `onboard` / MCP `onboard` |
| Accounts | Wizard + My Accounts | `accounts create`, Plaid, SnapTrade |
| Bills | Wizard + `/app/obligations` | `obligations create` / `paid` |
| Mail | CLI Gmail OAuth | MCP `gmail_connect_sandbox` |
| Discover | Wizard `/onboard/discover` + CLI | MCP `ingest_discover` |
| Statements | Wizard `/onboard/connect` + Connect cards | `nextCommands` |
| Institution hints | Hide when a matching Plaid/SnapTrade name is linked | same |

Live Gmail first-sync: `(bill OR invoice OR statement) newer_than:{days}d` (cap 40).
Filter: `isLikelyBillEmail` (keywords required; newsletters dropped).
Confirm → `createObligationFromIngest` for **bills only**.

## P0 — obligations parity (shipped)

See [vs-obligations-parity.md](./vs-obligations-parity.md).

Agents can fill remaining bills without the web form. Discovery still
depends on this path for “skip mail, type Rent.”

## P1 — discover candidates (shipped)

**One domain function** `discoverMailCandidates`, wrapped by CLI/MCP.
Reuses poll/extract; no second Gmail client.

```bash
attache ingest discover [--days 90] [--limit 40]
attache ingest discover-sandbox   # mixed bill + Chase statement + newsletter (dropped)
```

MCP: `ingest_discover` `{ lookbackDays?, limit?, sandbox? }`.

### Acceptance (met)

1. After Gmail (or sandbox) connect, `discover` returns a **ranked** list
   (bills/invoices first, then statements). Empty list is OK.
2. Bill/invoice rows reuse `ingested_event` ids so `confirm` still works.
3. Newsletter / marketing mail is **not** a bill. A statement without
   extractable amount is a connect hint (`amountUsd` null), not an obligation.
4. Lookback default 90 days; `--limit` hard-caps at 40 (unbounded values clamp).
5. Not onboarded / no mail account → `DiscoverError` (`not_onboarded` / `no_mail`).
6. Discover does not insert `obligation` or Plaid items.

### Out of scope (P1)

Web wizard redesign, IMAP query widening, asset register, OCR engine swap.

## P2 — statement → connect hint (shipped)

Candidate JSON includes `institutionHint` + `rail` (P1). P2 is the
**human projection**: CLI/MCP `message` + `nextCommands` name
`attache plaid connect` / `attache snaptrade connect`; web Connect (and
Inbox / Banks / Brokerage) shows “Gmail saw a Chase statement — Link?”
Sandbox mail also includes a Fidelity brokerage statement. **Buttons still
start Link** — never silent.

### Acceptance (met)

1. CLI/MCP discover `message` names `attache plaid connect` / SnapTrade when a hint exists.
2. Web Connect surfaces statement hints; Link is a click (`/app/plaid/connect` or sandbox POST).
3. Hint still never creates a funding account by itself (P1 + P2 tests).
4. After a matching Plaid/SnapTrade institution is linked, that hint hides.

## P3 — wizard as projection (shipped)

`/onboard` steps: household → **discover (skip)** → **connect hints (skip)**
→ account if still none → obligation if still none → Home.

`setupWizardPath` / `setupAllowedAppPaths` keep Accounts, Connect, Ingest
reachable. `--complete-setup` still skips the rest.

Web is buttons on the same JSON as `ingest discover` (`listDiscoverCandidates`
on GET — **no poll**). POST `/onboard/discover-sandbox` / `discover/run` calls
`discoverMailCandidates`. Confirm bills via `confirmBillIngest`. Connect step
reuses `connectHintsPanel`. No SPA rewrite.

CLI/MCP `onboard` `next` names `ingest discover-sandbox` / `ingest_discover`
unless `--complete-setup` / `completeSetup`.

### Acceptance (met)

1. After household create, web lands on `/onboard/discover`, not account.
2. Skip discover without Gmail → `/onboard/account` (mail never required).
3. Sandbox discover → connect step until hints are skipped; Link is still a click.
4. GET discover does not poll Gmail; statements are not confirm-as-bill buttons.
5. `--complete-setup` still skips the wizard (`setupWizardPath` null).
6. Confirmed bills skip the typed-obligation step once an account exists.

## P4 — entities and asset hints (thin) (shipped)

Optional. **Not a wizard step** — onboard still finishes without Gmail, Plaid,
or any asset.

**Entities** are payee/institution names projected from obligations and
accounts (`attache entities list` / MCP `list_entities`). No CRM table.

**Assets** are a thin `household_asset` table (`home` | `vehicle`). Discover
classifies property tax → home and auto policy → vehicle. HITL
`attache assets confirm <eventId>` (MCP `confirm_asset`) writes the row.
Estimate is optional; unvalued rows are **omitted** from net worth (not $0).
Manual: `attache assets create --kind home --label …`.

PHI / EOBs stay unpromoted (`isLikelyPhiEmail` drops them before extract).
Discover still does not insert assets, obligations, or funding accounts.

### Acceptance (met)

1. Sandbox discover hints home + vehicle on property-tax / auto-policy bills.
2. Confirming an asset does not create a funding account or store a document.
3. Confirming a bill with an asset hint still works after asset confirm.
4. Statement confirm-as-asset fails. PHI/EOB is absent from candidates.
5. Unvalued assets do not change net worth. Valued ones add `otherAssetsUsd`.
6. Skip onboard still works — no new wizard step.

## Low-friction walkthrough (target dogfood)

**Human, ~10 minutes, Gmail + one bank:**

1. Desktop opens `/onboard` → household name.
2. “Find bills in Gmail” → OAuth (one consent) → discover list.
3. Confirm 2–5 bills; ignore the rest.
4. “Add Chase checking” from a statement hint → Plaid Link.
5. Skip SnapTrade (or sandbox).
6. Home: runway uses the new obligations + account.

**Agent, no browser except live Link:**

```bash
attache onboard --household "Smith" --holder "Alex" --complete-setup
attache ingest discover-sandbox
attache ingest confirm <eventId>
attache assets confirm <eventId>      # optional home/vehicle
attache entities list
attache plaid connect-sandbox
attache accounts list
attache obligations list
attache agent attention
```

**Human, no Gmail, no Plaid:** onboard → `accounts create` →
`obligations create` → Home. That path stays first-class forever.

## Tests (per phase)

P1 (met): sandbox discover → bill candidate `confirm` promotes; newsletter
absent; statement `confirm` refuses; no mail / not onboarded errors;
lookback/limit clamp; second discover reuses event ids; no obligations or
Plaid accounts inserted.

P2 (met): `formatDiscoverMessage` names plaid/snaptrade CLI; Connect HTML
shows “Gmail saw a Chase statement” + explicit Link; empty hub has no
“Mail saw”; matching linked institution hides the hint; still no
`funding_account` from discover.

P3 (met): new tenant → `/onboard/discover`; skip without mail → account;
sandbox discover → `/onboard/connect` until skip; GET discover has skip and
confirm-bill only (no statement confirm, no GET poll); `--complete-setup`
still nulls the wizard.

P4 (met): sandbox discover hints home+vehicle; confirm asset is HITL and
does not insert `funding_account`; bill confirm still works; statement/PHI
cannot become assets; unvalued estimates omitted from net worth; no wizard
step.

## References

- Gmail: `packages/core/src/gmail/live-adapter.ts`, `imap/filter.ts`
- Discover: `packages/core/src/ingest/discover.ts`
- Ingest: `packages/core/src/ingest/bill.ts`, `event.ts`
- Setup: `packages/core/src/setup.ts`
- [ADR-008](../adr/008-gmail-oauth-local-vault.md), [ADR-014](../adr/014-household-command-center-ui.md)
