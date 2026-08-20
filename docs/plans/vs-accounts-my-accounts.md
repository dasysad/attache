# Slice 1 — Accounts ingest → My Accounts

**Status:** ✅ shipped  
**Parent:** [vertical-slices-readiness.md](./vertical-slices-readiness.md)

## Goal

Close the loop: create/connect funding accounts and see them on one **My Accounts**
surface (CLI + web), without a dead-end setup gate — agent-first.

## Acceptance

1. `attache onboard` creates a tenant without a browser (MCP `onboard` too).
2. Manual: `attache accounts create` (MCP `create_account`).
3. Plaid: existing `plaid connect*` / `sync` upsert into the same list.
4. `attache accounts list` and `/app/accounts` (**My Accounts**) show all rows.
5. Setup wizard does not redirect away from `/app/accounts` when accounts exist;
   `/app/plaid` reachable during setup (Plaid-first OK).
6. After Plaid connect/sync, UI lands on / links to My Accounts.
7. MCP `list_accounts` returns the same rows.

## Out of scope

Unlink, ACH, mesh, MCP transfer approve (slice 2).
