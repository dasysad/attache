# Vertical slices — readiness & next iterations

**Status:** active  
**Canvas:** Cursor canvas `attache-readiness`  
**Context:** Hardening slices 1–4 are shipped. Focus shifts from infrastructure
to **completing end-to-end user/agent loops**.

## Readiness summary

| Audience | Verdict |
|----------|---------|
| Solo engineer / agent dogfooder | Yes (web onboard once) |
| Single-Mac household (read + forecast) | Soft yes |
| Multi-device + real ACH | No (backlog) |

Infrastructure is ahead of product loops: encryption, ledger P0, live Plaid,
and unsigned dual-arch packaging work. What households and agents feel is
incomplete **slices** (none — readiness vertical slices 1–5 shipped; ACH/mesh backlog).

## Slice status (high level)

| Slice | Ready | Main gap |
|-------|-------|----------|
| Onboard | Yes | CLI/MCP/web; discovery P2 shipped ([ADR-015](../adr/015-discovery-onboard.md)) |
| Accounts list | Yes | Lifecycle shipped |
| Plaid → funding accounts | Yes | Unlink + error UX |
| Obligations | Yes | CLI/MCP create + paid ([plan](./vs-obligations-parity.md)) |
| Transfers / ledger | Yes | Honesty: Plaid ≠ ACH |
| Bill / email ingest | Yes | Reliability + discover P1 |
| Vault | Yes | By design: lost passphrase |
| Desktop / brew | Yes | Unsigned Gatekeeper |

## Target slice 1 — Accounts ingest → My Accounts

**Status:** ✅ shipped — [plan](./vs-accounts-my-accounts.md)

**Acceptance** (met)

1. Agent or human can create a tenant without a browser (CLI/MCP onboard).
2. Agent or human can add funding accounts (manual create **or** Plaid connect/sync).
3. Those accounts appear on one list: `attache accounts list` and `/app/accounts`
   (**My Accounts**).
4. Setup wizard does not redirect away from Accounts / Plaid when mid-wizard.
5. After Plaid connect/sync, UI lands on My Accounts.
6. MCP exposes `list_accounts`, `create_account`, `onboard`.

## Target slice 2 — Agent HITL parity

**Status:** ✅ shipped — [plan](./vs-agent-hitl-parity.md)

**Acceptance** (met)

1. MCP `approve_transfer_proposal` / `reject_transfer_proposal`.
2. MCP `plaid_status`, `plaid_sync`, `plaid_connect_sandbox`.
3. Docs list tools; live Link remains CLI.

## Target slice 3 — Account lifecycle

**Status:** ✅ shipped — [plan](./vs-account-lifecycle.md)

**Acceptance** (met)

1. Core + CLI/MCP/UI `unlink` for Plaid items (vault + accounts + txs).
2. Sync errors fan out to funding `sync_status=error`; plaid page shows codes.
3. `mapPlaidAccountKind` for subtype → checking/savings; My Accounts shows kind.

## Target slice 4 — Ingest → obligation reliability

**Status:** ✅ shipped — [plan](./vs-ingest-obligation-reliability.md)

**Acceptance** (met)

1. Gmail/IMAP `last_error` + unlink + poll retries error accounts.
2. MCP ingest_status / poll / confirm / unlink; CLI unlink.
3. Web shows errors + Unlink on `/app/ingest`.

## Target slice 5 — Transfer honesty

**Status:** ✅ shipped — [plan](./vs-transfer-honesty.md)

**Acceptance** (met)

1. Core `transferHonesty` + propose warnings + approve messages.
2. CLI/MCP/web state clearly: approve ≠ ACH for Plaid legs.
3. UI chips: `approved (no ACH)` / `executed (local ledger)`.

## Subsequent iterations

See [next-backlog-order.md](./next-backlog-order.md):

1. **SnapTrade** (BL-5) — ✅ shipped — [plan](./vs-snaptrade-brokerage.md)  
2. **TigerBeetle** (BL-11) — ✅ shipped — [plan](./vs-tigerbeetle-ledger.md)  
3. **Licensed ACH** (BL-12) — ✅ HITL P0 — [plan](./vs-ach-rail.md)  
4. **UI polish** — P3 ✅ — [ADR-014](../adr/014-household-command-center-ui.md) · [plan](./vs-ui-polish.md)  
5. **Obligations CLI/MCP** — ✅ — [plan](./vs-obligations-parity.md)  
6. **Discovery onboard** — P4 ✅ — [ADR-015](../adr/015-discovery-onboard.md) · [plan](./vs-discovery-onboard.md)  
7. **Android FCM API** (BL-6) — ✅ P0 — [plan](./vs-android-fcm.md)  
8. **Credential hygiene** (BL-7) — ✅ P0 — [plan](./vs-credential-hygiene.md)  
9. **Hosted mail ingress** (BL-8) — ✅ P0 BYO Mailgun — [plan](./vs-hosted-mail-ingress.md)  
10. **Transfer rules** (BL-12) — ✅ P0 — [ADR-017](../adr/017-transfer-rules-typed-local-policies.md) · [plan](./vs-transfer-rules.md)  
Mesh (BL-1–4) parked until Orbit/Starsystem mesh extraction.
## References

- [v1 hardening roadmap](./v1-hardening-roadmap.md)  
- [backlog](../backlog.md)  
- Core: `packages/core/src/account.ts`, `plaid/sync.ts`, `setup.ts`  
- Surfaces: `packages/cli/src/main.ts`, `packages/server/src/views.ts`, `packages/mcp/src/tools.ts`
