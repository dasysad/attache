# ADR-003: Household mesh sync substrate

Area: sync / infrastructure

- **Status:** proposed
- **Date:** 2026-06-22
- **Deciders:** founder
- **Depends on:** ADR-002 (household peers), ADR-001 (ledger primary)
- **Related:** Celestial ADR-076 (Starflow distributed execution / mesh),
  Celestial `VpnMeshPort`, `vault-sync` LWW pattern

## Context

Attache is **local-first** with:

- Optional zero-knowledge cloud backup (R2 + encrypted metadata).
- **Household mesh** — sync between family devices without cloud.
- One **ledger primary** per tenant (ADR-001); other peers are readers or
  forward sync to primary.

Celestial Intelligence already has mesh **patterns** but not a standalone product
library:

| Existing asset | What it provides |
|----------------|------------------|
| ADR-076 | CRDT/LWW registers, `site_id`, claim-with-version, conflict events |
| `vault-sync.ts` | Working LWW merge (`updatedAt` comparison) |
| `VpnMeshPort` | Adapter for WireGuard/Tailscale/P2P tunnel bring-up |
| `service-heartbeat` | `site_id` = hostname:pid, workspace-scoped presence |
| `swarm-state-module` | SpaceTimeDB health reports |
| ADR-076 Phase 3 | HTTP-pull peer fallback without SpaceTimeDB |

ADR-076 Phase 4 (SpaceTimeDB mesh transport) is **proposed**, not shipped.

## Decision

### Extract `@celestial/mesh` (or `@attache/mesh` initially)

Package a **transport-agnostic mesh library** from Celestial patterns; Attache
depends on it as a normal npm dependency. The library owns:

1. **`PeerIdentity`** — stable `site_id` per install (UUID persisted at first run).
2. **`SyncEnvelope`** — encrypted payload + schema version + `tenant_id` + slot key.
3. **`LwwRegister<T>`** — version + site_id + wall_clock; conflict surfacing.
4. **`ClaimLease`** — who may write ledger-primary / run rules on this tenant.
5. **`MeshTransport` port** — pluggable sync channel.

```typescript
interface MeshTransport {
  readonly kind: "spacetime" | "http_pull" | "lan_gossip";
  publish(envelope: SyncEnvelope): Promise<void>;
  subscribe(handler: (envelope: SyncEnvelope) => void): Promise<Unsubscribe>;
  listPeers(tenantId: string): Promise<PeerIdentity[]>;
}
```

### SpaceTimeDB is implied only as a transport adapter — not required

**Do not** couple Attache v1 to SpaceTimeDB for mesh to function.

| Transport | When | Notes |
|-----------|------|-------|
| `lan_gossip` | Same Wi-Fi household | mDNS peer discovery + direct HTTPS; v1 default for dogfooding |
| `http_pull` | Intermittent connectivity | ADR-076 Phase 3 pattern; peer exposes `/mesh/pull` |
| `spacetime` | When CI mesh is production-ready | Reuse `swarm-state-module` patterns; optional premium hosted path |
| `VpnMeshPort` | Remote household members | Tailscale/WireGuard before app-level sync |

SpaceTimeDB remains valuable for **realtime UI** (approval queue, live runway)
even when mesh sync uses LAN — two concerns, two adapters.

### What syncs over mesh

| Data | CRDT/LWW | Notes |
|------|----------|-------|
| SQLite encrypted deltas | LWW per table row or changelog batch | Main household state |
| Calendar events | LWW per `event_id` | Provenance preserved (ADR-004) |
| Obligations | LWW | |
| TigerBeetle ledger | **No peer-to-peer ledger** | Primary site only; others fetch balance snapshots |
| Vault secrets | Never over mesh plaintext | Platform vault for API keys only |
| R2 backup pointers | Metadata only | Ciphertext already on R2 |

### Household discovery

1. Tenant admin generates **invite token** (QR / short code).
2. Joining device presents token → mutual key exchange (Noise protocol or SPAKE2).
3. Peers register in local `peer_registry` table; optional `VpnMeshPort` for WAN.
4. `ClaimLease` ensures one `ledger_primary` — conflict → UI merge prompt.

### Extraction plan (Celestial → shared package)

| Phase | Work |
|-------|------|
| P0 | Create `packages/mesh-core` in celestial-intelligence with types + LWW + tests |
| P1 | Port `vault-sync` LWW into generic `LwwRegister` |
| P2 | `LanGossipTransport` + invite flow |
| P3 | Attache imports `@celestial/mesh-core`; dogfood household sync |
| P4 | `SpacetimeMeshTransport` when ADR-076 Phase 4 lands |

Attache does **not** fork mesh logic — it consumes the package.

## Alternatives considered

| Option | Verdict |
|--------|---------|
| Attache builds mesh from scratch | Duplicates ADR-076 investment |
| SpaceTimeDB required day one | Blocks offline household; overkill for v1 |
| Supabase realtime as mesh | Not local-first; cloud dependency |
| Syncthing embed | Good UX, less control over conflict model and tenant isolation |

## Consequences

- Mesh library is a **Celestial platform product** Attache dogfoods first.
- v1 household sync works on LAN without SpaceTimeDB.
- Ledger stays single-primary; mesh does not create split-brain money state.
- Conflict UI required — silent merge unacceptable for obligations/calendar.

## Open questions

- Noise vs SPAKE2 for invite pairing — pick during P1 implementation.
- Whether teen view-only devices participate in mesh write or pull-only.
