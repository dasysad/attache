# ADR-007: Email ingest strategy (IMAP first, BYO Mailgun opt-in)

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

### Phase B (P0 pulled) — BYO Mailgun inbound, not Attache SMTP

Opt-in when `ATTACHE_MAILGUN_SIGNING_KEY` is set. Mailgun (the user's account)
receives mail in **plaintext**. IMAP/Gmail remain the primary local-first path.
Attache does not operate an SMTP server or SendGrid in this slice.

- Webhook: `POST /api/ingest/mailgun` (HMAC timestamp+token)
- Display address stays `bills+{token}@ingest.attache.app` (Mailgun route, not MX we run)
- Generic `POST /api/ingest/email` remains for self-hosted JSON forwarders

See [vs-hosted-mail-ingress.md](../plans/vs-hosted-mail-ingress.md).

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
- **Hosted ingress (opt-in):** Mailgun sees plaintext when `ATTACHE_MAILGUN_SIGNING_KEY`
  is set. Attache-operated SMTP and SendGrid remain out.

## Consequences

- IMAP/Gmail stay primary; BYO Mailgun is an explicit opt-in with honesty copy.
- Keep `ingestEmailAddress()` as the display plus-address for Mailgun routes.
- Maildrop + generic JSON webhook remain for dev and self-hosted deployments.
- Attache-operated SMTP / SendGrid / pass-through billed inbound still deferred.

## References

- [ADR-004](./004-ingestion-pipeline.md)
- [docs/plans/vs-4.1.md](../plans/vs-4.1.md)
- [docs/plans/vs-4.2-imap.md](../plans/vs-4.2-imap.md)
- [vs-hosted-mail-ingress.md](../plans/vs-hosted-mail-ingress.md)
- [ADR-008 Gmail OAuth](./008-gmail-oauth-local-vault.md) (VS-4.3)
