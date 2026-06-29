# Document OCR strategy (v1)

- **Status:** draft
- **Date:** 2026-06-22
- **Related:** ADR-004 ingestion pipeline

## Question

Is Tesseract still the gold standard for bill/statement extraction?

**No.** Tesseract remains useful for **raw text on clean scans** but is not the right
primary engine for structured field extraction (vendor, amount, due date, line items)
in 2026.

## Recommended path

### Hybrid pipeline (local-first, Hetzner for cloud tier)

```
PDF/image
    │
    ▼
┌─────────────────┐
│ Docling         │  Layout, tables, reading order, PDF-native text
│ (IBM, OSS)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Field extract   │  Structured JSON → Attache Obligation schema
│ GLM-OCR 0.9B    │  Self-host on Hetzner GPU (or CPU, slower)
│ OR docling-graph│  BillingDocument Pydantic template + local VLM
└────────┬────────┘
         │
         ▼
   confidence score
         │
    ┌────┴────┐
    ▼         ▼
 auto-promote  HITL review queue
```

### Why this stack

| Option | Role | Verdict |
|--------|------|---------|
| **Tesseract** | Legacy OCR text | Fallback for simple text PDFs only |
| **Docling** | Document structure, tables | **Stage 1** — proven OSS, privacy-friendly |
| **GLM-OCR (0.9B)** | Invoice/receipt KIE | **Stage 2** — SOTA open-weight on OmniDocBench (~94.6); runs on ~4GB VRAM |
| **docling-graph** | Pydantic templates incl. `BillingDocument` | **Alternative stage 2** — fits Python/Litestar sidecar if revived |
| **Cloud API** (Gemini Doc AI, etc.) | Highest accuracy | **Fallback** for low-confidence only; pass-through metered |
| **Full VLM** (GPT-4o, Gemini Pro) | General doc understanding | Overkill cost for v1; use for edge cases |

### Deployment

| Mode | Where | Cost to Attache |
|------|-------|-----------------|
| **Local** | User machine (future desktop) | $0 |
| **Self-hosted** | Hetzner GPU box (shared) | Amortized ~$0.02/page |
| **Cloud API fallback** | Provider API | Pass-through to user |

Dogfood on **Hetzner** with GLM-OCR via Ollama/vLLM. Meter cloud OCR per page in
usage billing (`docs/prd/pricing-unit-economics.md`).

### attache-python role

Implement extraction as a **small Litestar sidecar** (`POST /extract/bill`) when
Python track is active — otherwise Starflow worker calling Docling + GLM-OCR CLI.
Do not block v1 on attache-python monolith revival.

### Quality gates

- `confidence >= 0.85` → auto-suggest obligation
- `0.60–0.85` → HITL required
- `< 0.60` → manual entry assisted by raw Docling text

### Evaluation (before ship)

Run 50 real household bills (utilities, credit card, school, medical) through pipeline;
target **≥90% due-date extraction** and **≥95% amount** on common billers.

## References

- [GLM-OCR](https://github.com/zai-org/GLM-OCR) — 0.9B, OmniDocBench leader
- [docling-graph BillingDocument](https://github.com/docling-project/docling-graph)
- [Docling](https://github.com/docling-project/docling)
