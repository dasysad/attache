# Slice — Obligations CLI/MCP parity

**Status:** ✅ shipped  
**Parent:** [vertical-slices-readiness.md](./vertical-slices-readiness.md)  
**Related:** [ADR-015](../adr/015-discovery-onboard.md) (onboarding uses the same create/paid path)

## Goal

Agents can add bills and mark them paid without the web UI. Same domain as
`/app/obligations` — `createObligation` / `markObligationPaid`. Marking paid
does **not** ACH.

## Acceptance (met)

1. `attache obligations list` (unchanged).
2. `attache obligations create --payee … --amount … --due YYYY-MM-DD`
   `[--cadence once|monthly|yearly] [--autopay] [--notes …]`.
3. `attache obligations paid <id>`.
4. MCP `create_obligation` / `mark_obligation_paid`.
5. Negatives: not onboarded, unknown id, already paid, bad date, empty payee,
   non-positive amount, invalid cadence.

## Out of scope

Gmail discovery, auto-promote, ACH bill-pay, deleting via MCP (web still has
edit/delete). Discovery is [vs-discovery-onboard.md](./vs-discovery-onboard.md).
