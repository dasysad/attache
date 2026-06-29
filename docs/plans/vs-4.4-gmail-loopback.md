# VS-4.4 — Gmail OAuth CLI loopback

**Status:** complete  
**Builds on:** [VS-4.3](./vs-4.3-gmail-oauth.md), [ADR-008](../adr/008-gmail-oauth-local-vault.md)

## Outcome

Connect Gmail from the CLI **without** running `@attache/server`. ADR-008 CLI-first token acquisition.

| Item | Status |
|------|--------|
| Loopback HTTP on `127.0.0.1` | ✅ |
| Opens system browser → Google consent | ✅ |
| Code exchange → vault + `gmail_account` | ✅ |
| CSRF state (reuse web flow) | ✅ |
| `attache ingest gmail connect` | ✅ |
| `--port`, `--no-browser` flags | ✅ |

## Flow

```text
attache ingest gmail connect
  → listener http://127.0.0.1:8765/oauth/callback (default)
  → opens browser to Google OAuth
  → user consents
  → code exchange → ~/.attache/vault/
  → gmail_account row in SQLite
```

Web connect at `/app/ingest/gmail/connect` still works for UI users.

## Google Cloud Console

Add **Authorized redirect URI**:

```text
http://127.0.0.1:8765/oauth/callback
```

If you use a custom port:

```bash
ATTACHE_GMAIL_LOOPBACK_PORT=9876 pnpm attache ingest gmail connect --port 9876
```

Register that exact URI in GCP.

## Environment

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# Optional — default loopback port 8765
ATTACHE_GMAIL_LOOPBACK_PORT=8765

# Sandbox without Google project
ATTACHE_GMAIL_MODE=sandbox pnpm attache ingest gmail connect
```

## Commands

```bash
pnpm attache ingest gmail connect
pnpm attache ingest gmail connect --no-browser   # prints auth URL via stderr hint
pnpm attache ingest gmail status
pnpm attache ingest poll-gmail
```

## Core API

```typescript
connectGmailViaLoopback(db, vault, { port?, openBrowser?, timeoutMs? })
```

## Next

- **VS-7** — mesh (when lib available)
- Optional: web UI button triggers same loopback helper
