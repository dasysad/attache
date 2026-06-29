# ADR-004: Financial and document ingestion pipeline

Area: data / agents

- **Status:** proposed
- **Date:** 2026-06-22
- **Deciders:** founder
- **Related:** ADR-005 (notifications), pricing (Plaid pass-through)

## Context

v1 ingestion priorities:

1. **Plaid** — primary bank transaction/balance source for dogfooding.
2. **Document scraping** — bills, statements, PDFs → obligations and amounts.
3. **Email scraping** — agentic channel for receipts, school notices, renewals.
4. **SnapTrade** — premium tier only (ADR-006).

Not in v1 dogfood path: generic webhook fan-in, Telegram uploads (later).

## Decision

### Adapter registry (ingestion ports)

```
IngestionAdapter
├── PlaidAdapter           # v1 primary; pass-through pricing
├── DocumentPipeline       # PDF/image → structured extraction
├── EmailIngestAdapter     # dedicated mailbox or forwarding address
├── ManualImportAdapter    # CSV/OFX — always free
└── SnapTradeAdapter       # premium; Connection Portal embed
```

All adapters emit normalized events:

```typescript
interface IngestedEvent {
  id: string;
  tenant_id: string;
  source: "plaid" | "email" | "document" | "snaptrade" | "manual";
  kind: "transaction" | "balance" | "bill" | "statement" | "notice";
  payload_ref: string;       // encrypted blob or FK
  confidence: number;        // 0–1 for agent-extracted fields
  reviewed: boolean;         // HITL for low confidence
  ingested_at: string;
}
```

### Plaid (v1 primary)

- Read-only products for free tier: Transactions, Balance, Investments (if enabled).
- Pass-through billing: show Plaid cost transparently in settings.
- Tokens in `@celestial/vault`; never in SQLite plaintext.

### Document pipeline

Starflow workflow:

1. Ingest (upload, email attachment, mobile share target later).
2. Classify (bill / statement / insurance / school / other).
3. Extract (vendor, amount, due date, account hints).
4. HITL queue if `confidence < threshold`.
5. Promote to `Obligation` or reconcile to Plaid transaction.

**OCR path (see `docs/prd/document-ocr-strategy.md`):** hybrid Docling + VLM
(GLM-OCR or docling-graph `BillingDocument` template). **Not Tesseract** for
structured bill extraction in v1.

Storage: ciphertext PDF on R2; extracted fields in SQLite encrypted column.

### Email scraping

**VS-4.2 (decided):** IMAP pull from user's existing mailbox — credentials in vault.
See [ADR-007](../adr/007-email-ingest-strategy.md).

**Deferred:** Attache-provided ingress `bills+{token}@ingest.attache.app` — revisit
self-hosted SMTP or BYO Mailgun/SendGrid only if product requires hosted addresses.

- Parses attachments → document pipeline.
- Parses body for due dates / amounts → `IngestedEvent` with provenance `email`.
- Not a human notification channel — **ingestion only** (ADR-005).

### SnapTrade (premium)

- Embed Connection Portal (iframe / React SDK) — co-branded, not separate SnapTrade UX.
- Attache pays SnapTrade per connected user ($1–2/mo PAYG); recover via premium tier.
- No "bring your own SnapTrade developer account" in v1 — simplifies support.
- Read-only `connectionType: read` for v1 analyses.

## Consequences

- Dogfooding starts Plaid + document + email; other channels are v1.1+.
- Every ingestion path feeds the same `IngestedEvent` → review → domain promotion flow.
- Low-confidence extractions never auto-create obligations.

## Open questions

- ~~OCR provider~~ → see `docs/prd/document-ocr-strategy.md` (Docling + GLM-OCR hybrid).
- Email retention policy for raw messages.
