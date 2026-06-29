# VS-4.1 — Live email + extract sidecar

**Status:** complete  
**Date:** 2026-06-28  
**Builds on:** [VS-4](./vs-4.md), [document OCR strategy](../prd/document-ocr-strategy.md)

## Outcome

Live email forwarding path and Python Litestar extraction sidecar — no more display-only ingress.

| Item | Status |
|------|--------|
| `packages/extract` Litestar `POST /extract/bill` | ✅ |
| `RemoteDocumentAdapter` + `ATTACHE_EXTRACT_URL` | ✅ |
| Maildrop inbox `~/.attache/inbox/{token}/` | ✅ |
| Webhook `POST /api/ingest/email` + token validation | ✅ |
| `.eml` parser + poll/drop CLI | ✅ |
| Optional Docling via `ATTACHE_USE_DOCLING=1` | ✅ (optional dep) |

## Architecture

```
Forward email ──┬──► POST /api/ingest/email (production webhook)
                └──► ~/.attache/inbox/{token}/*.eml (local maildrop)

Attachment bytes ──► ATTACHE_EXTRACT_URL/extract/bill (Python)
                   └──► fallback FakeDocumentAdapter if sidecar down
```

## Environment

| Variable | Purpose |
|----------|---------|
| `ATTACHE_EXTRACT_URL` | e.g. `http://127.0.0.1:8790` |
| `ATTACHE_EXTRACT_FALLBACK=0` | Disable TS fallback on sidecar error |
| `ATTACHE_INGEST_WEBHOOK_SECRET` | Require `Authorization: Bearer …` on webhook |
| `ATTACHE_EMAIL_MODE=sandbox` | Force fixture email adapter |
| `ATTACHE_USE_DOCLING=1` | Use Docling when installed (`pip install attache-extract[docling]`) |

## Dogfood

```bash
# Start stack + sidecar
pnpm ss:up
pnpm extract:dev   # or ss start attache-extract

export ATTACHE_EXTRACT_URL=http://127.0.0.1:8790

# Email via maildrop
pnpm attache ingest drop-email packages/core/fixtures/sample-forward.eml
# Edit fixture To: line — replace PLACEHOLDER with token from `attache ingest status`
pnpm attache ingest poll-email

# Email via webhook
curl -X POST http://localhost:8780/api/ingest/email \
  -H 'Content-Type: application/json' \
  -d '{"to":"bills+TOKEN@ingest.attache.app","from":"a@b.com","subject":"Bill","text":"Payee: X\nAmount: $10\nDue: 2026-08-01"}'
```

## Next (VS-5 / VS-4.2)

- **VS-4.2 IMAP pull** from user's existing mailbox ([ADR-007](../adr/007-email-ingest-strategy.md))
- Agent MCP tools (`get_runway`, `list_obligations`)
- R2 ciphertext PDF storage
- Hosted `@ingest.attache.app` — deferred (self-host or BYO SaaS revisit later)

## References

- [VS-4](./vs-4.md)
- [ADR-004](../adr/004-ingestion-pipeline.md)
