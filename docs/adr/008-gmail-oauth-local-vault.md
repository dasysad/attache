# ADR-008: Gmail OAuth ingest (local vault, CLI-first)

Area: data / privacy / auth

- **Status:** accepted
- **Date:** 2026-06-29
- **Deciders:** founder
- **Related:** ADR-007 (IMAP first), VS-4.2 (IMAP shipped), VS-4.3 (planned)

## Context

VS-4.2 connects mailboxes via **IMAP + app password** — credentials in
`~/.attache/vault/`, metadata in SQLite. Gmail users must create a Google app
password; this is friction and grants broad IMAP access.

**Gmail API + OAuth 2.0** is the preferred upgrade:

- User never gives Attache their Google password.
- Scopes can be **read-only** (`gmail.readonly`).
- Refresh tokens are revocable from Google Account settings.
- Incremental sync via `historyId` is cleaner than UID-only IMAP.

Attache also has a **WorkOS** account for future household / app login. WorkOS
must not be confused with Gmail authorization — they solve different problems.

## Decision

### Two separate auth layers

| Layer | Question | Mechanism | Token storage |
|-------|----------|-----------|---------------|
| **App identity** | Who is logged into Attache? | WorkOS AuthKit, passkeys, or local-only (VS-0) | Session / member record — **not Gmail access** |
| **Mailbox access** | May Attache read this Gmail for bills? | **Google OAuth** (Gmail API) | Refresh token in **vault only** |

WorkOS “Sign in with Google” (`openid`, `email`, `profile`) does **not** grant
Gmail read access. VS-4.3 requires a **dedicated Google OAuth flow** with Gmail
scopes, whether or not WorkOS is used for app login.

### VS-4.3 connect flow (CLI-first)

```text
attache ingest gmail connect
  → Attache starts loopback HTTP listener (127.0.0.1:random port)
  → Opens browser to Google authorization URL
  → User consents on accounts.google.com (Attache never sees password)
  → Redirect to http://127.0.0.1:<port>/oauth/callback?code=...
  → Attache exchanges code for access_token + refresh_token
  → refresh_token → vault ref (e.g. gmail/account/user@gmail.com)
  → gmail_account row in SQLite (email, history_id cursor, vault ref — no secrets)
```

Poll:

```text
attache ingest poll-gmail
  → vault.get(ref) → refresh access token
  → Gmail API: list messages (filtered) + fetch attachments
  → existing VS-4 pipeline → ingested_event → HITL → obligation
```

Web UI (`/app/ingest`) may trigger the same flow via loopback redirect or defer
connect to CLI — **default: CLI/agent owns token acquisition** to keep tokens on
the user's device.

### What we store (and do not)

| Item | Store? | Where |
|------|--------|--------|
| Google account password | **Never** | — |
| OAuth refresh token | Yes | Vault (`VaultPort`) |
| OAuth access token | Yes (short-lived) | Vault or in-memory cache |
| Gmail address, label, `historyId` | Yes | SQLite `gmail_account` (or extend `imap_account`) |
| Raw email bodies (long-term) | Optional | Local documents dir; ciphertext on R2 later |
| Refresh token in SQLite | **Never** | — |
| Refresh token on Attache cloud | **Never** (default tier) | Hosted tier requires explicit opt-in + ADR amendment |

### Google Cloud setup (operator)

1. Google Cloud project with **Gmail API** enabled.
2. OAuth consent screen (app name, logo, privacy policy URL).
3. OAuth client:
   - **Desktop / installed app** for CLI loopback (recommended for dogfood).
   - Optional **Web client** if server-hosted callback on localhost only.
4. Scopes (minimum):
   - `https://www.googleapis.com/auth/gmail.readonly`
   - Optional: `openid email` in same flow if we want to verify mailbox address.
5. **Verification:** `gmail.readonly` is a restricted scope — production use requires
   Google verification. Dogfood: OAuth app in **Testing** mode + test users.

Client ID/secret for the Attache OAuth app live in **server env or packaged
config** — they are not user secrets. Per-user secrets are refresh tokens only.

### WorkOS role (explicit non-goals)

WorkOS **may** be used for:

- Household member login to Attache web
- Linking “member X connected gmail Y” in the domain model
- Requiring an authenticated WorkOS session before showing ingest UI

WorkOS **must not** be used for:

- Obtaining Gmail API refresh tokens (unless WorkOS adds a Gmail-specific
  integration we adopt later — not assumed today)
- Substituting for Google Cloud OAuth client registration

If both are present, the UX is two steps when needed:

1. Sign in to Attache (WorkOS / passkey / local).
2. Connect Gmail (Google OAuth → vault).

### Alternative considered: IMAP + XOAUTH2

Same Google OAuth consent, but tokens feed IMAP instead of REST. Rejected as
primary path for VS-4.3 — Gmail API gives better attachment handling and
`historyId` incremental sync. IMAP + app password remains supported (VS-4.2).

### Trust / ZK alignment

- Google already holds user mail for Gmail accounts — unchanged.
- Attache operator should not receive refresh tokens on default local-first tier.
- Extraction stays local (`ATTACHE_EXTRACT_URL` on localhost) per document OCR strategy.
- WorkOS sees app login events, not mailbox contents.

## Consequences

- VS-4.3 implements `GmailIngestPort` parallel to `ImapIngestPort`, sharing
  `poll*Ingest` → bill pipeline.
- Document WorkOS vs Google OAuth in onboarding copy to avoid user confusion.
- Plan Google OAuth verification before public launch; IMAP app password remains
  fallback for Gmail until verified.
- Optional ADR amendment required before any “cloud poll on behalf of user” tier.

## Open questions

- Single `mail_account` table vs separate `gmail_account` + `imap_account`.
- Gmail label filter (`Attache/Bills`) vs inbox-wide heuristics only.
- OAuth token encryption at rest (VS-0.1 SQLCipher / OS keychain).

## References

- [ADR-007](./007-email-ingest-strategy.md)
- [docs/plans/vs-4.2-imap.md](../plans/vs-4.2-imap.md)
- [Google Gmail API OAuth](https://developers.google.com/gmail/api/auth/about-auth)
- [Google restricted scopes verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
