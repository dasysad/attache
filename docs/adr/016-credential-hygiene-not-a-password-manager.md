# ADR-016: Credential hygiene is not a password manager

Area: security / product scope

- **Status:** accepted
- **Date:** 2026-08-16
- **Deciders:** founder
- **Related:** [credential-hygiene-future.md](../plans/credential-hygiene-future.md), BL-7, ADR-008 (Gmail OAuth ≠ website passwords)

## Context

Research ([credential-hygiene-future.md](../plans/credential-hygiene-future.md))
found no production-quality universal password rotator. Dashlane's Password
Changer failed on per-site maintenance. Attache already stores **mailbox OAuth
tokens** and **funding institution names**, not the user's bank/website
passwords.

A hygiene wedge is still useful when a **connected Gmail/IMAP address** appears
in a breach, or when an agent needs a shortlist of high-value logins to review
manually.

## Decision

P0 credential hygiene is:

| Do | Do not |
|----|--------|
| HIBP (or sandbox fake) for mailbox **emails** Attache already has | Store website passwords in SQLite or the vault |
| List funding institutions + obligation payees as **names** | Send payee/institution strings to HIBP |
| Upsert `credential_hygiene` notifications | Auto-rotate, headless login, or calendar rotation |
| `--sandbox` / `FakeHibpAdapter` for CI | Require `HIBP_API_KEY` for dogfood |

## Consequences

- Agents run `attache credentials check [--sandbox]` / MCP `credentials_check`.
- Assisted change-password HITL and passkey nudges remain future (P2/P3 in the
  research note).
- Gmail vault tokens stay OAuth refresh tokens (ADR-008), not website passwords.

## References

- [vs-credential-hygiene.md](../plans/vs-credential-hygiene.md)
- [ADR-008](./008-gmail-oauth-local-vault.md)
