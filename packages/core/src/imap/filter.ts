/**
 * Heuristic filter for bill-like email before extraction (VS-4.2 / ADR-015).
 * Why: avoid ingesting the whole mailbox — keywords required, not mere attachments.
 * Marketing mail with a .txt part must not become a bill (discover P1 negative).
 */

const BILL_KEYWORDS = [
  "bill",
  "invoice",
  "statement",
  "payment due",
  "amount due",
  "utility",
  "receipt",
  "autopay",
  "due date",
  "property tax",
  "premium due",
];

const MARKETING_MARKERS = [
  "unsubscribe",
  "% off",
  "percent off",
  "weekly newsletter",
  "weekly deals",
  "view in browser",
];

/**
 * Medical EOBs / PHI-looking mail stay unpromoted (ADR-015).
 * Why: we are not a health vault. An EOB can say "amount due" and still must drop.
 */
export function isLikelyPhiEmail(input: {
  subject: string;
  from: string;
  bodyText: string;
}): boolean {
  return isPhiHaystack(`${input.subject} ${input.from} ${input.bodyText}`);
}

export function isPhiHaystack(text: string): boolean {
  const hay = text.toLowerCase();
  if (hay.includes("explanation of benefits")) return true;
  if (hay.includes("hipaa")) return true;
  if (hay.includes("patient id")) return true;
  if (hay.includes("medical claim")) return true;
  if (hay.includes("lab result")) return true;
  if (hay.includes("health records")) return true;
  if (/\beob\b/.test(hay) || hay.includes("eob:")) return true;
  return false;
}

export function isLikelyBillEmail(input: {
  subject: string;
  from: string;
  bodyText: string;
  attachmentMimeTypes: string[];
}): boolean {
  if (isLikelyPhiEmail(input)) return false;
  const haystack = `${input.subject} ${input.from} ${input.bodyText}`.toLowerCase();
  if (isLikelyMarketingEmail(input)) return false;
  return BILL_KEYWORDS.some((k) => haystack.includes(k));
}

/**
 * Promo / newsletter mail. A Chase statement is not marketing even if the
 * footer says unsubscribe — financial keywords win in isLikelyBillEmail.
 */
export function isLikelyMarketingEmail(input: {
  subject: string;
  from: string;
  bodyText: string;
}): boolean {
  const haystack = `${input.subject} ${input.from} ${input.bodyText}`.toLowerCase();
  const fromLooksPromo =
    haystack.includes("deals@") ||
    haystack.includes("noreply-promo") ||
    haystack.includes("marketing@");
  const bodyLooksPromo = MARKETING_MARKERS.some((m) => haystack.includes(m));
  if (!fromLooksPromo && !bodyLooksPromo) return false;
  return !BILL_KEYWORDS.some((k) => haystack.includes(k));
}
