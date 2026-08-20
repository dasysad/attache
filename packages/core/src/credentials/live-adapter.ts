/**
 * Live HIBP v3 adapter (BL-7).
 *
 * WHAT: GET /breachedaccount/{email} with hibp-api-key.
 * WHY: real breach signal for connected mailbox addresses only.
 * HOW: 404 → no breaches (HIBP convention). Never send passwords.
 */
import type { HibpBreach, HibpPort } from "./hibp-port.js";

const HIBP_BASE = "https://haveibeenpwned.com/api/v3/breachedaccount";

export class LiveHibpAdapter implements HibpPort {
  readonly mode = "live" as const;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async breachesForEmail(email: string): Promise<HibpBreach[]> {
    const trimmed = email.trim();
    if (!trimmed.includes("@")) {
      throw new Error("HIBP only accepts email addresses");
    }
    const url = `${HIBP_BASE}/${encodeURIComponent(trimmed)}?truncateResponse=false`;
    const res = await this.fetchImpl(url, {
      headers: {
        "hibp-api-key": this.apiKey,
        "user-agent": "attache-local-household",
      },
    });
    if (res.status === 404) return [];
    if (res.status === 429) {
      throw new Error("HIBP rate limited — retry later");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `HIBP HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      );
    }
    const rows = (await res.json()) as Array<{
      Name?: string;
      BreachDate?: string;
    }>;
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => ({
      name: String(row.Name ?? "Unknown"),
      breachDate: String(row.BreachDate ?? ""),
    }));
  }
}
