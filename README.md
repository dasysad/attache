# Attache

Focused household finance attache — local-first, transparent pricing.

## Quick start (VS-0 + VS-1)

```bash
pnpm install
pnpm test
pnpm ss:up          # or: pnpm dev
```

Open http://localhost:8780 → 3-step onboard wizard → dashboard with runway chart.

**Active plan:** [docs/plans/vs-4.4-gmail-loopback.md](docs/plans/vs-4.4-gmail-loopback.md)

```bash
pnpm attache ingest gmail connect    # loopback OAuth — no web server
pnpm attache ingest poll-gmail
```

### Both web + Lens (one terminal)

```bash
pnpm dev:all
```

- Web: http://localhost:8780
- Lens: http://localhost:7777

### Design system (Lens only)

```bash
pnpm lens
```

Open http://localhost:7777 — browse Tokens, Primitives, and Patterns stories.

Requires sibling checkout at `../celestial-intelligence` (for `@celestial/lens`).

### Dev servers via Starsystem (`ss`)

Dogfood Celestial's process supervisor — health checks, reattach, crash restart:

```bash
# from attache root; ss must be on PATH (celestial-intelligence checkout)
ss processes up --env=dev
ss processes ls --env=dev      # UP/DOWN per port
ss processes logs attache-lens --env=dev
ss processes down --env=dev
```

Config: `starsystem.yaml` + `starsystem.dev.yaml`.

- `/` — dashboard with 30-day runway (VS-1)
- `/app/accounts` — manual funding accounts
- `/app/ingest` — upload bills, email simulate, HITL review (VS-4)
- `/onboard` — create local household + `site_id`
- `/pricing` — transparent pricing mock + cost receipt
- `/app/costs` — interactive estimator (htmx)

Data: `~/.attache/data/attache.db`

## Packages

| Package | Role |
|---------|------|
| `@attache/core` | Tenant, accounts, obligations, forecast, SQLite |
| `@attache/server` | Hono + htmx web |
| `@attache/ui` | Lit `att-*` components + design tokens |
| `@attache/cli` | `attache` CLI — Plaid, ingest, agent |
| `@attache/mcp` | stdio MCP server for agents |
| `attache-python` | Back-burner; ledger/ML later |

## Docs

- [VS-0 + VS-1 plan](docs/plans/vs-0-vs-1.md)
- [PRD v1](docs/prd/attache-v1.md)
- [Pricing economics](docs/prd/pricing-unit-economics.md)
- [Mesh lib requirements (for Starsystem)](docs/specs/mesh-lib-consumer-requirements.md)
