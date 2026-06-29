# Attache — agent guide

## Current sprint: VS-4.4 complete

Read [docs/plans/vs-4.4-gmail-loopback.md](docs/plans/vs-4.4-gmail-loopback.md). Gmail CLI loopback OAuth shipped.

```bash
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... pnpm attache ingest gmail connect
pnpm attache ingest poll-gmail
```

Register redirect URI: `http://127.0.0.1:8765/oauth/callback`

Mesh (VS-7) blocked on Starsystem `@celestial/mesh-core`.

## Dev servers

```bash
pnpm ss:up
pnpm ss:down
```

## Tests

```bash
pnpm --filter @attache/core test
```
