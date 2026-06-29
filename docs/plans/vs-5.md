# VS-5 — Agent MCP + CLI

**Status:** complete  
**Depends on:** VS-1 forecast, VS-0 onboard

## Goal

Expose household solvency to agents via MCP stdio and `attache agent` CLI — read-only + dry-run transfer proposals (no money movement).

## Tools (MCP + CLI parity)

| Tool / command | Core function | Notes |
|----------------|---------------|-------|
| `get_runway` / `agent runway` | `getRunwaySnapshot` | Liquid balance, runway days, due in 7d |
| `list_obligations` / `agent obligations` | `listObligationsForAgent` | Filter: all, upcoming, overdue, unpaid |
| `propose_transfer` / `agent propose-transfer` | `proposeTransfer` | **dry-run only** — `allowed` false on blockers |
| `attache_status` | `isOnboarded` + `listAccounts` | MCP-only onboarding hint |

## Package layout

```
packages/core/src/agent/   # runway, obligations, transfer
packages/mcp/              # @attache/mcp stdio server
packages/cli/              # agent subcommands
mcp.example.json           # Cursor MCP config template
```

## Run MCP server

```bash
pnpm mcp:build
pnpm mcp:start
# or after build: node packages/mcp/dist/main.js
```

### Cursor (`~/.cursor/mcp.json`)

Copy from [mcp.example.json](../../mcp.example.json) and set your repo path in `--dir`.

## CLI

```bash
pnpm attache agent runway [--days 30]
pnpm attache agent obligations [--filter unpaid]
pnpm attache agent propose-transfer --from <accountId> --amount 500 [--to <id>]
```

## Design constraints

- `proposeTransfer` always returns `dryRun: true` (PRD v1 — no payment rails).
- Internal transfers (from + to) do not change total liquid balance.
- Outbound (no `toAccountId`) reduces liquid balance and may shorten runway.
- Blockers: insufficient source balance, insolvency within horizon.

## Tests

```bash
pnpm --filter @attache/core test    # agent/*.test.ts
pnpm --filter @attache/mcp test
```

## Next

- **VS-6** — notifications / alerts
- **VS-5.1** — HITL transfer approval queue (when rails exist)
