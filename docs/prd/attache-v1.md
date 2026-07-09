# Attache v1 — Product Requirements Document

- **Status:** draft
- **Date:** 2026-06-22
- **Audience:** engineering, agents, dogfooders

## Summary

Attache is a **focused life-finance attache** for US households: solvency
forecasting, obligations, calendar with provenance, read-only investments,
document/email ingestion, and (v1.1) rules-based money movement via licensed
rails. Not a universal assistant.

**Positioning:** Local-first standalone app first; household mesh sync in backlog
(ADR-009). Transparent aggregation pricing, premium agents and workflows.

## Goals

| Goal | Metric (dogfood) |
|------|------------------|
| 5-minute onboarding to useful forecast | Manual path, no Plaid required |
| Know if bills are covered 30 days out | Runway visible on dashboard |
| Ingest a PDF bill → obligation | < 2 min with HITL confirm |
| Agent answers "can we afford X?" | MCP tool with forecast context |
| Household two-device sync | **Backlog** — post standalone prototype (ADR-009) |

## Non-goals (v1)

- Password manager or universal automated password rotation across all personal
  web accounts (see [credential hygiene plan](../plans/credential-hygiene-future.md))
- Universal assistant / 24 chat channels
- Trade execution
- Autonomous transfers (v1.1 with licensed rail)
- Rule/condition builder UI (v1.1 — static roles + templates only)
- Business / real estate modules (v2)
- iOS app
- Building our own Plaid/bank aggregator
- **Household mesh / multi-device sync** (v1) — see [backlog](./backlog.md), ADR-009

## Personas

1. **Household CFO** — adult, owns billing, links Plaid, sets obligations.
2. **Partner (linked)** — separate or merged tenant, view or co-manage grants.
3. **Shadow child** — profile only; parent manages; teen may get view-only login.
4. **Agent** — Spacecraft MCP client operating under permission bounds.

## Architecture summary

See ADRs 001–006. Stack:

- **TS/Hono + htmx + Lit/Lens** — web
- **SQLite + SQLCipher** — local SoT for domain data
- **TigerBeetle** — ledger (primary site per tenant)
- **Starflow** — ingestion, notify, merge workflows
- **Spacecraft** — agent MCP
- **@celestial/mesh-core** — household sync (**backlog**, ADR-009)
- **Python/Litestar** — ledger sidecar, forecasting (attache-python back-burner except ledger/math)
- **Plaid** — v1 bank ingest; **SnapTrade** — premium read-only
- **R2 + Supabase** — optional ZK cloud backup and auth

## Vertical slices (v1)

| # | Slice | Outcome |
|---|-------|---------|
| VS-0 | Local vault + tenant | Passkey/passphrase, SQLCipher, `site_id` |
| VS-1 | Obligations + forecast | Manual accounts, 30-day solvency, provenance calendar |
| VS-2 | Web dashboard | Runway chart, obligation timeline, onboarding wizard |
| VS-3 | Plaid ingest | Pass-through connect, transaction sync |
| VS-4 | Document + email ingest | PDF bill → obligation pipeline |
| VS-5 | Agent MCP | `get_runway`, `list_obligations`, `propose_transfer` (dry-run) |
| VS-6 | Notifications | Web push + in-app |
| ~~VS-7~~ | ~~Household mesh~~ | **Backlog** [BL-1](./backlog.md) |
| ~~VS-8~~ | ~~Merge wizard~~ | **Backlog** [BL-2](./backlog.md) |
| VS-7 | Standalone packaging | Distributable single-device app (ADR-009) |
| VS-8 | SQLCipher + passphrase | ✅ Encryption at rest — keyring, DB, `attache vault`, server/MCP/desktop unlock ([ADR-011](../adr/011-encryption-at-rest.md)) |
| VS-9 | Premium + SnapTrade | Subscription gate, Connection Portal embed |
| VS-10 | Android reader | FCM push, read-only list (see spec) |
| VS-11 | Credential hygiene (deferred) | Event-driven breach/reuse alerts; HITL-assisted change for finance-linked accounts — see [plan](../plans/credential-hygiene-future.md) |

**v1.1:** Rule builder UI, licensed ACH execution, autonomous rules, Telegram notify.

## Event model (calendar + obligations)

Every `Event` and `Obligation` includes:

```typescript
provenance: "native" | "caldav" | "google" | "ics" | "plaid" | "email" | "document" | "agent" | "rule";
authority: "attache" | "external";   // who wins on edit conflict
source_ref?: string;
managed_externally: boolean;
```

User-configurable calendar SoT: native calendar with optional CalDAV/Google sync.
Payment due dates generated from obligations are `provenance: rule`.

## Money movement (v1 vs v1.1)

| Capability | v1 | v1.1 |
|------------|-----|------|
| Forecast / solvency | ✅ | ✅ |
| Agent propose transfer | ✅ dry-run | ✅ |
| HITL approve | ✅ UI queue | ✅ + notify |
| Autonomous rules | ❌ | ✅ via Dwolla/Moov/Astra |
| Attache as bank | ❌ never | ❌ |

## attache-python disposition

**Back-burner** except:

- TigerBeetle `LedgerPort` + Litestar HTTP service (if ADR-001 proceeds)
- Forecasting / categorization when TS is insufficient

Shelve: web scraping adapters, JSON scraped-data store, Fernet credential files.

## Open items

- Credential hygiene scope vs integration with OS/1Password vault (VS-11)
- Premium monthly price point
- Plaid processing fee (0% vs small markup)
- OCR vendor for document pipeline
- Legal: parent attestation, Plaid/SnapTrade disclosures

## References

- [ADR index](./adr/README.md)
- [Pricing & unit economics](./pricing-unit-economics.md)
- [Document OCR strategy](./document-ocr-strategy.md)
- [Android notification reader spec](./specs/android-notification-reader.md)
