# Slice — Credential hygiene (BL-7 P0)

**Status:** ✅ P0 shipped · **P2** ✅ assisted change HITL  
**Parent:** [next-backlog-order.md](./next-backlog-order.md) · BL-7  
**ADRs:** [016](../adr/016-credential-hygiene-not-a-password-manager.md)  
**Research:** [credential-hygiene-future.md](./credential-hygiene-future.md)

## Goal

Event-driven **breach alerts** for mailbox emails Attache already tracks, plus a
high-value **name** shortlist (institutions, payees). Attache is not a password
manager and does not store or rotate website passwords.

## Acceptance

1. `listHighValueTargets` = Gmail/IMAP emails + funding institutions + obligation
   payees. No password fields.
2. `HibpPort` + `FakeHibpAdapter` (`sandbox@gmail.com` → Adobe 2013). Live when
   `HIBP_API_KEY` is set. HIBP is called **only** for emails.
3. `checkCredentialHygiene` upserts `credential_hygiene:{email}` notifications
   and clears stale ones. Refresh/solvency evaluator does not wipe them.
4. CLI: `attache credentials check [--sandbox]`. MCP: `credentials_check`.
5. Tests include negatives (not onboarded, payee names never queried, no emails
   → no HIBP, live 404 = no breach).

## Dogfood

```bash
attache ingest gmail connect-sandbox
attache credentials check --sandbox
# JSON: emailsChecked, breaches, highValue, message
```

## Out of scope (P0)

Password vault, bulk rotation, passkey nudges, sending payee/institution strings to HIBP.

## P2 acceptance (assisted change HITL)

1. `changePasswordUrlForEmail` — Gmail → Google account password; others →
   `/.well-known/change-password`.
2. `changePasswordUrlForName` — curated bank domains; generic payees → `null`.
3. `credentialAssist` — high-value shortlist only; returns URL + one-time
   `suggestedPassword`; **never persisted**.
4. Breach notifications mention `attache credentials assist --email …`.
5. CLI `attache credentials assist --email|--payee|--institution`.
   MCP `credentials_assist`.
6. Negatives: not on shortlist, multiple flags, invalid email, generic payee
   without URL.

```bash
attache ingest gmail connect-sandbox
attache credentials check --sandbox
attache credentials assist --email sandbox@gmail.com
```

## Out of scope (P2)

Headless login, password vault, 1Password Connect, passkey nudges.
