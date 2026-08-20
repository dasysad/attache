# Slice 4 — Ingest → obligation reliability

**Status:** ✅ shipped  
**Parent:** [vertical-slices-readiness.md](./vertical-slices-readiness.md)

## Goal

Gmail/IMAP mail links behave like Plaid links: errors are visible, agents can
poll/confirm/unlink, and a failed account can be retried without reconnecting.

## Acceptance

1. `last_error` on `gmail_account` / `imap_account`; `mark*Error(db, id, message)`.
2. Poll includes `active` **and** `error` accounts; success clears error; per-account
   outcomes in poll result (`accountOutcomes`).
3. `unlinkGmailAccount` / `unlinkImapAccount` — vault secret + row.
4. CLI: `attache ingest gmail|imap unlink <id>`; status shows `lastError`.
5. MCP: `ingest_status`, `poll_gmail`, `poll_imap`, `confirm_bill_ingest`,
   `unlink_gmail_account`, `unlink_imap_account`, `gmail_connect_sandbox`.
6. Web: error text + Unlink on `/app/ingest` mail rows.
7. Tests for mark error, unlink, retry poll, confirm → obligation, negatives.

## Out of scope

Hosted ingress (BL-8), OCR sidecar, Gmail history API redesign, auto-promote.

## Dogfood

```bash
attache ingest gmail connect-sandbox
attache ingest poll-gmail
attache ingest status
attache ingest confirm <eventId>
attache ingest gmail unlink <id>
```
