# VS-4.3 — Gmail OAuth + UI connect flow

**Status:** complete  
**Date:** 2026-06-29  
**Builds on:** [VS-4.2](./vs-4.2-imap.md), [ADR-008](../adr/008-gmail-oauth-local-vault.md)

## Outcome

Gmail OAuth connect in web UI + core poll pipeline.

| Item | Status |
|------|--------|
| `gmail_account` table + vault OAuth tokens | ✅ |
| `GET /app/ingest/gmail/connect` → Google consent | ✅ |
| `GET /app/ingest/gmail/callback` → vault + SQLite | ✅ |
| Ingest UI: mail accounts list + Connect Gmail CTA | ✅ |
| `POST /app/ingest/poll-gmail` | ✅ |
| Sandbox connect without Google Cloud project | ✅ |
| CLI: `gmail connect`, `poll-gmail` | ✅ |

## Web flow

1. `/app/ingest` → **Connect Gmail** (or sandbox if no `GOOGLE_CLIENT_ID`)
2. Google consent → callback → tokens in vault
3. **Poll Gmail** → HITL review queue

## Environment

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# Optional — defaults to http://localhost:8780/app/ingest/gmail/callback
GOOGLE_REDIRECT_URI=...

ATTACHE_GMAIL_MODE=sandbox   # fake adapter for dogfood
```

Register redirect URI in Google Cloud Console:
`http://localhost:8780/app/ingest/gmail/callback`

## Dogfood

```bash
pnpm ss:up
# Web: http://localhost:8780/app/ingest → Connect Gmail (sandbox)

ATTACHE_GMAIL_MODE=sandbox pnpm attache ingest gmail connect-sandbox
ATTACHE_GMAIL_MODE=sandbox pnpm attache ingest poll-gmail
```

## References

- [VS-4.4 Gmail CLI loopback](./vs-4.4-gmail-loopback.md)
- [ADR-008](../adr/008-gmail-oauth-local-vault.md)
