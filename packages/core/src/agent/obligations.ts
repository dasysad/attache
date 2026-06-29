import type Database from "better-sqlite3";
import type { Obligation, ObligationOccurrence } from "../domain.js";
import { listObligations } from "../obligation.js";
import { expandObligation } from "../forecast.js";
import { isOnboarded } from "../tenant.js";

export type ObligationFilter = "all" | "upcoming" | "overdue" | "unpaid";

export interface AgentObligationRow {
  id: string;
  payee: string;
  amountUsd: number;
  dueDate: string;
  cadence: Obligation["cadence"];
  autopay: boolean;
  provenance: Obligation["provenance"];
  paidAt: string | null;
  status: ObligationOccurrence["status"] | "paid";
  notes: string | null;
}

/**
 * List obligations for agents with optional status filter.
 * How: expands recurrence for overdue/upcoming within 30d window.
 */
export function listObligationsForAgent(
  db: Database.Database,
  filter: ObligationFilter = "unpaid",
): AgentObligationRow[] {
  if (!isOnboarded(db)) throw new Error("not onboarded");

  const obligations = listObligations(db);
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const end = new Date(start.getTime() + 30 * 86_400_000);

  const rows: AgentObligationRow[] = [];

  for (const ob of obligations) {
    if (ob.paidAt) {
      if (filter === "all") {
        rows.push(mapObligation(ob, "paid"));
      }
      continue;
    }

    if (ob.cadence === "once") {
      const anchor = parseIso(ob.dueDate);
      const status = obligationStatus(anchor, start);
      if (matchesFilter(filter, status)) {
        rows.push(mapObligation(ob, status));
      }
      continue;
    }

    const occs = expandObligation(ob, start, end, start);
    for (const occ of occs) {
      if (matchesFilter(filter, occ.status)) {
        rows.push({
          id: ob.id,
          payee: ob.payee,
          amountUsd: occ.amountUsd,
          dueDate: occ.date,
          cadence: ob.cadence,
          autopay: ob.autopay,
          provenance: ob.provenance,
          paidAt: ob.paidAt,
          status: occ.status,
          notes: ob.notes,
        });
      }
    }
  }

  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function mapObligation(
  ob: Obligation,
  status: AgentObligationRow["status"],
): AgentObligationRow {
  return {
    id: ob.id,
    payee: ob.payee,
    amountUsd: ob.amountUsd,
    dueDate: ob.dueDate,
    cadence: ob.cadence,
    autopay: ob.autopay,
    provenance: ob.provenance,
    paidAt: ob.paidAt,
    status,
    notes: ob.notes,
  };
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function obligationStatus(due: Date, today: Date): ObligationOccurrence["status"] {
  const delta = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (delta < 0) return "overdue";
  if (delta <= 3) return "due_soon";
  return "upcoming";
}

function matchesFilter(filter: ObligationFilter, status: ObligationOccurrence["status"] | "paid"): boolean {
  if (filter === "all") return true;
  if (filter === "unpaid") return status !== "paid";
  if (filter === "overdue") return status === "overdue";
  if (filter === "upcoming") return status === "upcoming" || status === "due_soon" || status === "scheduled";
  return true;
}
