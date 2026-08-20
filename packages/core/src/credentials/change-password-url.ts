/**
 * Change-password URL hints (BL-7 P2).
 *
 * What: resolve a browser URL for manual password rotation — not automation.
 * Why: Chrome's `.well-known/change-password` and a few known hosts (Google)
 *      give agents a starting point after a HIBP hit. Attache never logs in.
 * How: no HTTP fetch in P2 — return URLs for the human/agent to open.
 */

/** Curated biller/bank domains — payee names alone rarely map without this. */
const NAME_TO_DOMAIN: Record<string, string> = {
  chase: "chase.com",
  "jpmorgan chase": "chase.com",
  fidelity: "fidelity.com",
  "bank of america": "bankofamerica.com",
  bofa: "bankofamerica.com",
  wells: "wellsfargo.com",
  "wells fargo": "wellsfargo.com",
  citi: "citi.com",
  citibank: "citi.com",
  amex: "americanexpress.com",
  "american express": "americanexpress.com",
  capital: "capitalone.com",
  "capital one": "capitalone.com",
  usaa: "usaa.com",
  paypal: "paypal.com",
  venmo: "venmo.com",
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Mailbox hosts with non-obvious account password pages. */
export function changePasswordUrlForEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at === trimmed.length - 1) {
    throw new Error("invalid email for change-password URL");
  }
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return "https://myaccount.google.com/signinoptions/password";
  }
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") {
    return "https://appleid.apple.com/account/manage";
  }
  return `https://${domain}/.well-known/change-password`;
}

/**
 * Institution or obligation payee name → change-password URL, if we know the domain.
 * Returns null when the name is too generic (e.g. "Rent") — honest negative space.
 */
export function changePasswordUrlForName(name: string): string | null {
  const key = normalizeName(name);
  if (!key) return null;

  const direct = NAME_TO_DOMAIN[key];
  if (direct) {
    return `https://${direct}/.well-known/change-password`;
  }

  for (const [needle, domain] of Object.entries(NAME_TO_DOMAIN)) {
    if (key.includes(needle) || needle.includes(key)) {
      return `https://${domain}/.well-known/change-password`;
    }
  }
  return null;
}
