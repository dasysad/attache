# Slice 3 — Plaid production path + ingestion eval

**Status:** ✅ shipped (CLI + loopback + eval CI)  
**Roadmap:** [v1 hardening](./v1-hardening-roadmap.md) slice 3

## Goal

1. **Plaid production** — swap fake adapter for live Plaid when `PLAID_*` env is set;
   typed errors, item error state, agent-first CLI connect flow.
2. **Ingestion eval** — manifest-driven bill extraction corpus with field-level
   precision/recall/F1; gate OCR vendor choice against PRD targets.

## Plaid production path

### Config

| Env | Purpose |
|-----|---------|
| `PLAID_CLIENT_ID` | Plaid app client id |
| `PLAID_SECRET` | Plaid secret (sandbox or production) |
| `PLAID_ENV` | `sandbox` \| `development` \| `production` (default: sandbox when keys set) |
| `PLAID_PUBLIC_TOKEN` | Optional one-shot for headless `attache plaid connect` |
| `ATTACHE_PLAID_LOOPBACK_PORT` | Loopback port (default `8766`) |

When **both** `PLAID_CLIENT_ID` and `PLAID_SECRET` are set → `LivePlaidAdapter`
(`mode: "live"`). Otherwise → `FakePlaidAdapter` (`mode: "fake"`).

Register redirect URIs in Plaid Dashboard:

- CLI loopback: `http://127.0.0.1:8766/plaid/callback`
- Web server: `http://localhost:8780/app/plaid/callback` (or your deployed host)

### CLI (agent-first)

```bash
attache plaid status                    # mode, configured, linked items
attache plaid connect                   # Hosted Link + loopback (opens browser)
attache plaid connect --no-browser      # prints link URL via JSON on success path
attache plaid connect --public-token …  # headless exchange
attache plaid link-token                # Link token JSON (live only)
attache plaid connect-sandbox           # demo Chase (no keys)
attache plaid sync                      # pull transactions; marks item errors
```

### Web

- `GET /app/plaid/connect` — redirect to Hosted Link (when Plaid configured)
- `GET /app/plaid/callback` — exchange `public_token` → sync

### Error taxonomy

`PlaidError` + `mapPlaidApiError()` classify Plaid API failures:

- **relink** — `ITEM_LOGIN_REQUIRED`, invalid access token → user must re-link
- **retry** — rate limits, transient 5xx
- **config** — bad credentials / env

Sync failures persist `error_code` + `error_message` on `plaid_item` via
`markPlaidItemError()`.

### Deferred

- MCP tools for link-token / connect
- Desktop-native Plaid Link shell (loopback + browser is sufficient for v1)

## Ingestion eval harness

### Corpus

`packages/core/fixtures/eval/manifest.json` — **50** structured text bills.
Regenerate with:

```bash
pnpm eval:generate-corpus
```

### Run

```bash
attache ingest eval                      # default document adapter (fake or remote)
attache ingest eval --adapter sandbox    # force FakeDocumentAdapter
```

Exit code **1** when PRD targets fail:

- due-date recall ≥ 90%
- amount precision ≥ 95%

### CI

`.github/workflows/test.yml` runs `pnpm test` and `attache ingest eval --adapter sandbox`
on every push/PR to `main`.

### API

`runBillExtractionEval(adapter, manifestPath?)` → `EvalReport` exported from
`@attache/core`.

## Tests

- `packages/core/src/eval/bill-extraction.test.ts`
- `packages/core/src/plaid/errors.test.ts`
- `packages/core/src/plaid/loopback-connect.test.ts`
- Existing fake Plaid sync tests unchanged

## Follow-ups (done)

- ✅ Expand corpus to 50 bills
- ✅ Wire eval into CI
- ✅ Plaid Link loopback (CLI + server)
