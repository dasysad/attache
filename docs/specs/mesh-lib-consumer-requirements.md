# Mesh library consumer requirements (Attache → Starsystem)

**Audience:** Starsystem / `@celestial/mesh-core` extraction team  
**From:** Attache product  
**Date:** 2026-06-22  
**Related:** ADR-003 (Attache), ADR-076 (Starflow mesh), `VpnMeshPort`

## One-paragraph ask

Attache needs a **transport-agnostic household sync library** extracted from Starsystem
mesh patterns so multiple family devices can sync encrypted app state over LAN (and
optionally WAN via VPN) **without requiring cloud or SpaceTimeDB**. We will import
`@celestial/mesh-core` as an npm dependency; we should not fork CRDT or peer identity
logic into Attache.

## What Attache syncs (and what we do not)

| Data | Over mesh | Notes |
|------|-----------|-------|
| SQLite changelog / encrypted blobs | ✅ | Primary payload |
| Calendar events, obligations | ✅ | LWW per entity id |
| Ledger balance snapshots | ✅ read-only replicas | **Not** TigerBeetle writes |
| API secrets (Plaid, etc.) | ❌ | Platform vault only |
| User passphrase / DEK | ❌ | Never leaves device |

## Required API surface (minimum viable)

### 1. Identity

```typescript
interface PeerIdentity {
  siteId: string;           // stable per install, persisted
  tenantId: string;
  displayName: string;
  role: "primary" | "replica";
  lastSeenAt: string;
}

function getOrCreateSiteId(dataDir: string): string;
```

### 2. LWW register (from ADR-076 / vault-sync pattern)

```typescript
interface LwwValue<T> {
  value: T;
  version: bigint;
  siteId: string;
  wallClock: string;
}

interface LwwRegister<T> {
  write(slot: string, value: T): LwwValue<T>;
  read(slot: string): LwwValue<T> | null;
  merge(remote: LwwValue<T>): { applied: boolean; conflict?: LwwValue<T> };
}
```

We need **conflict surfacing** (event/callback), not silent last-writer wins on
financial or calendar slots.

### 3. Encrypted sync envelope

```typescript
interface SyncEnvelope {
  tenantId: string;
  slot: string;              // e.g. "obligation:uuid" or "changelog:batch:123"
  ciphertext: Uint8Array;    // app encrypts before mesh; mesh does not decrypt
  schemaVersion: number;
  lww: { version: bigint; siteId: string };
}
```

Mesh library handles **transport + ordering + dedup**; Attache owns **encryption**.

### 4. Lease / primary election

```typescript
interface ClaimLease {
  resource: string;          // e.g. "ledger-primary" | "rule-runner"
  claimantSiteId: string;
  version: bigint;
  expiresAt: string;
}

interface LeasePort {
  claim(resource: string, ttlMs: number): Promise<ClaimResult>;
  release(resource: string): Promise<void>;
  observe(resource: string): Promise<ClaimLease | null>;
}
```

One **ledger-primary** per household tenant (TigerBeetle writer). Others are replicas.

### 5. Transport port (pluggable)

```typescript
interface MeshTransport {
  readonly kind: "lan_gossip" | "http_pull" | "spacetime";
  publish(envelope: SyncEnvelope): Promise<void>;
  subscribe(handler: (envelope: SyncEnvelope) => void): Promise<Unsubscribe>;
  listPeers(tenantId: string): Promise<PeerIdentity[]>;
}
```

**v1 requirement:** `lan_gossip` + `http_pull` implementations.  
**v2:** `spacetime` adapter when CI mesh transport is production-ready.

SpaceTimeDB must **not** be a hard dependency of the core package — only an optional
adapter package (e.g. `@celestial/mesh-transport-spacetime`).

### 6. Household invite / pairing

```typescript
interface InviteSession {
  inviteCode: string;        // short code or QR payload
  tenantId: string;
  expiresAt: string;
}

interface PairingPort {
  createInvite(tenantId: string): Promise<InviteSession>;
  acceptInvite(code: string, localSiteId: string): Promise<PeerIdentity[]>;
}
```

Mutual trust establishment (Noise/SPAKE2 or equivalent) can live inside pairing;
Attache should not implement crypto pairing itself.

### 7. Events (for UI + agents)

```typescript
type MeshEvent =
  | { type: "peer_joined"; peer: PeerIdentity }
  | { type: "peer_left"; siteId: string }
  | { type: "sync_received"; slot: string }
  | { type: "conflict"; slot: string; local: LwwValue<unknown>; remote: LwwValue<unknown> }
  | { type: "lease_changed"; resource: string; lease: ClaimLease | null };
```

## Integration with existing Starsystem pieces

Please align extraction with:

| Existing | Reuse as |
|----------|----------|
| ADR-076 CRDT/LWW semantics | Core merge rules |
| `vault-sync.ts` LWW | Reference implementation |
| `VpnMeshPort` | Optional WAN underlay (not in mesh-core dep tree) |
| `site_id` / heartbeat identity | `PeerIdentity` source |
| SpaceTimeDB modules | Optional transport adapter only |

## Non-goals for mesh-core (Attache does not need)

- Starflow workflow run state replication
- Vault secret sync
- Multi-tenant SaaS operator mesh (fleet-scale)
- Automatic TigerBeetle replication

## Acceptance criteria (for Attache to adopt)

1. Two laptops on same LAN sync a test `SyncEnvelope` within 5s without cloud.
2. LWW conflict on same slot emits `conflict` event to subscriber.
3. `claim("ledger-primary")` prevents second writer until lease expires or releases.
4. Package runs in Node 22+ with **zero** SpaceTimeDB install for LAN-only mode.
5. TypeScript types published; tree-shakeable ESM.

## Timeline (Attache)

| Phase | Need |
|-------|------|
| Dogfood (now) | Not blocking — local SQLite single device |
| Post-dogfood | `lan_gossip` + invite + LWW + lease |
| Later | `spacetime` transport, WAN via `VpnMeshPort` |

## Contact / questions

- Attache ADR-003: `docs/adr/003-mesh-sync-substrate.md`
- Product: household mesh, optional cloud backup, ledger primary election
