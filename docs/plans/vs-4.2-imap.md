# VS-4.2 — IMAP email pull

**Status:** complete  
**Date:** 2026-06-28  
**Builds on:** [VS-4.1](./vs-4.1.md), [ADR-007](../adr/007-email-ingest-strategy.md)

## Outcome

Pull bills from the user's **existing mailbox** — no Attache-operated mail server.

| Item | Status |
|------|--------|
| `imap_account` table + vault credential ref | ✅ |
| `ImapIngestPort` + `FakeImapAdapter` + `LiveImapAdapter` (imapflow) | ✅ |
| Bill heuristics filter (subject/attachment MIME) | ✅ |
| Incremental sync by IMAP UID | ✅ |
| `/app/ingest` connect form + Poll IMAP | ✅ |
| CLI: `attache ingest imap connect`, `poll-imap` | ✅ |

## Flow

```
User connects IMAP (app password → vault)
       ↓
pollImapIngest → fetch UID range → filter bill-like
       ↓
ingestDocumentBytes (source=email, external_id=imap:{account}:{uid})
       ↓
HITL review → obligation
```

## Dogfood

```bash
# Sandbox (no real mailbox)
ATTACHE_IMAP_MODE=sandbox pnpm attache ingest imap connect \
  --host imap.sandbox.local --user user@test.com --password x
ATTACHE_IMAP_MODE=sandbox pnpm attache ingest poll-imap

# Live Gmail (app password)
pnpm attache ingest imap connect \
  --host imap.gmail.com --user you@gmail.com --password "$APP_PASSWORD"
pnpm attache ingest poll-imap
```

## Environment

| Variable | Purpose |
|----------|---------|
| `ATTACHE_IMAP_MODE=sandbox` | FakeImapAdapter for tests/dogfood |
| `ATTACHE_IMAP_PASSWORD` | CLI connect without `--password` on CLI |

## Next

- **VS-4.3 Gmail OAuth** — see [ADR-008](../adr/008-gmail-oauth-local-vault.md)
- VS-5 Agent MCP tools
- Hosted ingress — still deferred (ADR-007 Phase B)

## References

- [ADR-007](../adr/007-email-ingest-strategy.md)
