import type Database from "better-sqlite3";
import { listAccounts } from "../account.js";
import type { IngestedEvent } from "../domain.js";
import { FakeGmailAdapter } from "../gmail/fake-adapter.js";
import type { GmailIngestPort } from "../gmail/port.js";
import { pollGmailIngest, type GmailPollResult } from "../gmail/sync.js";
import {
  clearGmailHistoryId,
  connectSandboxGmail,
  listGmailAccounts,
} from "../gmail/store.js";
import { listImapAccounts } from "../imap/store.js";
import { pollImapIngest, type ImapPollResult } from "../imap/sync.js";
import { listObligations } from "../obligation.js";
import { listPlaidItems } from "../plaid/store.js";
import { listSnapTradeConnections } from "../snaptrade/store.js";
import { isOnboarded } from "../tenant.js";
import type { VaultPort } from "../vault/local-vault.js";
import type { DocumentExtractionPort } from "./document-port.js";
import { parseBillPayload } from "./event.js";
import { listPendingDiscoverEvents } from "./event.js";
import { getHouseholdAssetByEventId, listHouseholdAssets } from "../household-asset.js";
import { inferAssetHint, type AssetHint } from "./asset-hint.js";

export const DISCOVER_DEFAULT_LOOKBACK_DAYS = 90;
export const DISCOVER_DEFAULT_LIMIT = 40;
export const DISCOVER_MAX_LOOKBACK_DAYS = 90;
export const DISCOVER_MAX_LIMIT = 40;

export type DiscoverAction =
  | "confirm_bill"
  | "confirm_asset"
  | "connect_plaid"
  | "connect_snaptrade"
  | "ignore";

export type DiscoverCandidateKind =
  | "bill"
  | "invoice"
  | "statement"
  | "notice"
  | "other";

export interface DiscoverCandidate {
  eventId: string;
  kind: DiscoverCandidateKind;
  payee: string | null;
  amountUsd: number | null;
  dueDate: string | null;
  institutionHint: string | null;
  rail: "plaid" | "snaptrade" | null;
  confidence: number;
  action: DiscoverAction;
  source: "email" | "document";
  /** Home/vehicle hint from property tax / auto policy — HITL only (P4). */
  assetHint: AssetHint | null;
  /** True after confirmAssetHint; bill confirm can still follow. */
  assetConfirmed: boolean;
}

export interface DiscoverOptions {
  lookbackDays?: number;
  limit?: number;
  /**
   * Connect sandbox Gmail if needed, reset its history cursor, force FakeGmailAdapter.
   * Why: `ingest discover-sandbox` must show mixed fixtures even after a prior poll.
   */
  sandbox?: boolean;
  gmailAdapter?: GmailIngestPort;
}

export interface DiscoverResult {
  lookbackDays: number;
  limit: number;
  candidates: DiscoverCandidate[];
  gmail: GmailPollResult;
  imap: ImapPollResult;
  /** Agent/human copy — names explicit CLI connect commands (ADR-015 P2). */
  message: string;
  nextCommands: DiscoverNextCommand[];
}

export interface DiscoverNextCommand {
  action: DiscoverAction;
  cli: string;
  href: string;
  institutionHint: string | null;
  eventId: string | null;
}

export interface LinkedInstitutions {
  plaidInstitutionNames: string[];
  snaptradeBrokerageNames: string[];
}

export class DiscoverError extends Error {
  constructor(
    message: string,
    readonly code: "not_onboarded" | "no_mail",
  ) {
    super(message);
    this.name = "DiscoverError";
  }
}

/**
 * Clamp agent-supplied lookback/limit. Unbounded dumps are forbidden (ADR-015).
 */
export function clampDiscoverBounds(input: {
  lookbackDays?: number;
  limit?: number;
}): { lookbackDays: number; limit: number } {
  return {
    lookbackDays: clamp(
      input.lookbackDays ?? DISCOVER_DEFAULT_LOOKBACK_DAYS,
      1,
      DISCOVER_MAX_LOOKBACK_DAYS,
    ),
    limit: clamp(input.limit ?? DISCOVER_DEFAULT_LIMIT, 1, DISCOVER_MAX_LIMIT),
  };
}

/**
 * Poll connected mail → ranked HITL candidates. Does not create obligations or Plaid items.
 *
 * How: reuse pollGmailIngest / pollImapIngest (same extract + ingested_event upsert).
 * Bills/invoices keep event ids so `confirmBillIngest` still works. Statements become
 * connect hints (action connect_plaid | connect_snaptrade) — never auto-Link.
 */
export async function discoverMailCandidates(
  db: Database.Database,
  vault: VaultPort,
  docAdapter: DocumentExtractionPort,
  options: DiscoverOptions = {},
): Promise<DiscoverResult> {
  if (!isOnboarded(db)) {
    throw new DiscoverError(
      "Not onboarded — run: attache onboard --household <name> --holder <name>",
      "not_onboarded",
    );
  }

  const bounds = clampDiscoverBounds(options);

  if (options.sandbox) {
    const account = connectSandboxGmail(db, vault);
    clearGmailHistoryId(db, account.id);
  }

  const gmailAccounts = listGmailAccounts(db).filter(
    (a) => a.status === "active" || a.status === "error",
  );
  const imapAccounts = listImapAccounts(db).filter(
    (a) => a.status === "active" || a.status === "error",
  );
  if (gmailAccounts.length === 0 && imapAccounts.length === 0) {
    throw new DiscoverError(
      "No mail accounts — run: attache ingest gmail connect-sandbox (or ingest gmail connect / imap connect)",
      "no_mail",
    );
  }

  const obligationsBefore = listObligations(db).length;
  const accountsBefore = listAccounts(db).length;
  const assetsBefore = listHouseholdAssets(db).length;

  const gmail = await pollGmailIngest(
    db,
    vault,
    docAdapter,
    options.sandbox ? new FakeGmailAdapter() : options.gmailAdapter,
    { lookbackDays: bounds.lookbackDays, limit: bounds.limit },
  );
  const imap = await pollImapIngest(db, vault, docAdapter);

  if (listObligations(db).length !== obligationsBefore) {
    throw new Error("discover must not create obligations");
  }
  if (listAccounts(db).length !== accountsBefore) {
    throw new Error("discover must not create funding accounts");
  }
  if (listHouseholdAssets(db).length !== assetsBefore) {
    throw new Error("discover must not create household assets");
  }

  const candidates = rankCandidates(
    listPendingDiscoverEvents(db).map((e) => eventToCandidate(db, e)),
  );
  const nextCommands = discoverNextCommands(candidates);

  return {
    lookbackDays: bounds.lookbackDays,
    limit: bounds.limit,
    candidates,
    gmail,
    imap,
    nextCommands,
    message: formatDiscoverMessage(candidates),
  };
}

/**
 * Rank pending mail events without polling.
 * Why: Connect/Inbox pages must show hints on GET without hitting Gmail again.
 */
export function listDiscoverCandidates(db: Database.Database): DiscoverCandidate[] {
  if (!isOnboarded(db)) return [];
  return rankCandidates(
    listPendingDiscoverEvents(db).map((e) => eventToCandidate(db, e)),
  );
}

/** Dedupe statement hints by rail + institution (several statements → one Link card). */
export function dedupeConnectHints(
  candidates: DiscoverCandidate[],
): DiscoverCandidate[] {
  const seen = new Set<string>();
  const out: DiscoverCandidate[] = [];
  for (const c of candidates) {
    if (c.action !== "connect_plaid" && c.action !== "connect_snaptrade") continue;
    const key = `${c.action}:${(c.institutionHint ?? c.payee ?? "").trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Structured next steps for CLI/MCP/web. Connect commands never imply the bank exists.
 */
export function discoverNextCommands(
  candidates: DiscoverCandidate[],
): DiscoverNextCommand[] {
  const out: DiscoverNextCommand[] = [];
  for (const c of candidates) {
    if (c.action !== "confirm_bill") continue;
    out.push({
      action: "confirm_bill",
      cli: `attache ingest confirm ${c.eventId}`,
      href: `/app/ingest/review/${c.eventId}`,
      institutionHint: null,
      eventId: c.eventId,
    });
  }
  for (const c of candidates) {
    if (!c.assetHint || c.assetConfirmed) continue;
    out.push({
      action: "confirm_asset",
      cli: `attache assets confirm ${c.eventId}`,
      href: `/app/ingest`,
      institutionHint: null,
      eventId: c.eventId,
    });
  }
  for (const h of dedupeConnectHints(candidates)) {
    if (h.action === "connect_plaid") {
      out.push({
        action: "connect_plaid",
        cli: "attache plaid connect",
        href: "/app/plaid",
        institutionHint: h.institutionHint,
        eventId: h.eventId,
      });
    } else if (h.action === "connect_snaptrade") {
      out.push({
        action: "connect_snaptrade",
        cli: "attache snaptrade connect",
        href: "/app/snaptrade",
        institutionHint: h.institutionHint,
        eventId: h.eventId,
      });
    }
  }
  return out;
}

/** CLI/MCP `message` — names the exact connect command; honesty: hint ≠ Link. */
export function formatDiscoverMessage(candidates: DiscoverCandidate[]): string {
  if (candidates.length === 0) {
    return "No candidates — skip mail or add bills with attache obligations create";
  }
  const commands = discoverNextCommands(candidates);
  const parts: string[] = [];
  const confirms = commands.filter((c) => c.action === "confirm_bill");
  if (confirms.length === 1) {
    parts.push(`1 bill to confirm — ${confirms[0]!.cli}`);
  } else if (confirms.length > 1) {
    parts.push(
      `${confirms.length} bills to confirm — ${confirms[0]!.cli} (and ${confirms.length - 1} more)`,
    );
  }
  for (const c of commands) {
    if (c.action === "connect_plaid") {
      const who = c.institutionHint ?? "a bank";
      parts.push(
        `Mail saw a ${who} statement — run \`attache plaid connect\` or \`attache plaid connect-sandbox\`. Not a bank until you Link.`,
      );
    }
    if (c.action === "connect_snaptrade") {
      const who = c.institutionHint ?? "a brokerage";
      parts.push(
        `Mail saw a ${who} statement — run \`attache snaptrade connect\` or \`attache snaptrade connect-sandbox\`. Read-only; Link is explicit.`,
      );
    }
  }
  const assetCmds = commands.filter((c) => c.action === "confirm_asset");
  if (assetCmds.length === 1) {
    parts.push(
      `1 home/vehicle hint — ${assetCmds[0]!.cli}. Not on net worth until you confirm (estimate optional).`,
    );
  } else if (assetCmds.length > 1) {
    parts.push(
      `${assetCmds.length} home/vehicle hints — ${assetCmds[0]!.cli} (and ${assetCmds.length - 1} more). Not on net worth until you confirm.`,
    );
  }
  return parts.join(" ");
}

export function connectHintSatisfied(
  hint: DiscoverCandidate,
  linked: LinkedInstitutions,
): boolean {
  const needle = (hint.institutionHint ?? hint.payee ?? "").trim().toLowerCase();
  if (!needle) return false;
  const names =
    hint.action === "connect_snaptrade"
      ? linked.snaptradeBrokerageNames
      : linked.plaidInstitutionNames;
  return names.some((n) => {
    const x = n.toLowerCase();
    return x.includes(needle) || needle.includes(x);
  });
}

export function unsatisfiedConnectHints(
  candidates: DiscoverCandidate[],
  linked: LinkedInstitutions,
): DiscoverCandidate[] {
  return dedupeConnectHints(candidates).filter((h) => !connectHintSatisfied(h, linked));
}

/** Connect-page projection: pending statement hints not yet matched to a linked institution. */
export function listUnsatisfiedConnectHints(
  db: Database.Database,
): DiscoverCandidate[] {
  if (!isOnboarded(db)) return [];
  return unsatisfiedConnectHints(listDiscoverCandidates(db), {
    plaidInstitutionNames: listPlaidItems(db).map((i) => i.institutionName),
    snaptradeBrokerageNames: listSnapTradeConnections(db)
      .map((c) => c.brokerageName)
      .filter((n): n is string => Boolean(n)),
  });
}

export function countUnconfirmedAssetHints(
  candidates: DiscoverCandidate[],
): number {
  return candidates.filter((c) => c.assetHint && !c.assetConfirmed).length;
}

function eventToCandidate(
  db: Database.Database,
  event: IngestedEvent,
): DiscoverCandidate {
  const payload = parseBillPayload(event);
  const kind = candidateKind(event, payload);
  const amountUsd =
    Number.isFinite(payload.amountUsd) && payload.amountUsd > 0
      ? payload.amountUsd
      : null;
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate)
    ? payload.dueDate
    : null;
  const rail = payload.rail === "snaptrade" || payload.rail === "plaid"
    ? payload.rail
    : null;
  const institutionHint = payload.institutionHint?.trim() || null;
  const assetHint = inferAssetHint({
    payee: payload.payee,
    filename: payload.filename,
    rawText: payload.rawText,
  });
  const assetConfirmed = Boolean(getHouseholdAssetByEventId(db, event.id));
  let action = discoverAction(kind, amountUsd, dueDate, rail);
  if (action === "ignore" && assetHint && !assetConfirmed) {
    action = "confirm_asset";
  }
  const source = event.source === "email" ? "email" : "document";

  return {
    eventId: event.id,
    kind,
    payee: payload.payee?.trim() || null,
    amountUsd,
    dueDate,
    institutionHint: institutionHint ?? (kind === "statement" ? payload.payee : null),
    rail: kind === "statement" ? (rail ?? "plaid") : rail,
    confidence: event.confidence,
    action,
    source,
    assetHint,
    assetConfirmed,
  };
}

function candidateKind(
  event: IngestedEvent,
  payload: ReturnType<typeof parseBillPayload>,
): DiscoverCandidateKind {
  if (event.kind === "statement") return "statement";
  if (event.kind === "notice") {
    return payload.classifier === "other" ? "other" : "notice";
  }
  const blob = `${payload.filename} ${payload.rawText ?? ""} ${payload.payee}`.toLowerCase();
  if (blob.includes("invoice")) return "invoice";
  return "bill";
}

function discoverAction(
  kind: DiscoverCandidateKind,
  amountUsd: number | null,
  dueDate: string | null,
  rail: "plaid" | "snaptrade" | null,
): DiscoverAction {
  if (kind === "bill" || kind === "invoice") {
    return amountUsd !== null && dueDate !== null ? "confirm_bill" : "ignore";
  }
  if (kind === "statement") {
    return rail === "snaptrade" ? "connect_snaptrade" : "connect_plaid";
  }
  return "ignore";
}

const KIND_RANK: Record<DiscoverCandidateKind, number> = {
  bill: 0,
  invoice: 1,
  statement: 2,
  notice: 3,
  other: 4,
};

function rankCandidates(rows: DiscoverCandidate[]): DiscoverCandidate[] {
  return [...rows].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return max;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
