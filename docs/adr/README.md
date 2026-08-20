# Architecture Decision Records

ADRs capture significant architectural decisions for Attache. Status flows:
`proposed → accepted → deprecated`.

To add a new ADR, create `NNN-short-title.md` using the next available number
and add an entry to the index below.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [001](./001-tigerbeetle-financial-ledger.md) | TigerBeetle as financial ledger substrate | accepted |
| [002](./002-tenant-household-and-merge.md) | Tenant, household scope, and merge wizard | proposed |
| [003](./003-mesh-sync-substrate.md) | Household mesh sync substrate | proposed |
| [004](./004-ingestion-pipeline.md) | Financial and document ingestion pipeline | proposed |
| [005](./005-notification-channels.md) | Notification and alert channels | accepted |
| [006](./006-pricing-and-premium-tiers.md) | Pricing, Plaid pass-through, and premium tiers | proposed |
| [007](./007-email-ingest-strategy.md) | Email ingest: IMAP first, BYO Mailgun opt-in | accepted |
| [008](./008-gmail-oauth-local-vault.md) | Gmail OAuth ingest: local vault, CLI-first; WorkOS ≠ Gmail | accepted |
| [009](./009-standalone-first-mesh-deferred.md) | Standalone app first; mesh deferred to backlog | accepted |
| [010](./010-release-pipeline-starflow.md) | Starflow + GitHub DMG + Homebrew distribution | accepted |
| [011](./011-encryption-at-rest.md) | Encryption at rest: SQLCipher cipher + scrypt envelope key | accepted |
| [012](./012-desktop-signing-and-updates.md) | Desktop signing, notarization, and auto-update | accepted |
| [013](./013-licensed-ach-rail.md) | Licensed ACH via Plaid Transfer | accepted |
| [014](./014-household-command-center-ui.md) | Household command-center UI (views + features) | accepted |
| [015](./015-discovery-onboard.md) | Low-friction discovery onboarding (Gmail → HITL → connect) | accepted |
| [016](./016-credential-hygiene-not-a-password-manager.md) | Credential hygiene is not a password manager | accepted |
| [017](./017-transfer-rules-typed-local-policies.md) | Transfer rules as typed local policies | accepted |

## Related

- [Attache v1 PRD](../prd/attache-v1.md)
- [Mesh lib consumer requirements](../specs/mesh-lib-consumer-requirements.md) (Starsystem handoff)
