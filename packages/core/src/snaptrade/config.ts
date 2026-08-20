/**
 * SnapTrade API configuration from environment (BL-5).
 *
 * Required for live mode:
 *   SNAPTRADE_CLIENT_ID, SNAPTRADE_CONSUMER_KEY
 */

export interface SnapTradeConfig {
  clientId: string;
  consumerKey: string;
}

export function isSnapTradeConfigured(): boolean {
  return Boolean(
    process.env.SNAPTRADE_CLIENT_ID?.trim() &&
      process.env.SNAPTRADE_CONSUMER_KEY?.trim(),
  );
}

export function loadSnapTradeConfig(): SnapTradeConfig {
  const clientId = process.env.SNAPTRADE_CLIENT_ID?.trim();
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY?.trim();
  if (!clientId || !consumerKey) {
    throw new Error(
      "SnapTrade not configured — set SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY",
    );
  }
  return { clientId, consumerKey };
}
