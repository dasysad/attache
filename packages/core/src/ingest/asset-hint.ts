/**
 * Thin asset hints from mail (ADR-015 P4).
 *
 * What: classify property-tax / auto-policy mail as home | vehicle.
 * Why: payees already live on obligations (entities); assets are optional
 *      net-worth placeholders — not a document store, not a DMS.
 * HITL: discover may *hint*; confirmAssetHint is the only writer.
 * PHI: never an asset hint (isPhiHaystack).
 */
import { isPhiHaystack } from "../imap/filter.js";

export const HOUSEHOLD_ASSET_KINDS = ["home", "vehicle"] as const;
export type HouseholdAssetKind = (typeof HOUSEHOLD_ASSET_KINDS)[number];

export interface AssetHint {
  kind: HouseholdAssetKind;
  /** Short display name — payee if present, else Home / Vehicle. */
  label: string;
}

const HOME_MARKERS = [
  "property tax",
  "real estate tax",
  "county tax collector",
  "homeowner",
  "homeowners insurance",
  "homeowner's insurance",
  "home insurance",
  "dwelling coverage",
  "mortgage escrow",
];

const VEHICLE_MARKERS = [
  "auto insurance",
  "car insurance",
  "vehicle insurance",
  "automobile insurance",
  "vehicle registration",
  "car registration",
  "vin:",
  "vin ",
];

export function parseHouseholdAssetKind(raw: string | undefined): HouseholdAssetKind {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "home" || v === "vehicle") return v;
  throw new Error("asset kind must be home or vehicle");
}

/**
 * Infer a home/vehicle hint from extracted mail. Generic "insurance" or "tax"
 * is not enough — health premiums stay bills without an asset.
 */
export function inferAssetHint(input: {
  payee?: string | null;
  filename?: string | null;
  rawText?: string | null;
}): AssetHint | null {
  const blob = `${input.payee ?? ""} ${input.filename ?? ""} ${input.rawText ?? ""}`;
  if (isPhiHaystack(blob)) return null;
  const hay = blob.toLowerCase();
  const payee = input.payee?.trim() || null;
  if (HOME_MARKERS.some((m) => hay.includes(m))) {
    return { kind: "home", label: payee ?? "Home" };
  }
  if (VEHICLE_MARKERS.some((m) => hay.includes(m))) {
    return { kind: "vehicle", label: payee ?? "Vehicle" };
  }
  return null;
}
