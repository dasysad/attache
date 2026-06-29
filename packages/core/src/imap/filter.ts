/**
 * Heuristic filter for bill-like email before extraction (VS-4.2).
 * Why: avoid ingesting entire mailbox on first poll.
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
];

const BILL_MIME_PREFIXES = [
  "text/plain",
  "application/pdf",
  "text/csv",
];

export function isLikelyBillEmail(input: {
  subject: string;
  from: string;
  bodyText: string;
  attachmentMimeTypes: string[];
}): boolean {
  const haystack = `${input.subject} ${input.from} ${input.bodyText}`.toLowerCase();
  if (BILL_KEYWORDS.some((k) => haystack.includes(k))) return true;
  return input.attachmentMimeTypes.some((m) =>
    BILL_MIME_PREFIXES.some((p) => m.toLowerCase().startsWith(p)),
  );
}
