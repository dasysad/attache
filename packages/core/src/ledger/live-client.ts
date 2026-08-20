/**
 * Live tigerbeetle-node wrapper (ADR-001 P1).
 *
 * WHAT: map dense Create*Status results onto string names the adapter uses.
 * WHY: keep FakeTigerBeetleClient free of the native addon while sharing
 *      status strings (`created`, `exists`, `exceeds_credits`, …).
 */
import {
  createClient,
  CreateAccountStatus,
  CreateTransferStatus,
  type Account,
  type Transfer,
} from "tigerbeetle-node";
import type { TbAccount, TbCreateResult, TbTransfer, TigerBeetleClient } from "./client.js";

export interface LiveTigerBeetleClientOptions {
  clusterId: bigint;
  replicaAddresses: string[];
}

function accountStatusName(status: number): string {
  if (status === CreateAccountStatus.created) return "created";
  return CreateAccountStatus[status] ?? `unknown_${status}`;
}

function transferStatusName(status: number): string {
  if (status === CreateTransferStatus.created) return "created";
  return CreateTransferStatus[status] ?? `unknown_${status}`;
}

export class LiveTigerBeetleClient implements TigerBeetleClient {
  private readonly inner: ReturnType<typeof createClient>;

  constructor(options: LiveTigerBeetleClientOptions) {
    this.inner = createClient({
      cluster_id: options.clusterId,
      replica_addresses: options.replicaAddresses,
    });
  }

  async createAccounts(batch: TbAccount[]): Promise<TbCreateResult[]> {
    const results = await this.inner.createAccounts(batch as Account[]);
    return results.map((r) => ({
      timestamp: r.timestamp,
      status: accountStatusName(r.status),
    }));
  }

  async createTransfers(batch: TbTransfer[]): Promise<TbCreateResult[]> {
    const results = await this.inner.createTransfers(batch as Transfer[]);
    return results.map((r) => ({
      timestamp: r.timestamp,
      status: transferStatusName(r.status),
    }));
  }

  async lookupAccounts(ids: bigint[]): Promise<TbAccount[]> {
    return (await this.inner.lookupAccounts(ids)) as TbAccount[];
  }

  async lookupTransfers(ids: bigint[]): Promise<TbTransfer[]> {
    return (await this.inner.lookupTransfers(ids)) as TbTransfer[];
  }

  destroy(): void {
    this.inner.destroy();
  }
}
