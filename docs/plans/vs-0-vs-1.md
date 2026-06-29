# VS-0 + VS-1 — current focus

**Status:** complete (VS-1); see [VS-2 plan](./vs-2.md) for dashboard polish.

## VS-0 — Local vault + tenant

| Item | Status | Notes |
|------|--------|-------|
| SQLite at `~/.attache/data/attache.db` | ✅ | WAL, FK |
| Stable `site_id` in `app_meta` | ✅ | mesh-ready |
| Tenant + member + peer on onboard | ✅ | `/onboard` |
| Ledger primary = local `site_id` | ✅ | ADR-001 |
| Plaintext SQLite (no SQLCipher yet) | ⏸️ | VS-0.1 — not blocking dogfood |
| Passkey / passphrase DEK | ⏸️ | VS-0.1 |
| TigerBeetle / LedgerPort | ⏸️ | fake adapter parallel track |

**Done when:** household exists locally, device identity stable, app gated on onboard.

## VS-1 — Obligations + forecast (manual path)

| Item | Status | Notes |
|------|--------|-------|
| `funding_account` table + CRUD | ✅ | `/app/accounts` |
| `obligation` table + CRUD | ✅ | `/app/obligations` |
| 30-day solvency forecast | ✅ | runway, due-7d, overdue |
| Dashboard shows forecast + lists | ✅ | att-stat, att-* rows |
| Provenance calendar events | ⏸️ | VS-1.1 — obligations first |
| Plaid / ingest | ❌ | VS-3 |

**Done when:** user adds checking + 3 bills manually, sees runway ≥30d or warning, no Plaid.

## Dev workflow (agents + humans)

```bash
pnpm ss:status          # are servers up?
pnpm ss:up              # web :8780 + lens :7777 via ss
pnpm test               # core + ui tests
```

**Do not** start `pnpm dev` / `pnpm lens` in background shells — use `ss processes`.

## Next after VS-1

1. **VS-2** — runway chart, obligation timeline polish, onboarding wizard steps
2. **VS-0.1** — SQLCipher + passphrase gate
3. **LedgerPort P0** — fake adapter for transfer dry-runs

## Future backlog (not scheduled)

- **[Credential hygiene](./credential-hygiene-future.md)** — event-driven rotation
  nudges and agent-assisted password change for high-value accounts (not
  universal bulk rotation; no password-manager scope in v1).

## References

- [PRD vertical slices](../prd/attache-v1.md)
- [ADR-001 TigerBeetle](../adr/001-tigerbeetle-financial-ledger.md)
- [ADR-002 tenant](../adr/002-tenant-household-and-merge.md)
