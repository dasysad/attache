# Slice 2 — Agent HITL parity

**Status:** ✅ shipped  
**Parent:** [vertical-slices-readiness.md](./vertical-slices-readiness.md)

## Goal

Agents that can **submit** transfer proposals can also **approve/reject** them via
MCP (same as CLI). Agents can check Plaid link state and sync without leaving MCP.

## Acceptance

1. MCP `approve_transfer_proposal` / `reject_transfer_proposal` (id + optional note).
2. MCP `plaid_status` — items, mode, configured flag, linked account count.
3. MCP `plaid_sync` — sync all active items (errors surface as tool result).
4. MCP `plaid_connect_sandbox` — dogfood Link without browser/API keys.
5. Docs list the tools; CLI remains the source of truth for live Link loopback.

## Notes

- Approving a proposal with **manual** legs executes via LedgerPort (`executed`).
- Approving with **Plaid-linked** legs stays `approved` only — no ACH (slice 5 honesty).
- Live Plaid Link stays CLI (`attache plaid connect`) — needs browser/loopback.

## Out of scope

Unlink, live Link in MCP, transfer honesty copy (slice 5).
