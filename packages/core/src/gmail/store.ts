import { randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { GmailAccount } from "../domain.js";
import type { GmailOAuthTokens } from "./oauth.js";
import {
  fetchGoogleUserEmail,
  getGoogleOAuthConfig,
  parseVaultTokens,
  serializeVaultTokens,
  tokensFromGoogleResponse,
  exchangeGoogleCode,
  refreshGoogleAccessToken,
  type GoogleOAuthConfig,
} from "./oauth.js";
import { getTenant } from "../tenant.js";
import type { VaultPort } from "../vault/local-vault.js";

const STATE_PREFIX = "gmail_oauth_state:";
const STATE_TTL_MS = 10 * 60 * 1000;

function requireTenant(db: Database.Database): string {
  const tenant = getTenant(db);
  if (!tenant) throw new Error("not onboarded");
  return tenant.id;
}

interface GmailRow {
  id: string;
  tenant_id: string;
  email: string;
  label: string;
  vault_credential_ref: string;
  status: string;
  last_sync_at: string | null;
  history_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: GmailRow): GmailAccount {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    label: row.label,
    vaultCredentialRef: row.vault_credential_ref,
    status: row.status as GmailAccount["status"],
    lastSyncAt: row.last_sync_at,
    historyId: row.history_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function gmailVaultRef(email: string): string {
  const safe = email.replace(/[^a-zA-Z0-9@._-]/g, "_");
  return `gmail/account/${safe}`;
}

/** CSRF state for web OAuth callback — stored in app_meta briefly. */
export function createGmailOAuthState(db: Database.Database): string {
  const state = randomBytes(24).toString("hex");
  db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(
    `${STATE_PREFIX}${state}`,
    new Date().toISOString(),
  );
  return state;
}

export function consumeGmailOAuthState(db: Database.Database, state: string): boolean {
  const key = `${STATE_PREFIX}${state}`;
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  if (!row) return false;
  db.prepare("DELETE FROM app_meta WHERE key = ?").run(key);
  const created = Date.parse(row.value);
  return Date.now() - created < STATE_TTL_MS;
}

export function listGmailAccounts(db: Database.Database): GmailAccount[] {
  const tenantId = requireTenant(db);
  const rows = db
    .prepare(`SELECT * FROM gmail_account WHERE tenant_id = ? ORDER BY created_at DESC`)
    .all(tenantId) as GmailRow[];
  return rows.map(mapRow);
}

export function getGmailAccount(db: Database.Database, id: string): GmailAccount | null {
  const tenantId = requireTenant(db);
  const row = db
    .prepare(`SELECT * FROM gmail_account WHERE id = ? AND tenant_id = ?`)
    .get(id, tenantId) as GmailRow | undefined;
  return row ? mapRow(row) : null;
}

/** Persist OAuth tokens after successful Google consent (ADR-008). */
export function connectGmailAccount(
  db: Database.Database,
  vault: VaultPort,
  input: {
    email: string;
    tokens: GmailOAuthTokens;
    label?: string;
  },
): GmailAccount {
  const tenantId = requireTenant(db);
  const vaultRef = gmailVaultRef(input.email);
  vault.set(vaultRef, serializeVaultTokens(input.tokens));

  const now = new Date().toISOString();
  const existing = db
    .prepare(`SELECT * FROM gmail_account WHERE tenant_id = ? AND email = ?`)
    .get(tenantId, input.email) as GmailRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE gmail_account SET label = ?, vault_credential_ref = ?, status = 'active', updated_at = ?
       WHERE id = ?`,
    ).run(input.label?.trim() || existing.label, vaultRef, now, existing.id);
    return mapRow(
      db.prepare(`SELECT * FROM gmail_account WHERE id = ?`).get(existing.id) as GmailRow,
    );
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO gmail_account
     (id, tenant_id, email, label, vault_credential_ref, status, last_sync_at, history_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', NULL, NULL, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.email,
    input.label?.trim() || input.email,
    vaultRef,
    now,
    now,
  );
  return mapRow(db.prepare(`SELECT * FROM gmail_account WHERE id = ?`).get(id) as GmailRow);
}

/** Complete OAuth code exchange → connected gmail_account. */
export async function connectGmailFromAuthCode(
  db: Database.Database,
  vault: VaultPort,
  code: string,
  config: GoogleOAuthConfig,
): Promise<GmailAccount> {
  const tokenRes = await exchangeGoogleCode(config, code);
  const tokens = tokensFromGoogleResponse(tokenRes);
  const email = await fetchGoogleUserEmail(tokens.accessToken);
  return connectGmailAccount(db, vault, { email, tokens });
}

/** Sandbox connect without Google Cloud project. */
export function connectSandboxGmail(
  db: Database.Database,
  vault: VaultPort,
  email = "sandbox@gmail.com",
): GmailAccount {
  const tokens: GmailOAuthTokens = {
    accessToken: "sandbox-access",
    refreshToken: "sandbox-refresh",
    expiresAt: Date.now() + 3_600_000,
  };
  return connectGmailAccount(db, vault, {
    email,
    tokens,
    label: "Gmail (sandbox)",
  });
}

export function updateGmailHistoryId(
  db: Database.Database,
  accountId: string,
  historyId: string | null,
): void {
  const tenantId = requireTenant(db);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE gmail_account SET last_sync_at = ?, history_id = COALESCE(?, history_id), updated_at = ?
     WHERE id = ? AND tenant_id = ?`,
  ).run(now, historyId, now, accountId, tenantId);
}

export function markGmailAccountError(db: Database.Database, accountId: string): void {
  const tenantId = requireTenant(db);
  db.prepare(
    `UPDATE gmail_account SET status = 'error', updated_at = ? WHERE id = ? AND tenant_id = ?`,
  ).run(new Date().toISOString(), accountId, tenantId);
}

export function getGmailTokens(
  vault: VaultPort,
  account: GmailAccount,
): GmailOAuthTokens | null {
  const raw = vault.get(account.vaultCredentialRef);
  if (!raw) return null;
  return parseVaultTokens(raw);
}

export function saveGmailTokens(
  vault: VaultPort,
  account: GmailAccount,
  tokens: GmailOAuthTokens,
): void {
  vault.set(account.vaultCredentialRef, serializeVaultTokens(tokens));
}

/** Ensure valid access token; refresh via Google if expired. */
export async function ensureGmailAccessToken(
  vault: VaultPort,
  account: GmailAccount,
): Promise<string> {
  const tokens = getGmailTokens(vault, account);
  if (!tokens) throw new Error("gmail tokens missing from vault");

  if (tokens.accessToken && Date.now() < tokens.expiresAt) {
    return tokens.accessToken;
  }

  const config = getGoogleOAuthConfig();
  if (!config) throw new Error("GOOGLE_CLIENT_ID not configured");

  if (tokens.refreshToken === "sandbox-refresh") {
    return tokens.accessToken;
  }

  const refreshed = await refreshGoogleAccessToken(config, tokens.refreshToken);
  const next = tokensFromGoogleResponse(refreshed, tokens.refreshToken);
  saveGmailTokens(vault, account, next);
  return next.accessToken;
}
