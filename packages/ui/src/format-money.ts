/**
 * USD formatting for household finance UI.
 *
 * Sign convention (matches ledger + Plaid ingest):
 *   negative = outflow / debit
 *   positive = inflow / credit
 *
 * Used by att-money and row primitives so server, agents, and UI agree on display.
 */

/** How to prefix the formatted absolute value with a sign. */
export type MoneySignMode = "auto" | "always" | "never" | "accounting";

export interface FormatMoneyOptions {
  /** BCP 47 locale for grouping and symbol. */
  locale?: string;
  sign?: MoneySignMode;
  /** When false, rounds to whole dollars. Default true. */
  showCents?: boolean;
}

const MINUS = "−";

/**
 * Format a USD float (e.g. -42.5 → "−$42.50").
 */
export function formatMoneyUsd(
  amountUsd: number,
  options: FormatMoneyOptions = {},
): string {
  const { locale = "en-US", sign = "auto", showCents = true } = options;

  if (!Number.isFinite(amountUsd)) {
    return "—";
  }

  const abs = Math.abs(amountUsd);
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(abs);

  if (sign === "never") {
    return formatted;
  }

  if (sign === "accounting") {
    return amountUsd < 0 ? `(${formatted})` : formatted;
  }

  if (amountUsd < 0) {
    return `${MINUS}${formatted}`;
  }

  if (sign === "always" && amountUsd > 0) {
    return `+${formatted}`;
  }

  return formatted;
}

/** Format integer cents (TigerBeetle-style) as USD. */
export function formatMoneyCents(
  amountCents: number,
  options: FormatMoneyOptions = {},
): string {
  return formatMoneyUsd(amountCents / 100, options);
}

/**
 * Short calendar label for transaction and obligation rows.
 * Accepts ISO date strings or Date objects.
 */
export function formatShortDate(
  value: string | Date,
  locale = "en-US",
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
