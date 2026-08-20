/**
 * AchPort factory (ADR-013).
 *
 * WHAT: off → no adapter; sandbox → fake; plaid → live REST (needs PLAID_*).
 * WHY: tests inject FakeAchAdapter via setAchForTests; production never
 *      silently enables a rail.
 */
import { isPlaidConfigured } from "../plaid/config.js";
import { achBackendFromEnv } from "./config.js";
import { FakeAchAdapter } from "./fake-adapter.js";
import { LivePlaidAchAdapter } from "./live-adapter.js";
import type { AchPort } from "./port.js";

let defaultAch: AchPort | null | undefined;

export function createAchAdapter(
  env: NodeJS.ProcessEnv = process.env,
): AchPort | null {
  const backend = achBackendFromEnv(env);
  if (backend === "off") return null;
  if (backend === "sandbox") return new FakeAchAdapter();
  if (!isPlaidConfigured()) {
    throw new Error(
      "ATTACHE_ACH=plaid requires PLAID_CLIENT_ID and PLAID_SECRET",
    );
  }
  return new LivePlaidAchAdapter();
}

export function getAch(): AchPort | null {
  if (defaultAch === undefined) defaultAch = createAchAdapter();
  return defaultAch;
}

export function setAchForTests(ach: AchPort | null | undefined): void {
  defaultAch = ach;
}
