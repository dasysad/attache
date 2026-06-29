# ADR-007: Email ingest strategy (IMAP first, hosted ingress deferred)

Area: data / privacy

- **Status:** accepted
- **Date:** 2026-06-28
- **Deciders:** founder
- **Related:** ADR-004 (ingestion pipeline), ADR-005 (email is ingest not notify), VS-4.1

## Context

VS-4 shipped document upload + HITL review. VS-4.1 added:

- Local **maildrop** (`~/.attache/inbox/{token}/`)
- Generic **webhook** (`POST /api/ingest/email`)
- Litestar **extract sidecar**

Roadmap notes mentioned Mailgun/SendGrid inbound routing for
`bills+{token}@ingest.attache.app`. Those are paid SaaS providers that receive
mail in **plaintext** — a poor fit for local-first / optional ZK positioning
unless explicitly opt-in with pass-through pricing and clear disclosure.

The more practical v1 path: **pull from mail the user already has** (Gmail, iCloud,
Fastmail, etc.) rather than operate an Attache mail server.

## Decision

### Phase A (next) — IMAP ingest adapter

- User connects existing mailbox(es); credentials in `@celestial/vault` (local
  vault in dogfood).
- Poll INBOX (or labeled folder) for messages matching bill heuristics or
  user-configured filters.
- Attachments + body flow into the existing VS-4 pipeline → `ingested_event` →
  HITL → obligation.
- **Read-only** IMAP; no sending mail from Attache in this slice.

### Phase B (defer) — Attache-provided ingress addresses

Revisit only when product requires `bills+{token}@ingest.attache.app` without user
mail setup. Options at that time (not chosen now):

- Self-hosted SMTP + webhook (Hetzner)
- BYO Mailgun/SendGrid (user's account)
- Attache pass-through inbound (explicit opt-in tier)

### Unchanged — local/agent paths (always available)

| Path | Role |
|------|------|
| Upload / CLI | Primary agent-first ingest |
| Maildrop | Local dogfood; simulates forward without SMTP |
| Webhook | Generic receiver for future self-hosted or BYO routes |
| Mesh / sync | Household devices share obligations, not raw mail |

### Trust model

- **IMAP:** User's mail host sees mail (already true today). Attache client or
  local agent pulls; cloud never required.
- **Hosted ingress (deferred):** Third party or Attache sees plaintext — only
  with informed opt-in when implemented.

## Consequences

- Remove Mailgun/SendGrid from near-term roadmap; replace with **VS-4.2 IMAP**.
- Keep `ingestEmailAddress()` as **display-only / future** until Phase B.
- Maildrop + webhook remain for dev and self-hosted deployments.

## References

- [ADR-004](./004-ingestion-pipeline.md)
- [docs/plans/vs-4.1.md](../plans/vs-4.1.md)
- [docs/plans/vs-4.2-imap.md](../plans/vs-4.2-imap.md)
- [ADR-008 Gmail OAuth](./008-gmail-oauth-local-vault.md) (VS-4.3)
