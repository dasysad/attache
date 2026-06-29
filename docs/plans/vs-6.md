# VS-6 — Notifications (web push + in-app)

**Status:** complete  
**Depends on:** VS-1 forecast, VS-4 ingest review queue, ADR-005

## Goal

Household alerts for solvency, bills, and ingest review — in-app center, optional web push, agent/CLI parity.

## Alert sources (v1)

| Dedupe key | Trigger | Severity |
|------------|---------|----------|
| `solvency:insolvent` | Runway = 0 within horizon | action_required |
| `solvency:low_runway` | Runway &lt; 14 days | warning / action if &lt; 7 |
| `solvency:due_exceeds_liquid` | Due in 7d &gt; liquid balance | warning |
| `obligation:overdue` | Any overdue bill | action_required |
| `obligation:due_soon` | Due within 3 days | warning |
| `ingestion_review:pending` | HITL bill queue non-empty | action_required |

Evaluator runs on each server `withDb` request (local dogfood). CLI/MCP call `refreshNotifications` explicitly.

## Surfaces

| Surface | Path / command |
|---------|----------------|
| In-app center | `http://localhost:8780/app/notifications` |
| Nav badge | Unread count on **Alerts** |
| JSON API | `GET /api/notifications`, `POST /api/notifications/:id/read` |
| Web push | `POST /api/notifications/push-subscribe` + `/static/sw.js` |
| CLI | `attache notifications list|refresh|ack` |
| MCP | `list_notifications`, `ack_notification` |

## Web push (optional)

Generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

Env:

```bash
ATTACHE_VAPID_PUBLIC_KEY=...
ATTACHE_VAPID_PRIVATE_KEY=...
ATTACHE_VAPID_SUBJECT=mailto:you@example.com
```

On the Alerts page, click **Enable push** after keys are set.

## Package layout

```
packages/core/src/notify/     store, evaluate, types
packages/server/src/push.ts   web-push delivery
packages/server/src/notify-sync.ts
packages/server/public/static/sw.js
```

## Tests

```bash
pnpm --filter @attache/core test   # notify.test.ts
```

## Next

- **VS-7** — household mesh sync
- **VS-10** — Android notification reader (FCM) against same API
