/**
 * Credential hygiene check (BL-7 P0).
 *
 * What: HIBP the household's mailbox emails; list institutions/payees as
 *       "review these logins" with no network call.
 * Why: event-driven alerts when a tracked email is in a breach — not
 *      calendar rotation, not a password store.
 * Honesty: Attache does not store or rotate website passwords.
 */
import type Database from "better-sqlite3";
import {
  clearNotificationsByPrefix,
  upsertNotification,
} from "../notify/store.js";
import { isOnboarded } from "../tenant.js";
import { getHibp } from "./create-adapter.js";
import type { HibpPort } from "./hibp-port.js";
import { listHighValueTargets, type HighValueTarget } from "./targets.js";

export interface CredentialBreachHit {
  email: string;
  name: string;
  breachDate: string;
}

export interface CredentialHygieneResult {
  emailsChecked: string[];
  breaches: CredentialBreachHit[];
  highValue: HighValueTarget[];
  notificationIds: string[];
  mode: HibpPort["mode"];
  message: string;
}

const PREFIX = "credential_hygiene:";

export async function checkCredentialHygiene(
  db: Database.Database,
  adapter: HibpPort = getHibp(),
): Promise<CredentialHygieneResult> {
  if (!isOnboarded(db)) throw new Error("not onboarded");

  const highValue = listHighValueTargets(db);
  const emails = [
    ...new Set(
      highValue.filter((t) => t.kind === "email").map((t) => t.name.toLowerCase()),
    ),
  ];

  const breaches: CredentialBreachHit[] = [];
  for (const email of emails) {
    const found = await adapter.breachesForEmail(email);
    for (const row of found) {
      breaches.push({
        email,
        name: row.name,
        breachDate: row.breachDate,
      });
    }
  }

  const byEmail = new Map<string, CredentialBreachHit[]>();
  for (const hit of breaches) {
    const list = byEmail.get(hit.email) ?? [];
    list.push(hit);
    byEmail.set(hit.email, list);
  }

  const keep = new Set<string>();
  const notificationIds: string[] = [];
  for (const [email, hits] of byEmail) {
    const key = `${PREFIX}${email}`;
    keep.add(key);
    const names = hits.map((h) => h.name).join(", ");
    const result = upsertNotification(db, {
      dedupeKey: key,
      kind: "credential_hygiene",
      severity: "warning",
      title: "Breach on a high-value email",
      body: `${email} appears in ${hits.length} HIBP breach(es): ${names}. Run attache credentials assist --email ${email} — Attache does not store website passwords.`,
      actionUrl: "/app/notifications",
    });
    notificationIds.push(result.notification.id);
  }
  clearNotificationsByPrefix(db, PREFIX, keep);

  const message = hygieneMessage(emails.length, breaches.length, highValue.length);
  return {
    emailsChecked: emails,
    breaches,
    highValue,
    notificationIds,
    mode: adapter.mode,
    message,
  };
}

function hygieneMessage(
  emailCount: number,
  breachCount: number,
  targetCount: number,
): string {
  const shortlist = `${targetCount} high-value target(s) (emails, institutions, payees). Attache is not a password manager.`;
  if (emailCount === 0) {
    return `No mailbox emails to check. ${shortlist} Connect Gmail/IMAP or run credentials check after ingest gmail connect-sandbox.`;
  }
  if (breachCount === 0) {
    return `No HIBP hits on ${emailCount} email(s). ${shortlist}`;
  }
  return `${breachCount} HIBP hit(s) on connected mailbox email(s). ${shortlist}`;
}
