# VS-4 — Document + email ingest

**Status:** complete  
**Date:** 2026-06-28  
**Builds on:** [VS-3](./vs-3.md), [ADR-004](../adr/004-ingestion-pipeline.md), [document OCR strategy](../prd/document-ocr-strategy.md)

## Outcome

PDF/text bill → HITL review → obligation with `provenance: document|email`.

| Item | Status |
|------|--------|
| `document_artifact` table + `~/.attache/documents/` store | ✅ |
| `DocumentExtractionPort` + `FakeDocumentAdapter` (.txt + sandbox fixture) | ✅ |
| `EmailIngestPort` + `FakeEmailAdapter` (simulate inbound) | ✅ |
| `ingested_event` bill pipeline (never auto-promotes) | ✅ |
| HITL review UI `/app/ingest` | ✅ |
| CLI: `attache ingest upload\|simulate-email\|confirm` | ✅ |
| Email ingress address display (`bills+{token}@ingest.attache.app`) | ✅ (display only) |

## Flow

```
Upload / email attachment
       ↓
document_artifact (raw bytes, outside SQLite)
       ↓
FakeDocumentAdapter.extract()  [Docling+GLM-OCR later]
       ↓
ingested_event (source=document|email, kind=bill, reviewed=0)
       ↓
HITL confirm (/app/ingest/review/:id)
       ↓
obligation (provenance document|email, ingested_event_id)
```

## Text bill format (dogfood)

```text
Payee: City Water Department
Amount: $64.20
Due: 2026-07-18
Cadence: monthly
```

Sample: `packages/core/fixtures/sample-bill.txt`

## Confidence bands

| Score | UI | Behavior |
|-------|-----|----------|
| ≥ 0.85 | high | Still requires confirm in VS-4 |
| 0.60–0.85 | review | HITL required |
| < 0.60 | low | Manual assist |

## Dogfood

```bash
pnpm ss:up

# CLI
pnpm attache ingest upload packages/core/fixtures/sample-bill.txt
pnpm attache ingest confirm <eventId>

pnpm attache ingest simulate-email
pnpm attache ingest status

# Web: http://localhost:8780/app/ingest
```

## Next (VS-5 / VS-4.2)

- **VS-4.2 IMAP pull** ([ADR-007](../adr/007-email-ingest-strategy.md))
- Agent MCP tools (`get_runway`, `list_obligations`) — VS-5
- R2 ciphertext storage for PDFs
- Hosted ingress — deferred

## References

- [PRD VS-4](../prd/attache-v1.md)
- [ADR-004](../adr/004-ingestion-pipeline.md)
