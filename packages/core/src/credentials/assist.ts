/**
 * Assisted credential change — HITL (BL-7 P2).
 *
 * What: for a high-value email/institution/payee, return a change-password URL
 *       plus a one-time suggested password. Nothing is persisted.
 * Why: after HIBP, the wedge is "detect → assist manual fix" (ADR-016), not
 *      Dashlane-style bulk rotation or a vault in Attache.
 * Honesty: user completes 2FA/CAPTCHA in the browser; Attache is not a password manager.
 */
import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import {
  changePasswordUrlForEmail,
  changePasswordUrlForName,
} from "./change-password-url.js";
import {
  listHighValueTargets,
  type HighValueKind,
  type HighValueTarget,
} from "./targets.js";

export const CREDENTIAL_ASSIST_HONESTY =
  "Attache does not store website passwords. Copy the suggested password into the site yourself; complete 2FA/CAPTCHA in the browser.";

export interface CredentialAssistInput {
  email?: string;
  payee?: string;
  institution?: string;
}

export interface CredentialAssistResult {
  target: string;
  kind: HighValueKind;
  changePasswordUrl: string | null;
  suggestedPassword: string;
  message: string;
  honesty: string;
  nextCommand: string;
}

/** Cryptographically random password suggestion — never written to SQLite/vault. */
export function generateSuggestedPassword(length = 20): string {
  if (length < 12 || length > 64) {
    throw new Error("password length must be 12–64");
  }
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

function matchTarget(
  targets: HighValueTarget[],
  kind: HighValueKind,
  name: string,
): HighValueTarget | null {
  const needle = name.trim().toLowerCase();
  return (
    targets.find((t) => t.kind === kind && t.name.toLowerCase() === needle) ??
    null
  );
}

/** Resolve assist input to a row on the household shortlist (negative if absent). */
export function resolveAssistTarget(
  db: Database.Database,
  input: CredentialAssistInput,
): HighValueTarget {
  const targets = listHighValueTargets(db);
  const provided = [
    input.email ? "email" : null,
    input.payee ? "payee" : null,
    input.institution ? "institution" : null,
  ].filter(Boolean);
  if (provided.length !== 1) {
    throw new Error("specify exactly one of email, payee, or institution");
  }

  if (input.email) {
    const hit = matchTarget(targets, "email", input.email);
    if (!hit) {
      throw new Error(
        "email not on high-value shortlist — connect Gmail/IMAP first",
      );
    }
    return hit;
  }
  if (input.payee) {
    const hit = matchTarget(targets, "payee", input.payee);
    if (!hit) {
      throw new Error("payee not on high-value shortlist — create an obligation");
    }
    return hit;
  }
  const hit = matchTarget(targets, "institution", input.institution!);
  if (!hit) {
    throw new Error(
      "institution not on high-value shortlist — link Plaid or create an account",
    );
  }
  return hit;
}

export function credentialAssist(
  db: Database.Database,
  input: CredentialAssistInput,
): CredentialAssistResult {
  const target = resolveAssistTarget(db, input);
  const suggestedPassword = generateSuggestedPassword();

  let changePasswordUrl: string | null;
  if (target.kind === "email") {
    changePasswordUrl = changePasswordUrlForEmail(target.name);
  } else {
    changePasswordUrl = changePasswordUrlForName(target.name);
  }

  const nextCommand =
    target.kind === "email"
      ? `attache credentials assist --email ${target.name}`
      : target.kind === "payee"
        ? `attache credentials assist --payee ${JSON.stringify(target.name)}`
        : `attache credentials assist --institution ${JSON.stringify(target.name)}`;

  const message = changePasswordUrl
    ? `Open changePasswordUrl in a browser, sign in, paste suggestedPassword. ${CREDENTIAL_ASSIST_HONESTY}`
    : `No known change-password URL for "${target.name}". Search the biller's site manually. ${CREDENTIAL_ASSIST_HONESTY}`;

  return {
    target: target.name,
    kind: target.kind,
    changePasswordUrl,
    suggestedPassword,
    message,
    honesty: CREDENTIAL_ASSIST_HONESTY,
    nextCommand,
  };
}
