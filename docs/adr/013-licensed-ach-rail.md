# ADR-013: Licensed ACH via Plaid Transfer

Area: finance / payments

- **Status:** accepted
- **Date:** 2026-08-15
- **Deciders:** founder
- **Related:** ADR-001 (ledger), ADR-006 (pass-through pricing), BL-12,
  [vs-transfer-honesty.md](../plans/vs-transfer-honesty.md)

## Context

HITL transfer approve is honest today: **manual** legs post to the local ledger;
**Plaid/SnapTrade** legs stay `approved` (consent only). Households still cannot
move bank money. v1.1 PRD names licensed rails (Dwolla / Moov / Astra / Plaid
Transfer). We already store Plaid access tokens in the vault and map funding
accounts to `plaid_account_id`.

Attache must **not** become a bank or money transmitter. A licensed partner
originates ACH. Autonomous rules (sweeps without HITL) are a later slice.

## Decision

Use **Plaid Transfer** as the first `AchPort` implementation.

| Mode | When | Behavior |
|------|------|----------|
| **Off** (default) | `ATTACHE_ACH` unset | Unchanged honesty: Plaid legs = consent only |
| **Sandbox** | `ATTACHE_ACH=sandbox` | `FakeAchAdapter` — dogfood A2A without Transfer production access |
| **Live** | `ATTACHE_ACH=plaid` + Plaid keys | `/transfer/authorization/create` + `/transfer/create` (debit then credit) |

Eligible HITL proposals: **both legs Plaid-linked** (household A2A). Approve
submits ACH (`ach_pending`). `attache ach simulate` (sandbox) or `ach sync`
(poll) marks **posted**, then LedgerPort posts (`executed`). SnapTrade,
manual↔Plaid mixed, and outbound-with-no-`to` stay `approval_only`.

ACH credentials stay in the existing Plaid vault refs. Amounts are decimal
strings at the rail; the ledger still uses integer cents.

### Layering

```
HITL approve
  ├─ all-manual     → LedgerPort (today)
  ├─ Plaid A2A + ACH on → AchPort.submit → ach_pending → settle → LedgerPort
  └─ otherwise      → approved (consent only)
```

Plaid Transfer A2A is two rail payments through Plaid’s FBO (debit source,
credit destination). Live production needs a **funded Transfer ledger**; sandbox
does not. Attache never holds customer deposits.

## Alternatives considered

| Option | Verdict |
|--------|---------|
| **Dwolla / Moov / Astra** | Valid licensed partners; extra vendor + customer/funding-source mapping. Defer until Plaid Transfer is insufficient. |
| **Plaid Transfer only for debit-to-platform** | Incomplete household story (no savings sweep). |
| **Same-bank “book transfer”** | Not available via Plaid; would require each bank’s API. |
| **Default ACH on** | Would change honesty for every Plaid dogfood approve. Stay opt-in. |
| **Autonomous rules in this slice** | PRD v1.1; needs policy caps + Starflow. Separate follow-up. |

## Consequences

- Agents can `attache ach status` / MCP `ach_status` and see `off|sandbox|plaid`.
- Sandbox copy must say **not a real bank move**.
- Unlink Plaid while `ach_pending` is refused (same as pending proposals).
- Webhooks for live settlement: `POST /api/ach/webhook` when
  `ATTACHE_ACH_WEBHOOK_SECRET` is set (Bearer). Otherwise `ach sync` polls.

## Implementation plan

| Phase | Deliverable |
|-------|-------------|
| **P0** | `AchPort` + fake adapter + HITL submit/simulate/settle + CLI/MCP ✅ |
| **P1** | Live Plaid Transfer REST + `ach sync` against real statuses |
| **P2** | Webhook listener / Transfer events ✅ (`ATTACHE_ACH_WEBHOOK_SECRET`) |
| **P3** | Autonomous rules — typed SQLite policies ([ADR-017](./017-transfer-rules-typed-local-policies.md)) ✅ |

**Explicitly deferred:** external payees (routing/account numbers), RTP/wire,
SnapTrade cash sweeps, Attache as originator without Plaid.
