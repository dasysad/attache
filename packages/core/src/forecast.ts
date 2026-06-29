/**
 * 30-day solvency forecast — manual accounts + obligation schedule.
 *
 * Runway = days until projected balance goes negative within the horizon.
 * Recurrence expands monthly/yearly anchors into due dates inside the window.
 */
import type {
  FundingAccount,
  Obligation,
  ObligationDisplayStatus,
  ObligationOccurrence,
  SolvencyForecast,
} from "./domain.js";

const MS_DAY = 86_400_000;

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_DAY);
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_DAY);
}

function displayStatus(
  due: Date,
  today: Date,
  paid: boolean,
  autopay: boolean,
): ObligationDisplayStatus {
  if (paid) return "paid";
  const delta = daysBetween(today, due);
  if (delta < 0) return "overdue";
  if (delta <= 3) return "due_soon";
  if (autopay && delta <= 14) return "scheduled";
  return "upcoming";
}

/**
 * Expand one obligation into occurrences within [from, to] inclusive.
 * Skips paid obligations entirely.
 */
export function expandObligation(
  ob: Obligation,
  from: Date,
  to: Date,
  today: Date,
): ObligationOccurrence[] {
  if (ob.paidAt) return [];

  const out: ObligationOccurrence[] = [];
  const anchor = parseIsoDate(ob.dueDate);

  const push = (date: Date) => {
    if (date < from || date > to) return;
    const iso = formatIsoDate(date);
    out.push({
      obligationId: ob.id,
      payee: ob.payee,
      date: iso,
      amountUsd: ob.amountUsd,
      autopay: ob.autopay,
      provenance: ob.provenance,
      status: displayStatus(date, today, false, ob.autopay),
    });
  };

  if (ob.cadence === "once") {
    push(anchor);
    return out;
  }

  if (ob.cadence === "monthly") {
    let cursor = new Date(anchor);
    while (cursor < from) {
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()));
    }
    while (cursor <= to) {
      push(cursor);
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()));
    }
    return out;
  }

  // yearly
  let cursor = new Date(anchor);
  while (cursor < from) {
    cursor = new Date(Date.UTC(cursor.getUTCFullYear() + 1, cursor.getUTCMonth(), cursor.getUTCDate()));
  }
  while (cursor <= to) {
    push(cursor);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear() + 1, cursor.getUTCMonth(), cursor.getUTCDate()));
  }
  return out;
}

export function computeSolvencyForecast(
  accounts: FundingAccount[],
  obligations: Obligation[],
  horizonDays = 30,
): SolvencyForecast {
  const today = startOfTodayUtc();
  const end = addDays(today, horizonDays - 1);

  const liquidBalanceUsd = accounts.reduce((s, a) => s + a.balanceUsd, 0);

  const occurrences: ObligationOccurrence[] = [];
  for (const ob of obligations) {
    occurrences.push(...expandObligation(ob, today, end, today));
  }
  occurrences.sort((a, b) => a.date.localeCompare(b.date));

  const dueByDate = new Map<string, number>();
  for (const occ of occurrences) {
    dueByDate.set(occ.date, (dueByDate.get(occ.date) ?? 0) + occ.amountUsd);
  }

  const series = [];
  let balance = liquidBalanceUsd;
  let runwayDays = horizonDays;

  for (let i = 0; i < horizonDays; i++) {
    const day = addDays(today, i);
    const iso = formatIsoDate(day);
    const due = dueByDate.get(iso) ?? 0;
    balance -= due;
    series.push({ date: iso, balanceUsd: balance, obligationsDueUsd: due });
    if (balance < 0 && runwayDays === horizonDays) {
      runwayDays = i;
    }
  }

  const weekEnd = addDays(today, 6);
  let dueIn7dUsd = 0;
  let overdueUsd = 0;

  for (const ob of obligations) {
    if (ob.paidAt) continue;
    const anchor = parseIsoDate(ob.dueDate);
    if (ob.cadence === "once") {
      if (anchor < today) overdueUsd += ob.amountUsd;
      else if (anchor <= weekEnd) dueIn7dUsd += ob.amountUsd;
      continue;
    }
    for (const occ of expandObligation(ob, addDays(today, -365), weekEnd, today)) {
      const d = parseIsoDate(occ.date);
      if (d < today) overdueUsd += occ.amountUsd;
      else if (d <= weekEnd) dueIn7dUsd += occ.amountUsd;
    }
  }

  const upcoming = occurrences.filter((o) => o.status !== "paid").slice(0, 20);

  return {
    liquidBalanceUsd,
    runwayDays,
    horizonDays,
    dueIn7dUsd,
    overdueUsd,
    series,
    upcoming,
  };
}
