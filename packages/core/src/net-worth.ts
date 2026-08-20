/**
 * Net worth — assets minus liabilities. Honest even when liabilities are zero.
 *
 * Liquid funds the runway; brokerage is invested; credit/loan are owed.
 * See ADR-014 P2.
 */
import type { FundingAccountKind } from "./domain.js";
import type { HouseholdAsset } from "./household-asset.js";
import {
  isLiabilityKind,
  isLiquidKind,
  sumLiabilityUsd,
  sumLiquidBalanceUsd,
} from "./account.js";
import { sumBrokerageUsd } from "./command-center.js";

export interface NetWorthSnapshot {
  liquidUsd: number;
  investedUsd: number;
  /** Sum of household_asset.estimatedUsd when set. Unvalued rows are omitted. */
  otherAssetsUsd: number;
  unvaluedAssetCount: number;
  householdAssetCount: number;
  assetsUsd: number;
  liabilitiesUsd: number;
  netWorthUsd: number;
  hasLiabilities: boolean;
}

export function computeNetWorth(
  accounts: Array<{ balanceUsd: number; kind?: FundingAccountKind | string }>,
  householdAssets: Array<Pick<HouseholdAsset, "estimatedUsd">> = [],
): NetWorthSnapshot {
  const liquidUsd = sumLiquidBalanceUsd(accounts);
  const investedUsd = sumBrokerageUsd(accounts);
  const liabilitiesUsd = sumLiabilityUsd(accounts);
  let otherAssetsUsd = 0;
  let unvaluedAssetCount = 0;
  for (const a of householdAssets) {
    if (a.estimatedUsd === null) unvaluedAssetCount += 1;
    else otherAssetsUsd += a.estimatedUsd;
  }
  const assetsUsd = liquidUsd + investedUsd + otherAssetsUsd;
  return {
    liquidUsd,
    investedUsd,
    otherAssetsUsd,
    unvaluedAssetCount,
    householdAssetCount: householdAssets.length,
    assetsUsd,
    liabilitiesUsd,
    netWorthUsd: assetsUsd - liabilitiesUsd,
    hasLiabilities: accounts.some((a) => isLiabilityKind(a.kind)),
  };
}

/** Re-export so callers can split asset vs debt rows without importing account.ts. */
export { isLiabilityKind, isLiquidKind };
