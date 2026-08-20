import type { SnapTradeConnection } from "../domain.js";
import type {
  SnapTradeIngestPort,
  SnapTradeSyncSnapshot,
} from "./port.js";

/**
 * Deterministic SnapTrade sandbox — one Fidelity brokerage with cash + equity.
 * Why: dogfood My Accounts + agents without SNAPTRADE_* keys (mirror FakePlaid).
 */
export class FakeSnapTradeAdapter implements SnapTradeIngestPort {
  readonly mode = "sandbox" as const;

  async ensureUser(input: {
    externalUserId: string;
    existingUserSecret?: string | null;
  }): Promise<{
    externalUserId: string;
    userSecret: string;
    portalUrl: string | null;
  }> {
    return {
      externalUserId: input.externalUserId,
      userSecret: input.existingUserSecret ?? `sandbox_secret_${input.externalUserId}`,
      portalUrl: null,
    };
  }

  async fetchSnapshot(
    connection: SnapTradeConnection,
    _userSecret: string,
  ): Promise<SnapTradeSyncSnapshot> {
    const brokerageName = "Fidelity (sandbox)";
    return {
      brokerageName,
      accounts: [
        {
          snaptradeAccountId: `st_brokerage_${connection.id}`,
          name: "Individual Brokerage",
          number: "4821",
          balanceUsd: 42_150.75,
          brokerageName,
        },
        {
          snaptradeAccountId: `st_ira_${connection.id}`,
          name: "Roth IRA",
          number: "9910",
          balanceUsd: 18_320.0,
          brokerageName,
        },
      ],
      positions: [
        {
          symbol: "VTI",
          units: 45.2,
          priceUsd: 265.1,
          marketValueUsd: 11_982.52,
          snaptradeAccountId: `st_brokerage_${connection.id}`,
        },
        {
          symbol: "VXUS",
          units: 120,
          priceUsd: 62.4,
          marketValueUsd: 7_488.0,
          snaptradeAccountId: `st_ira_${connection.id}`,
        },
      ],
    };
  }
}
