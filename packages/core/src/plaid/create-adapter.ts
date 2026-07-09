import type { PlaidIngestPort } from "../ingest/plaid-port.js";
import { FakePlaidAdapter } from "../ingest/fake-plaid-adapter.js";
import { LivePlaidAdapter } from "../ingest/live-plaid-adapter.js";
import { isPlaidConfigured } from "./config.js";

/**
 * Factory — sandbox fake unless Plaid keys are configured (slice 3).
 *
 * Set PLAID_CLIENT_ID + PLAID_SECRET (+ optional PLAID_ENV) for live mode.
 * Agents without keys keep using FakePlaidAdapter for offline dev.
 */
export function createPlaidAdapter(): PlaidIngestPort {
  if (isPlaidConfigured()) {
    return new LivePlaidAdapter();
  }
  return new FakePlaidAdapter();
}

export { isPlaidConfigured };
