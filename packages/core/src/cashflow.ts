/**
 * Cash-flow by category — posted bank transactions only.
 *
 * Why: Plaid already stores `category`; we do not invent a taxonomy or Sankey.
 * Uncategorized spend still shows so the household can recategorize via CLI/MCP.
 * P3 adds period-over-period trend (`computeCashflowTrend`) — not a Sankey.
 * See ADR-014.
 */
import type Database from "better-sqlite3";
import { listTransactions } from "./plaid/store.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_DAY = 86_400_000;
/** Household windows rarely exceed this; we refuse to silently truncate a month. */
const CASHFLOW_TX_LIMIT = 5000;

export interface CashflowBucket {
  category: string;
  /** Deposits / refunds (positive amounts). */
  inflowUsd: number;
  /** Spend as a positive number (absolute value of negative amounts). */
  outflowUsd: number;
  netUsd: number;
  count: number;
}

export interface CashflowReport {
  fromDate: string;
  toDate: string;
  inflowUsd: number;
  outflowUsd: number;
  netUsd: number;
  uncategorizedCount: number;
  buckets: CashflowBucket[];
}

export interface CashflowDayPoint {
  date: string;
  inflowUsd: number;
  outflowUsd: number;
}

export interface CashflowCategoryDelta {
  category: string;
  currentOutflowUsd: number;
  priorOutflowUsd: number;
  /** current − prior; positive = spending more. */
  deltaUsd: number;
  /** null when prior outflow is 0 (new category or no baseline). */
  deltaPct: number | null;
}

export interface CashflowTrend {
  current: CashflowReport;
  prior: CashflowReport;
  outflowDeltaUsd: number;
  inflowDeltaUsd: number;
  netDeltaUsd: number;
  /** Empty when the current window has no posted txs — no hollow sparkline. */
  series: CashflowDayPoint[];
  categories: CashflowCategoryDelta[];
}

function parseUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function formatUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function defaultCashflowRange(today = new Date()): { fromDate: string; toDate: string } {
  const end = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const start = new Date(end.getTime() - 29 * MS_DAY);
  return {
    fromDate: formatUtcDate(start),
    toDate: formatUtcDate(end),
  };
}

/**
 * Equal-length window immediately before [fromDate, toDate], no overlap.
 * Why: period-over-period spend is the P3 trend — not a Sankey (ADR-014).
 */
export function priorCashflowRange(
  fromDate: string,
  toDate: string,
): { fromDate: string; toDate: string } {
  if (!ISO_DATE.test(fromDate) || !ISO_DATE.test(toDate)) {
    throw new Error("fromDate and toDate must be YYYY-MM-DD");
  }
  const from = parseUtcDate(fromDate);
  const to = parseUtcDate(toDate);
  if (to.getTime() < from.getTime()) {
    throw new Error("toDate must be on or after fromDate");
  }
  const days = Math.round((to.getTime() - from.getTime()) / MS_DAY) + 1;
  const priorTo = new Date(from.getTime() - MS_DAY);
  const priorFrom = new Date(priorTo.getTime() - (days - 1) * MS_DAY);
  return { fromDate: formatUtcDate(priorFrom), toDate: formatUtcDate(priorTo) };
}

function assertIsoRange(fromDate: string, toDate: string): void {
  if (!ISO_DATE.test(fromDate) || !ISO_DATE.test(toDate)) {
    throw new Error("fromDate and toDate must be YYYY-MM-DD");
  }
  if (parseUtcDate(toDate).getTime() < parseUtcDate(fromDate).getTime()) {
    throw new Error("toDate must be on or after fromDate");
  }
}

/**
 * Aggregate posted transactions in [fromDate, toDate].
 * Pending rows are excluded — they are not cash yet.
 */
export function computeCashflow(
  db: Database.Database,
  range: { fromDate?: string; toDate?: string } = {},
): CashflowReport {
  const fallback = defaultCashflowRange();
  const fromDate = range.fromDate || fallback.fromDate;
  const toDate = range.toDate || fallback.toDate;
  assertIsoRange(fromDate, toDate);

  const txs = listTransactions(db, {
    pending: false,
    fromDate,
    toDate,
    limit: CASHFLOW_TX_LIMIT,
  });

  const byCategory = new Map<string, CashflowBucket>();
  let uncategorizedCount = 0;

  for (const t of txs) {
    const label = t.category?.trim() || "(uncategorized)";
    if (!t.category?.trim()) uncategorizedCount += 1;
    const bucket = byCategory.get(label) ?? {
      category: label,
      inflowUsd: 0,
      outflowUsd: 0,
      netUsd: 0,
      count: 0,
    };
    if (t.amountUsd >= 0) bucket.inflowUsd += t.amountUsd;
    else bucket.outflowUsd += Math.abs(t.amountUsd);
    bucket.netUsd = bucket.inflowUsd - bucket.outflowUsd;
    bucket.count += 1;
    byCategory.set(label, bucket);
  }

  const buckets = [...byCategory.values()].sort((a, b) => {
    if (b.outflowUsd !== a.outflowUsd) return b.outflowUsd - a.outflowUsd;
    return b.inflowUsd - a.inflowUsd;
  });

  const inflowUsd = buckets.reduce((s, b) => s + b.inflowUsd, 0);
  const outflowUsd = buckets.reduce((s, b) => s + b.outflowUsd, 0);

  return {
    fromDate,
    toDate,
    inflowUsd,
    outflowUsd,
    netUsd: inflowUsd - outflowUsd,
    uncategorizedCount,
    buckets,
  };
}

function outflowByCategory(report: CashflowReport): Map<string, number> {
  const map = new Map<string, number>();
  for (const b of report.buckets) map.set(b.category, b.outflowUsd);
  return map;
}

function dailySeries(
  db: Database.Database,
  fromDate: string,
  toDate: string,
): CashflowDayPoint[] {
  const txs = listTransactions(db, {
    pending: false,
    fromDate,
    toDate,
    limit: CASHFLOW_TX_LIMIT,
  });
  const byDay = new Map<string, CashflowDayPoint>();
  for (const t of txs) {
    const point = byDay.get(t.postedDate) ?? {
      date: t.postedDate,
      inflowUsd: 0,
      outflowUsd: 0,
    };
    if (t.amountUsd >= 0) point.inflowUsd += t.amountUsd;
    else point.outflowUsd += Math.abs(t.amountUsd);
    byDay.set(t.postedDate, point);
  }
  if (byDay.size === 0) return [];

  const series: CashflowDayPoint[] = [];
  let cursor = parseUtcDate(fromDate);
  const end = parseUtcDate(toDate);
  while (cursor.getTime() <= end.getTime()) {
    const date = formatUtcDate(cursor);
    series.push(byDay.get(date) ?? { date, inflowUsd: 0, outflowUsd: 0 });
    cursor = new Date(cursor.getTime() + MS_DAY);
  }
  return series;
}

/**
 * Current window vs the equal-length prior window.
 * Series is empty when the current window has no posted txs (no hollow chart).
 */
export function computeCashflowTrend(
  db: Database.Database,
  range: { fromDate?: string; toDate?: string } = {},
): CashflowTrend {
  const current = computeCashflow(db, range);
  const priorWindow = priorCashflowRange(current.fromDate, current.toDate);
  const prior = computeCashflow(db, priorWindow);

  const currentOut = outflowByCategory(current);
  const priorOut = outflowByCategory(prior);
  const names = new Set([...currentOut.keys(), ...priorOut.keys()]);
  const categories: CashflowCategoryDelta[] = [...names].map((category) => {
    const currentOutflowUsd = currentOut.get(category) ?? 0;
    const priorOutflowUsd = priorOut.get(category) ?? 0;
    const deltaUsd = currentOutflowUsd - priorOutflowUsd;
    return {
      category,
      currentOutflowUsd,
      priorOutflowUsd,
      deltaUsd,
      deltaPct: priorOutflowUsd === 0 ? null : deltaUsd / priorOutflowUsd,
    };
  });
  categories.sort((a, b) => Math.abs(b.deltaUsd) - Math.abs(a.deltaUsd));

  return {
    current,
    prior,
    outflowDeltaUsd: current.outflowUsd - prior.outflowUsd,
    inflowDeltaUsd: current.inflowUsd - prior.inflowUsd,
    netDeltaUsd: current.netUsd - prior.netUsd,
    series: dailySeries(db, current.fromDate, current.toDate),
    categories,
  };
}
