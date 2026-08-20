# Slice — Android FCM device channel (BL-6 P0)

**Status:** ✅ shipped (API; Kotlin companion is follow-on)  
**Parent:** [next-backlog-order.md](./next-backlog-order.md) · BL-6  
**ADRs:** [005](../adr/005-notification-channels.md)  
**Spec:** [android-notification-reader.md](../specs/android-notification-reader.md)

## Goal

Ship the **local Hono API** the Android notification reader needs: register an
FCM token, list alerts, mark read. No Plaid, no transfers, no Kotlin app in P0.

## Acceptance

1. `push_device` table; `registerPushDevice` upserts `(tenant, fcm_token)`.
2. Platform **android** only — iOS/web rejected.
3. `POST /devices/register { fcm_token, platform: "android" }`; `GET /devices`;
   `DELETE /devices/:id`. Spec aliases: `GET /notifications`, `POST /notifications/:id/read`.
4. `FcmPort` + `FakeFcmAdapter`; `ATTACHE_FCM=off` (default) stores tokens and
   does not call Google. `sandbox` records sends in-process. `live` needs
   `ATTACHE_FCM_SERVER_KEY` (legacy HTTP; HTTP v1 is follow-on).
5. CLI: `attache devices list|register|unlink`. MCP: `register_device`,
   `list_devices`, `unlink_device`.
6. Notify-sync fans out FCM next to web push. Tests include negatives
   (not onboarded, empty token, ios, failed token, FCM off).

## Dogfood

```bash
attache devices register --token test-token --label Pixel
attache devices list
export ATTACHE_FCM=sandbox   # in-process send log; not a real phone
# Companion: POST http://127.0.0.1:8780/devices/register
```

## Out of scope

Kotlin/Compose app, device OAuth / magic link, iOS, biometric lock, HTTP v1
FCM, certificate pinning, local notification cache.
