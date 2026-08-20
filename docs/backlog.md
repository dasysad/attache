# Attache backlog

Future work **not** in the current standalone prototype sprint. Items stay
designed (ADRs, schema hooks) but unimplemented until explicitly pulled.

## Post-v1 — multi-device & household

| ID | Feature | Depends on | Notes |
|----|---------|------------|-------|
| **BL-1** | VS-7 Household mesh | Celestial mesh lib | LAN sync, encrypted envelopes, `MeshTransport` port (ADR-003) |
| **BL-2** | VS-8 Merge wizard | BL-1, ADR-002 | Two tenants → union or link-only |
| **BL-3** | Ledger primary election | BL-1, LedgerPort | One writer per tenant; secondaries read snapshots |
| **BL-4** | Partner linked device | BL-1 | Second adult device without merge |

**Mesh lib note:** Starsystem may ship mesh together with **process-manager** and
**vault-sync** primitives. Attache will consume via adapter when stable — not
block standalone on SS internal packaging.

## Post-v1 — platform & revenue

| ID | Feature | Notes |
|----|---------|-------|
| BL-5 | VS-9 Premium + SnapTrade | ✅ read-only ingest shipped ([plan](./plans/vs-snaptrade-brokerage.md)); premium billing gate deferred |
| BL-6 | VS-10 Android notification reader | ✅ P0 API shipped ([plan](./plans/vs-android-fcm.md)); Kotlin companion follow-on |
| BL-7 | VS-11 Credential hygiene | ✅ P0 HIBP + shortlist ([plan](./plans/vs-credential-hygiene.md)); not a password manager |
| BL-8 | Hosted mail ingress | ✅ P0 BYO Mailgun ([plan](./plans/vs-hosted-mail-ingress.md)); Attache SMTP still out |
| BL-9 | ZK cloud backup (R2) | Optional tier |
| BL-10 | WorkOS app identity | Separate from Gmail OAuth (ADR-008) |

## Post-v1 — money movement

| ID | Feature | Notes |
|----|---------|-------|
| BL-11 | TigerBeetle + LedgerPort P1 | ADR-001 · [plan](./plans/vs-tigerbeetle-ledger.md) ✅ |
| BL-12 | Licensed ACH / autonomous rules | [ADR-013](./adr/013-licensed-ach-rail.md) HITL ✅; rules P0 ✅ ([plan](./plans/vs-transfer-rules.md), [ADR-017](./adr/017-transfer-rules-typed-local-policies.md)); CEL/Starflow later |
| BL-13 | Starflow transfer DAGs | After LedgerPort |

## Active — v1 hardening ([roadmap](./plans/v1-hardening-roadmap.md))

Post-packaging trust-and-truth work. Not backlog — in progress.

| Slice | Deliverable | Status |
|-------|-------------|--------|
| **VS-8** | Encryption at rest ([plan](./plans/vs-8-encryption-at-rest.md), [ADR-011](./adr/011-encryption-at-rest.md)) | ✅ complete |
| **LedgerPort P0** | Double-entry SQLite journal ([plan](./plans/ledger-port-p0.md), [ADR-001](./adr/001-tigerbeetle-financial-ledger.md)) | ✅ complete |
| Plaid prod + eval | Production keys + extraction accuracy ([plan](./plans/plaid-production-ingestion-eval.md)) | ✅ complete |
| Packaging polish | Notarize, Intel DMG, auto-update ([plan](./plans/vs-4-packaging-polish.md)) | ✅ complete |
| **My Accounts** | Agent onboard + accounts create/list ([plan](./plans/vs-accounts-my-accounts.md)) | ✅ complete |

## Active — standalone packaging (VS-7)

See [vs-7-standalone-packaging.md](./plans/vs-7-standalone-packaging.md). Not backlog — in progress.

| Phase | Deliverable |
|-------|-------------|
| 1 | `dasysad/homebrew-tap` + CLI Formula | ✅ |
| 2 | `packages/attache-desktop` (Tauri) + DMG + Cask | ✅ arm64 DMG + Cask shipped (desktop-v0.1.0) |
| 3 | Signing, R2 CDN, auto-update | ✅ slice 4 — signing + updater ([vs-4](./plans/vs-4-packaging-polish.md)); R2 mirror still backlog |

## Explicit non-goals (unchanged)

- Universal assistant / 24 channels
- Trade execution
- Attache as a bank

## Pull order (post readiness slices)

See [next-backlog-order.md](./plans/next-backlog-order.md):

1. **BL-5 SnapTrade** ✅ → 2. **BL-11 TigerBeetle** ✅ → 3. **BL-12 ACH** ✅ (HITL) → 4. **UI polish** (ADR-014 P3 shipped) → 5. **Obligations CLI/MCP** ✅ → 6. **Discovery onboard P1–P4** ✅ → 7. **BL-6 FCM API** ✅ → 8. **BL-7 hygiene** ✅ → 9. **BL-8 Mailgun** ✅ → 10. **BL-12 transfer rules** ✅ (ADR-017 P0)  
Mesh **BL-1–4** parked until Starsystem/Orbit mesh lib lands.

## Current sprint (standalone prototype)

See [AGENTS.md](../AGENTS.md). Active work does **not** include BL-1–BL-4.
