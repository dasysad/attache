/**
 * HibpPort factory (BL-7).
 *
 * WHAT: HIBP_API_KEY → live; otherwise fake (no off-box calls).
 * WHY: tests and `--sandbox` force FakeHibpAdapter so CI never hits HIBP.
 */
import { FakeHibpAdapter } from "./fake-adapter.js";
import type { HibpPort } from "./hibp-port.js";
import { LiveHibpAdapter } from "./live-adapter.js";

let defaultHibp: HibpPort | undefined;

export function hibpApiKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = env.HIBP_API_KEY?.trim();
  return key ? key : null;
}

export function createHibpAdapter(
  env: NodeJS.ProcessEnv = process.env,
): HibpPort {
  const key = hibpApiKeyFromEnv(env);
  if (key) return new LiveHibpAdapter(key);
  return new FakeHibpAdapter();
}

export function getHibp(): HibpPort {
  if (!defaultHibp) defaultHibp = createHibpAdapter();
  return defaultHibp;
}

export function setHibpForTests(hibp: HibpPort | undefined): void {
  defaultHibp = hibp;
}
