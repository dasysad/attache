/**
 * Have I Been Pwned port (BL-7 P0).
 *
 * What: breach list for an *email*, never a password or payee name.
 * Why: event-driven hygiene without storing credentials (see ADR-016).
 */
export interface HibpBreach {
  name: string;
  breachDate: string;
}

export type HibpMode = "sandbox" | "live";

export interface HibpPort {
  readonly mode: HibpMode;
  breachesForEmail(email: string): Promise<HibpBreach[]>;
}
