# Next backlog order (post readiness slices 1–5)

**Status:** active  
**Date:** 2026-08-15

## Decision

| Order | Work | Why |
|-------|------|-----|
| 1 | **SnapTrade** (BL-5 / VS-9 read-only) | ✅ shipped ([plan](./vs-snaptrade-brokerage.md)) |
| 2 | **TigerBeetle** (BL-11) | ✅ shipped — [plan](./vs-tigerbeetle-ledger.md) |
| 3 | **Licensed ACH** (BL-12) | ✅ HITL P0 — [plan](./vs-ach-rail.md); autonomous rules deferred |
| 4 | **UI polish pass** | P3 shipped — [ADR-014](../adr/014-household-command-center-ui.md) · [plan](./vs-ui-polish.md); Sankey + mesh view still out |
| 5 | **Obligations CLI/MCP** | ✅ shipped — [plan](./vs-obligations-parity.md) |
| 6 | **Discovery onboard P1** | ✅ shipped — [plan](./vs-discovery-onboard.md) |
| 7 | **Discovery onboard P2** | ✅ shipped — connect-hint copy; still no auto-Link |
| 8 | **Discovery onboard P3** | ✅ shipped — wizard as projection of discover JSON |
| 9 | **Discovery onboard P4** | ✅ shipped — thin entity/asset hints (optional; not a wizard step) |
| 10 | **Android FCM API** (BL-6) | ✅ P0 shipped — [plan](./vs-android-fcm.md); Kotlin companion follow-on |
| 11 | **Credential hygiene** (BL-7) | ✅ P0 shipped — [plan](./vs-credential-hygiene.md); no password store |
| 12 | **Hosted mail ingress** (BL-8) | ✅ P0 BYO Mailgun — [plan](./vs-hosted-mail-ingress.md) |
| 13 | **Credential hygiene P2** (BL-7) | ✅ assisted change HITL — [plan](./vs-credential-hygiene.md) |
| 14 | **ACH autonomous rules** (BL-12) | ✅ P0+P1 — [plan](./vs-transfer-rules.md) · [ADR-017](../adr/017-transfer-rules-typed-local-policies.md) |
| 15 | **SendGrid inbound** (BL-8) | Parked — BYO like Mailgun; not next |
| 16 | **ACH webhooks** (BL-12 P2) | ✅ shipped — `POST /api/ach/webhook` |
| 17 | **Household basics UI** (ADR-014 P4+) | ✅ A–D + F + setup hub — [plan](./vs-ui-household-basics.md) |
| 18 | **Premium billing gate** (BL-5) | ADR-006 soft gate |
| 19 | **ZK R2 backup** (BL-9) | Optional tier |
| 20 | **WorkOS app identity** (BL-10) | Separate from Gmail OAuth |
| 21 | **Starflow transfer DAGs** (BL-13) | After autonomous rules |
| 22 | **Rules / ACH UI** | ✅ [vs-ui-automation.md](./vs-ui-automation.md) |
| — | **Mesh** (BL-1–4) | **Parked** |
| — | **Kotlin companion** (BL-6) | **Skipped for now** — API shipped |

## Non-goals for SnapTrade slice

- Premium billing gate (soft-document ADR-006; env keys or sandbox for dogfood)
- Trade execution
- BYO SnapTrade developer keys

## References

- [vs-snaptrade-brokerage.md](./vs-snaptrade-brokerage.md)
- [ADR-004](../adr/004-ingestion-pipeline.md), [ADR-006](../adr/006-pricing-and-premium-tiers.md)
- [backlog.md](../backlog.md)
