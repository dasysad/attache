# Slice — Hosted mail ingress (BL-8 P0)

**Status:** ✅ shipped (BYO Mailgun webhook)  
**Parent:** [next-backlog-order.md](./next-backlog-order.md) · BL-8  
**ADRs:** [007](../adr/007-email-ingest-strategy.md)

## Goal

Opt-in **BYO Mailgun inbound** that feeds the existing ingest pipeline. IMAP and
Gmail stay primary. Attache does not operate SMTP. Mailgun sees **plaintext** —
disclosed in CLI/MCP/web copy.

## Acceptance

1. `POST /api/ingest/mailgun` verifies HMAC-SHA256(`timestamp` + `token`) with
   `ATTACHE_MAILGUN_SIGNING_KEY`. Missing key → 503; bad/stale sig → 401.
2. Form maps onto `ingestEmailWebhook` (recipient must be `bills+{token}@…`).
3. Generic `POST /api/ingest/email` unchanged (optional Bearer).
4. CLI: `attache ingest ingress-status` (also nested on `ingest status`).
   MCP: `ingest_ingress_status`. Honesty string names plaintext + IMAP/Gmail.
5. Tests include negatives (no key, wrong key, missing subject, stale timestamp).

## Dogfood

```bash
export ATTACHE_MAILGUN_SIGNING_KEY=…   # Mailgun webhook signing key
attache ingest ingress-status
# Point Mailgun route: POST http://127.0.0.1:8780/api/ingest/mailgun
```

## Out of scope

Attache-operated SMTP, SendGrid, pass-through billed inbound, storing raw mail,
Mailgun attachments in P0.
