import type { SnapTradeIngestPort } from "./port.js";
import { FakeSnapTradeAdapter } from "./fake-adapter.js";
import { LiveSnapTradeAdapter } from "./live-adapter.js";
import { isSnapTradeConfigured } from "./config.js";

/**
 * Factory — sandbox fake unless SnapTrade keys are configured (BL-5).
 */
export function createSnapTradeAdapter(): SnapTradeIngestPort {
  if (isSnapTradeConfigured()) {
    return new LiveSnapTradeAdapter();
  }
  return new FakeSnapTradeAdapter();
}

export { isSnapTradeConfigured };
