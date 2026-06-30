# Attache — agent guide

## Strategy: standalone prototype first (ADR-009)

**Mesh is backlog** — do not implement VS-7 mesh, merge wizard, or
`@celestial/mesh-core` integration until [docs/backlog.md](docs/backlog.md) BL-1
is explicitly pulled.

Ship a **distributable single-device app**: local SQLite + vault, web + CLI + MCP.
`site_id` / `peer_identity` schema stays for future mesh; no transport code.

Starsystem (`pnpm ss:up`) = **dev supervisor only**. Future SS mesh lib may bundle
process-manager and vault — integrate via adapter later, not a blocker now.

## Current sprint

Completed through VS-6, VS-2.1, VS-5.1, VS-4.4. Next candidates:

1. **VS-8** — SQLCipher + passphrase (VS-0.1)
2. **LedgerPort P0** — fake adapter (ADR-001)
3. **VS-7** — standalone packaging / distributable app

Read [docs/adr/009-standalone-first-mesh-deferred.md](docs/adr/009-standalone-first-mesh-deferred.md).

## Dev servers

```bash
pnpm ss:up
pnpm ss:down
```

## Tests

```bash
pnpm --filter @attache/core test
```
