# ADR-006: Pricing, Plaid pass-through, and premium tiers

Area: product / billing

- **Status:** proposed
- **Date:** 2026-06-22
- **Deciders:** founder

## Context

- **Read-only** financial view should be free (manual import + basic dashboard).
- **Plaid** costs passed through transparently when user connects banks.
- **Premium** subscription unlocks agents, rules/workflows (execution v1.1+).
- **SnapTrade** is premium-only; SnapTrade charges ~$1–2/connected user/month.

## Decision

### Tiers

| Tier | Price | Includes |
|------|-------|----------|
| **Free** | $0 | Manual import, obligations, calendar (native), runway forecast, web app, local OCR |
| **Platform** | **$4.99/mo** or **$49/yr** ($39 intro yr1) | Agents, Starflow, HITL, mesh cloud relay, fair-use features |
| **Connect** | Platform + **Plaid at cost** | Bank sync; estimator before link |
| **Invest** | Platform + Connect + **SnapTrade at cost** | Premium read-only brokerage |
| **Cloud usage** | Metered | Cloud OCR pages, cloud LLM tokens, R2 GB — see pricing-unit-economics.md |

Billing subject defaults to **household tenant** (ADR-002); schema allows future per-member.

Full analysis: [`docs/prd/pricing-unit-economics.md`](../prd/pricing-unit-economics.md).

### Pass-through transparency

Settings screen shows:

- Plaid linked accounts count × published Plaid rate.
- SnapTrade connected users × SnapTrade rate (premium).
- Estimated monthly total before user confirms connection.

Attache does not subsidize aggregation at launch.

### SnapTrade commercial model

SnapTrade offers:

- **Connection Portal** embed (iframe/React SDK) — co-branded in Attache UI.
- **Pay-as-you-go**: ~$1/day-data or $2/real-time per connected user/month; first 5 free.
- **Custom plan** for volume — contact sales.
- **No public white-label reseller program** — you are the SnapTrade *client*; users
  connect through your portal under your developer account.

v1: Attache holds one SnapTrade client ID; premium users connect via embedded portal.
Pass through cost in Premium tier pricing. BYO SnapTrade developer keys deferred.

### Long-term moat (not v1)

Goal after volume: reduce dependence on Dwolla/Moov/Astra/Plaid. Requires volume
for bank deals. v1 explicitly uses licensed rails and aggregators; no custodial
banking.

## Consequences

- Free tier must be genuinely useful without Plaid.
- Premium pricing must cover SnapTrade + LLM inference margins.
- Marketing must not claim "free bank sync."
