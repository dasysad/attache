/**
 * Agent-readable ACH rail status (BL-12).
 */
import type Database from "better-sqlite3";
import { isOnboarded } from "../tenant.js";
import { achBackendFromEnv, type AchBackend } from "./config.js";
import { getAch } from "./create-adapter.js";
import { listAchTransfers, type AchTransferRecord } from "./store.js";

export interface AchStatus {
  backend: AchBackend;
  mode: "sandbox" | "live" | null;
  enabled: boolean;
  transfers: AchTransferRecord[];
  hint: string;
}

export function achStatus(
  db?: Database.Database,
  env: NodeJS.ProcessEnv = process.env,
): AchStatus {
  const backend = achBackendFromEnv(env);
  let mode: AchStatus["mode"] = null;
  if (backend !== "off") {
    try {
      mode = getAch()?.mode ?? null;
    } catch {
      mode = null;
    }
  }
  const transfers =
    db && isOnboarded(db) ? listAchTransfers(db) : [];
  const hint =
    backend === "off"
      ? "ACH off — Plaid legs stay approval-only. Set ATTACHE_ACH=sandbox to dogfood."
      : backend === "sandbox"
        ? "Sandbox ACH — not a real bank move. Approve Plaid A2A then: attache ach simulate <id>"
        : "Live Plaid Transfer — A2A debit+credit. Production needs a funded Transfer ledger.";
  return {
    backend,
    mode,
    enabled: backend !== "off",
    transfers,
    hint,
  };
}
