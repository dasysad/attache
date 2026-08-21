/**
 * Statement register (UI P4+) — statement-class ingest + connect hints.
 *
 * What: list statement events and unsatisfied institution hints for Link.
 * Why: not a DMS; humans need a simple list before automation UI.
 */
import type Database from "better-sqlite3";
import {
  listUnsatisfiedConnectHints,
  type DiscoverCandidate,
} from "./ingest/discover.js";
import {
  listPendingDiscoverEvents,
  parseBillPayload,
} from "./ingest/event.js";
import type { IngestedEvent } from "./domain.js";
import { getTenant } from "./tenant.js";

export interface StatementListItem {
  eventId: string;
  payee: string;
  ingestedAt: string;
  institutionHint: string | null;
  rail: "plaid" | "snaptrade" | null;
  promoted: boolean;
}

export interface StatementRegister {
  statements: StatementListItem[];
  connectHints: DiscoverCandidate[];
  message: string;
}

export function listStatementEvents(db: Database.Database): StatementListItem[] {
  if (!getTenant(db)) return [];
  const pending = listPendingDiscoverEvents(db).filter(
    (e) => e.kind === "statement",
  );
  // Also surface recently promoted statements? Keep pending-only for honesty —
  // promoted statements already became connect attempts or were dismissed.
  return pending.map(mapStatement);
}

function mapStatement(event: IngestedEvent): StatementListItem {
  let payee = "Statement";
  try {
    payee = parseBillPayload(event).payee?.trim() || payee;
  } catch {
    /* payload junk */
  }
  return {
    eventId: event.id,
    payee,
    ingestedAt: event.ingestedAt,
    institutionHint: null,
    rail: null,
    promoted: Boolean(event.promotedAt),
  };
}

export function getStatementRegister(db: Database.Database): StatementRegister {
  const statements = listStatementEvents(db);
  const connectHints = listUnsatisfiedConnectHints(db);
  return {
    statements,
    connectHints,
    message:
      statements.length === 0 && connectHints.length === 0
        ? "No statement candidates — run attache ingest discover or connect mail."
        : `${statements.length} statement event(s), ${connectHints.length} connect hint(s).`,
  };
}
