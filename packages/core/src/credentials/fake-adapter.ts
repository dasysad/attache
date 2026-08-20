/**
 * Deterministic HIBP stand-in (BL-7).
 *
 * WHAT: sandbox@gmail.com → Adobe 2013; every other email → [].
 * WHY: dogfood `attache credentials check --sandbox` without an HIBP key
 *      and without sending household addresses off-box.
 */
import type { HibpBreach, HibpPort } from "./hibp-port.js";

export const SANDBOX_HIBP_EMAIL = "sandbox@gmail.com";

export class FakeHibpAdapter implements HibpPort {
  readonly mode = "sandbox" as const;
  /** Emails actually queried — negative tests assert payees are absent. */
  readonly queried: string[] = [];

  async breachesForEmail(email: string): Promise<HibpBreach[]> {
    const normalized = email.trim().toLowerCase();
    this.queried.push(normalized);
    if (normalized === SANDBOX_HIBP_EMAIL) {
      return [{ name: "Adobe", breachDate: "2013-10-04" }];
    }
    return [];
  }
}
