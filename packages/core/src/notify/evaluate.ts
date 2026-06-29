import type Database from "better-sqlite3";
import { countPendingTransferProposals } from "../agent/transfer-queue.js";
import { listAccounts } from "../account.js";
import { computeSolvencyForecast } from "../forecast.js";
import { listPendingBillReviews } from "../ingest/bill.js";
import { listObligations } from "../obligation.js";
import { isOnboarded } from "../tenant.js";
import {
  clearNotificationsByPrefix,
  upsertNotification,
} from "./store.js";
import type { Notification } from "./types.js";

export interface RefreshNotificationsResult {
  created: number;
  updated: number;
  cleared: number;
  activeKeys: string[];
}

/**
 * Recompute derived alerts from current household state.
 * How: upsert by dedupe_key; delete keys that no longer apply.
 * Why: dashboard/CLI/MCP share one evaluator — no separate cron in v1.
 */
export function refreshNotifications(db: Database.Database): RefreshNotificationsResult {
  if (!isOnboarded(db)) throw new Error("not onboarded");

  const activeKeys = new Set<string>();
  let created = 0;
  let updated = 0;

  const track = (result: { notification: Notification; created: boolean }) => {
    activeKeys.add(result.notification.dedupeKey);
    if (result.created) created += 1;
    else updated += 1;
    return result.notification;
  };

  evaluateSolvency(db, track);
  evaluateObligations(db, track);
  evaluateIngestion(db, track);
  evaluateTransfers(db, track);

  let cleared = 0;
  cleared += clearNotificationsByPrefix(db, "solvency:", activeKeys);
  cleared += clearNotificationsByPrefix(db, "obligation:", activeKeys);
  cleared += clearNotificationsByPrefix(db, "ingestion_review:", activeKeys);
  cleared += clearNotificationsByPrefix(db, "hitl_transfer:", activeKeys);

  return { created, updated, cleared, activeKeys: [...activeKeys] };
}

type TrackFn = (result: { notification: Notification; created: boolean }) => Notification;

function evaluateSolvency(db: Database.Database, track: TrackFn): void {
  const accounts = listAccounts(db);
  const obligations = listObligations(db);
  const forecast = computeSolvencyForecast(accounts, obligations);

  if (forecast.runwayDays === 0) {
    track(
      upsertNotification(db, {
        dedupeKey: "solvency:insolvent",
        kind: "solvency",
        severity: "action_required",
        title: "Projected insolvency",
        body: `Liquid balance cannot cover obligations within ${forecast.horizonDays} days.`,
        actionUrl: "/",
      }),
    );
    return;
  }

  if (forecast.runwayDays < 14) {
    track(
      upsertNotification(db, {
        dedupeKey: "solvency:low_runway",
        kind: "solvency",
        severity: forecast.runwayDays < 7 ? "action_required" : "warning",
        title: "Low runway",
        body: `About ${forecast.runwayDays} day(s) of runway at current balances and scheduled bills.`,
        actionUrl: "/",
      }),
    );
  }

  if (forecast.dueIn7dUsd > forecast.liquidBalanceUsd) {
    track(
      upsertNotification(db, {
        dedupeKey: "solvency:due_exceeds_liquid",
        kind: "solvency",
        severity: "warning",
        title: "Bills exceed liquid balance",
        body: `$${forecast.dueIn7dUsd.toFixed(2)} due in 7 days vs $${forecast.liquidBalanceUsd.toFixed(2)} liquid.`,
        actionUrl: "/app/obligations",
      }),
    );
  }
}

function evaluateObligations(db: Database.Database, track: TrackFn): void {
  const forecast = computeSolvencyForecast(listAccounts(db), listObligations(db));

  const overdue = forecast.upcoming.filter((o) => o.status === "overdue");
  if (overdue.length) {
    const total = overdue.reduce((s, o) => s + o.amountUsd, 0);
    track(
      upsertNotification(db, {
        dedupeKey: "obligation:overdue",
        kind: "obligation",
        severity: "action_required",
        title: `${overdue.length} overdue bill(s)`,
        body: `$${total.toFixed(2)} past due — review obligations.`,
        actionUrl: "/app/obligations",
      }),
    );
  }

  const dueSoon = forecast.upcoming.filter((o) => o.status === "due_soon");
  if (dueSoon.length) {
    const total = dueSoon.reduce((s, o) => s + o.amountUsd, 0);
    track(
      upsertNotification(db, {
        dedupeKey: "obligation:due_soon",
        kind: "obligation",
        severity: "warning",
        title: `${dueSoon.length} bill(s) due within 3 days`,
        body: `$${total.toFixed(2)} coming due soon.`,
        actionUrl: "/app/obligations",
      }),
    );
  }
}

function evaluateIngestion(db: Database.Database, track: TrackFn): void {
  const pending = listPendingBillReviews(db);
  if (!pending.length) return;

  track(
    upsertNotification(db, {
      dedupeKey: "ingestion_review:pending",
      kind: "ingestion_review",
      severity: "action_required",
      title: `${pending.length} bill(s) need review`,
      body: "Confirm extracted fields before they become obligations.",
      actionUrl: "/app/ingest",
    }),
  );
}

function evaluateTransfers(db: Database.Database, track: TrackFn): void {
  const pending = countPendingTransferProposals(db);
  if (!pending) return;

  track(
    upsertNotification(db, {
      dedupeKey: "hitl_transfer:pending",
      kind: "hitl_transfer",
      severity: "action_required",
      title: `${pending} transfer(s) awaiting approval`,
      body: "Review agent or CLI proposals before balances change.",
      actionUrl: "/app/transfers",
    }),
  );
}
