# ADR-002: Tenant, household scope, and merge wizard

Area: identity / tenancy

- **Status:** proposed
- **Date:** 2026-06-22
- **Deciders:** founder
- **Depends on:** planning decisions (US-only, local-first)
- **Related:** ADR-003 (mesh), ADR-001 (ledger primary per tenant)

## Context

Attache sells to **customer tenants** but users may start as individuals and expand
to household or business scope on demand. Requirements:

- Subscription billed at **household** level, but architecture must not preclude
  per-individual billing later.
- **Shadow users** (kids, dependents) managed by an account holder; optional
  login later including **view-only** accounts for ages 13–18.
- **Linked account holders** across tenants with explicit permission grants.
- **Merge wizard** to form a household from two or more existing Attache accounts.

## Decision

### Tenant model

```
Tenant
├── billing_plan: free | premium
├── scope: individual | household | business   # expands over time
├── ledger_primary_site_id: SiteId           # one writer per tenant (ADR-001)
└── members[]
      ├── account_holder | shadow | linked_external
      ├── roles[]                            # fine-grained grants
      └── optional_auth: none | view_only | full
```

**Household billing, individual-ready schema:** every monetary and calendar entity
carries `tenant_id` and optional `member_id` (who it belongs to). Premium
entitlements attach to `tenant_id`; a future `billing_subject: tenant | member`
column on `Tenant` allows migration without data remodel.

### Member types

| Type | Auth | Typical use |
|------|------|-------------|
| `account_holder` | Full (passkey/password) | Adult with financial authority |
| `shadow` | None initially | Child profile, managed entirely by holder |
| `shadow` (teen) | `view_only` optional | Ages 13–18: see calendar/obligations, no transfers |
| `linked_external` | Own tenant + grant into yours | Partner with separate Attache account |

Parent attestation for under-13; no direct login. Teen view-only is a role flag,
not a separate product surface.

### Permissions (v1 — static roles, not rule builder)

Grants are enumerated capabilities, not a generic condition builder (v1.1):

- `view_finances`, `view_calendar`, `manage_obligations`, `manage_calendar`
- `propose_transfer`, `approve_transfer`, `authorize_rules`
- `manage_members`, `manage_integrations`

Linked tenants receive a **grant package** at link time (default: shared view
only; opt-in: shared obligation pool).

### Household merge wizard

Triggered when an account holder invites another **existing** Attache user.

**Phases:**

1. **Preview** — side-by-side: accounts, obligations, calendars, conflicts.
2. **Policy** — pick merge mode per domain:
   - *Union* — combine all entities into one tenant.
   - *Link-only* — keep separate tenants; shared forecast view only.
3. **Conflict resolution** — duplicate subscriptions, same bill twice, calendar
   collisions; user picks keep A / keep B / keep both.
4. **Ledger** — designate `ledger_primary_site_id`; secondary accounts become
   read replicas until cutover (ADR-001).
5. **Billing** — surviving tenant inherits premium; secondary tenant archived or
   downgraded to linked profile.

Merge is a **Starflow workflow** with HITL checkpoints — not a single SQL transaction.

**Schedule:** post-dogfood (after solo path + household mesh validate in production use).

### Cross-tenant link (without full merge)

Two adults keep separate tenants but link:

- Shared **forecast dashboard** (read-only across grants).
- Optional **shared obligation pool** (obligations tagged `household_shared`).
- Transfers between tenants always HITL + explicit pairing of funding accounts.

## Consequences

- Schema uses `tenant_id` everywhere from day one.
- Merge wizard is a major v1 feature but can ship after solo onboarding.
- Rule/condition builder deferred to v1.1 (static roles + Starflow templates only).

## Open questions

- Business scope entity model deferred to v2 PRD.
- COPPA: document parent attestation copy in onboarding legal flow.
