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
| BL-5 | VS-9 Premium + SnapTrade | ADR-006 |
| BL-6 | VS-10 Android notification reader | Spec exists; API ready |
| BL-7 | VS-11 Credential hygiene | [plan](./plans/credential-hygiene-future.md) |
| BL-8 | Hosted mail ingress | ADR-007 Phase B (Mailgun/SendGrid) |
| BL-9 | ZK cloud backup (R2) | Optional tier |
| BL-10 | WorkOS app identity | Separate from Gmail OAuth (ADR-008) |

## Post-v1 — money movement

| ID | Feature | Notes |
|----|---------|-------|
| BL-11 | TigerBeetle + LedgerPort P1 | ADR-001 |
| BL-12 | Licensed ACH / autonomous rules | v1.1 PRD |
| BL-13 | Starflow transfer DAGs | After LedgerPort |

## Explicit non-goals (unchanged)

- Universal assistant / 24 channels
- Trade execution
- Attache as a bank

## Current sprint (standalone prototype)

See [AGENTS.md](../AGENTS.md). Active work does **not** include BL-1–BL-4.
