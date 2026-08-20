# VS-5.1 — HITL transfer approval queue

**Status:** complete  
**Builds on:** [VS-5](./vs-5.md) dry-run, [VS-6](./vs-6.md) notifications

## Outcome

Agents propose transfers; humans approve or reject in a persisted queue. Manual account balances update on execute; no licensed ACH rails.

| Item | Status |
|------|--------|
| `transfer_proposal` table | ✅ |
| `createTransferProposal` → dry-run + enqueue | ✅ |
| Approve / reject with audit fields | ✅ |
| Execute on approve (manual accounts only) | ✅ |
| Transfer honesty copy (Plaid ≠ ACH) | ✅ (slice 5) |
| Web queue `/app/transfers` | ✅ |
| `hitl_transfer` notification | ✅ |
| CLI `attache transfer *` | ✅ |
| MCP `submit_transfer_proposal`, `list_transfer_proposals` | ✅ |
| MCP `approve_transfer_proposal`, `reject_transfer_proposal` | ✅ (slice 2) |

## Flow

1. Agent/CLI/MCP calls `submit_transfer_proposal` (or web form).
2. Core runs `proposeTransfer` dry-run, stores snapshot + `allowed` flag.
3. Notification: `hitl_transfer:pending` → `/app/transfers`.
4. Human **Approve** (only if `allowed`):
   - **Manual from + manual to:** balances updated → status `executed`.
   - **Plaid leg involved:** status `approved` only (no fake bank movement).
5. **Reject** → status `rejected`.

## Commands

```bash
# Dry-run only (not queued)
pnpm attache agent propose-transfer --from <id> --amount 100

# Queue for approval
pnpm attache transfer submit --from <id> --amount 100 --to <id>
pnpm attache transfer list --pending
pnpm attache transfer approve <proposalId>

open http://localhost:8780/app/transfers
```

## MCP

| Tool | Purpose |
|------|---------|
| `propose_transfer` | Dry-run simulation only |
| `submit_transfer_proposal` | Enqueue for HITL |
| `list_transfer_proposals` | Read queue |
| `approve_transfer_proposal` | HITL approve (+ ledger execute for manual) |
| `reject_transfer_proposal` | HITL reject |

Also: `plaid_status`, `plaid_sync`, `plaid_connect_sandbox` — see [vs-agent-hitl-parity.md](./vs-agent-hitl-parity.md).

## Next

- **Transfer honesty** (slice 5) — UI/MCP copy for Plaid ≠ ACH
- **VS-7** — mesh (when lib available)
