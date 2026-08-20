# ADR-005: Notification and alert channels

Area: UX / agents

- **Status:** accepted
- **Date:** 2026-06-22
- **Deciders:** founder
- **Related:** ADR-004 (email is ingestion, not primary human channel)

## Context

Users need alerts for: solvency breaches, upcoming obligations, HITL transfer
approvals, ingestion review queue, merge wizard steps.

Email is **obsolete for human alerts** in this product positioning. Email remains
important as an **agentic ingestion** path (ADR-004).

Multi-channel matters long-term; v1 prioritizes web/in-app and a minimal Android
notification reader.

## Decision

### Channel tiers

| Tier | Channels | v1 |
|------|----------|-----|
| **Primary human** | Web push, in-app notification center | ✅ |
| **Mobile reader** | Android read-only notification app | ✅ P0 API ([vs-android-fcm.md](../plans/vs-android-fcm.md)); Kotlin follow-on |
| **Agentic ingress** | Email ingest, document upload, MCP tools | ✅ email/docs |
| **Secondary human** | Telegram, SMS, Slack | v1.1 |
| **Digest email** | Optional weekly summary | v1.1, off by default |

### Notification model

```typescript
interface Notification {
  id: string;
  tenant_id: string;
  member_id?: string;
  severity: "info" | "warning" | "action_required";
  kind: "solvency" | "obligation" | "hitl_transfer" | "ingestion_review" | "merge" | "system";
  title: string;
  body: string;
  action_url?: string;      // deep link into web app
  read_at?: string;
  channels_delivered: string[];
}
```

Delivery via Starflow step: `notify(member, notification, channels[])`.

### Android read-only app (v1 spec)

See `docs/specs/android-notification-reader.md`. Scope:

- Receive FCM push; display notification list and detail.
- Deep link to web app for any action (no transfers on device).
- No account linking or Plaid on mobile v1.

### Spacecraft / MCP

Agents query `list_notifications` and `ack_notification` — same store as UI.

## Consequences

- Web push + in-app shipped; Android **device register + FCM port** shipped
  (BL-6 P0). Kotlin companion, device OAuth, and FCM HTTP v1 remain follow-on.
- Email SMTP outbound is not v1 critical path.
- Telegram bot reuses Spacecraft gateway patterns when secondary channels ship.
