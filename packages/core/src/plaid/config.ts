import { Configuration, PlaidEnvironments } from "plaid";

/**
 * Plaid API configuration from environment (slice 3).
 *
 * Required for live mode:
 *   PLAID_CLIENT_ID, PLAID_SECRET
 * Optional:
 *   PLAID_ENV=sandbox|development|production (default sandbox when keys present)
 */

export interface PlaidConfig {
  clientId: string;
  secret: string;
  /** Plaid API base URL (Configuration.basePath). */
  env: string;
}

export function isPlaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID?.trim() && process.env.PLAID_SECRET?.trim());
}

export function loadPlaidConfig(): PlaidConfig {
  const clientId = process.env.PLAID_CLIENT_ID?.trim();
  const secret = process.env.PLAID_SECRET?.trim();
  if (!clientId || !secret) {
    throw new Error("PLAID_CLIENT_ID and PLAID_SECRET are required for live Plaid");
  }
  const envName = (process.env.PLAID_ENV?.trim() ?? "sandbox").toLowerCase();
  const env = resolvePlaidEnv(envName);
  return { clientId, secret, env };
}

function resolvePlaidEnv(name: string): string {
  if (name === "production") return PlaidEnvironments.production;
  if (name === "development") return "https://development.plaid.com";
  return PlaidEnvironments.sandbox;
}

export function createPlaidConfiguration(config: PlaidConfig): Configuration {
  return new Configuration({
    basePath: config.env,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": config.clientId,
        "PLAID-SECRET": config.secret,
      },
    },
  });
}
