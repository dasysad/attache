# ADR-009: Standalone app first — mesh deferred to backlog

Area: product / release strategy

- **Status:** accepted
- **Date:** 2026-06-29
- **Deciders:** founder
- **Supersedes:** none (narrows v1 scope; does not cancel ADR-003)
- **Related:** ADR-003 (mesh substrate), ADR-002 (merge wizard), [backlog](../backlog.md)

## Context

Attache v1 PRD listed **VS-7 household mesh** (LAN sync, ledger primary election)
and **VS-8 merge wizard** as core vertical slices. Implementation depends on a
Celestial/Starsystem library (`@celestial/mesh-core` or successor) that is **not
yet available** as a consumable npm package.

Starsystem (`ss`) is already used for **dev process supervision** (`pnpm ss:up`).
The mesh library roadmap may **bundle additional SS concerns** (process manager,
possibly vault sync) into one distribution. Attache should not block ship on
that consolidation.

Dogfood goal: a **distributable standalone prototype** — one device, one
household, local SQLite + vault, CLI + web + MCP — before multi-device sync.

## Decision

### v1 prototype = standalone single-device app

Ship a working **standalone** Attache that:

- Runs entirely on one machine (macOS/Linux dev; packaged app TBD).
- Uses local SQLite, `~/.attache/vault/`, `site_id` in `app_meta` (mesh-ready but inactive).
- Does **not** require mesh transport, peer invite, or merge wizard for core value.

### Mesh, merge, and multi-device sync → **backlog (post-v1 prototype)**

| Item | Was | Now |
|------|-----|-----|
| VS-7 Household mesh | v1 slice | **Backlog** — after standalone ship |
| VS-8 Merge wizard | post-dogfood | **Backlog** — depends on mesh |
| Two-device LAN sync PRD goal | v1 metric | **Deferred** — v1.5+ |

ADR-003 remains valid **design direction** when mesh lands; Attache keeps
`site_id`, `peer_identity` schema, and ledger-primary fields for forward
compatibility. No mesh code ships until the library is stable and scoped.

### Starsystem usage in Attache

| SS / Celestial concern | Attache v1 |
|------------------------|------------|
| `ss processes` (dev supervisor) | ✅ keep for dogfood dev |
| Mesh / vault-sync / process-manager **in mesh lib** | ❌ do not depend |
| Attache `@attache/core` vault | ✅ local `VaultPort` today |

When the unified lib ships, evaluate **adapters** — do not pre-integrate.

## Consequences

- **Positive:** No blocker on mesh lib; faster path to distributable prototype.
- **Positive:** Schema stays mesh-ready (`site_id`, peers) without runtime mesh.
- **Negative:** No two-device household sync until backlog item ships.
- **Negative:** Partner persona is view-only via export/backup, not live sync.

## v1 prototype priorities (after mesh deferral)

1. **VS-0.1** — SQLCipher + passphrase gate
2. **LedgerPort P0** — fake adapter; proper transfer posting model
3. **Standalone packaging** — installable app / single-command run (TBD plan)
4. **VS-9** — premium gate (optional)
5. **Mesh backlog** — integrate when `@celestial/mesh-core` (+ bundled SS features) is ready

## References

- [Backlog](../backlog.md)
- [ADR-003](./003-mesh-sync-substrate.md)
- [Mesh lib consumer requirements](../specs/mesh-lib-consumer-requirements.md)
