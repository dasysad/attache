# VS-2.1 — Manage accounts & obligations

**Status:** complete  
**Builds on:** [VS-2](./vs-2.md), VS-1 CRUD

## Outcome

Dogfooders can **list, edit, mark paid, and delete** funding accounts and obligations from the web UI — not just add via forms.

| Item | Status |
|------|--------|
| Accounts list with `att-account-row` | ✅ |
| Edit / delete manual accounts | ✅ |
| Plaid accounts read-only (sync note) | ✅ |
| Obligations list with status chips | ✅ |
| Mark paid, edit, delete | ✅ |
| Core: `updateManualAccount`, `deleteManualAccount`, `updateObligation`, `deleteObligation` | ✅ |
| CLI: `attache accounts list`, `attache obligations list` | ✅ |

## Web routes

| Method | Path | Action |
|--------|------|--------|
| GET | `/app/accounts` | List + add form |
| POST | `/app/accounts/:id/update` | Save manual account |
| POST | `/app/accounts/:id/delete` | Delete manual (no tx rows) |
| GET | `/app/obligations` | List + add form |
| POST | `/app/obligations/:id/paid` | Mark paid |
| POST | `/app/obligations/:id/update` | Edit unpaid obligation |
| POST | `/app/obligations/:id/delete` | Remove |

## Rules

- **Plaid-linked accounts** cannot be edited or deleted in UI — balance comes from sync.
- **Paid obligations** cannot be edited; can be deleted.
- **Manual accounts** with `bank_transaction` rows cannot be deleted.

## Dogfood

```bash
pnpm ss:up
open http://localhost:8780/app/accounts
open http://localhost:8780/app/obligations

pnpm attache accounts list
pnpm attache obligations list
```

## Next

- **VS-5.1** — HITL transfer approval queue ✅
- **VS-7** — mesh (when `@celestial/mesh-core` available)
