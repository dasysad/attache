# Spec: Android notification reader (v1)

- **Status:** P0 API shipped (2026-08-16); Kotlin companion still draft
- **Date:** 2026-06-22
- **Purpose:** Minimal mobile channel for household alerts without full app scope

## Scope

Read-only companion app. **No** Plaid, **no** transfers, **no** document upload in v1.

Users act in the **web app** via deep links.

## Features

| Feature | v1 |
|---------|-----|
| FCM push registration | ✅ |
| Notification list (severity, kind, time) | ✅ |
| Notification detail + deep link | ✅ |
| Mark read (syncs to server/mesh) | ✅ |
| Biometric lock to open app | ✅ |
| Account signup / bank link | ❌ |

## Auth

- OAuth device flow or magic link tied to existing Attache member.
- Tokens stored in Android Keystore.
- Teen `view_only` members may use app; action URLs that require write show
  "Open in browser as parent" if insufficient grant.

## API (Hono)

```
POST /devices/register     { fcm_token, platform: "android" }
GET  /notifications        ?since=
POST /notifications/:id/read
```

## Stack

- Kotlin + Jetpack Compose (or React Native if team prefers one mobile codebase later — default **native Kotlin** for minimal scope).
- FCM for push.
- WorkManager for token refresh.

## Deep links

`attache://notification/{id}` → resolves action URL from payload.

HTTPS fallback: `https://app.attache.dev/notifications/{id}`

## Security

- Certificate pinning optional v1.1.
- No local financial data cache beyond notification text (may contain amounts — encrypt DataStore).

## Success criteria

- Push delivery < 30s from HITL queue insert.
- Tap notification → web action screen in < 2s.

## Out of scope

- iOS, widgets, Wear OS, offline notification history > 30 days.
