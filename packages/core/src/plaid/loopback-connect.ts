/**
 * Plaid Link loopback connect — v1 hardening slice 3 follow-up.
 *
 * WHAT: ephemeral 127.0.0.1 HTTP server receives Plaid redirect with public_token.
 * HOW: create link_token with redirect_uri → open Hosted Link → exchange on callback.
 * WHY: mirror Gmail loopback so humans connect banks from CLI without copy-paste.
 */
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import type Database from "better-sqlite3";
import type { VaultPort } from "../vault/local-vault.js";
import {
  findLoopbackPort,
  openSystemBrowser,
  parseCallbackQuery,
  plaidHostedLinkUrl,
  sendHtml,
} from "../net/loopback.js";
import type { LivePlaidAdapter } from "../ingest/live-plaid-adapter.js";
import { isPlaidConfigured } from "./config.js";
import { connectLivePlaid, createPlaidLinkToken, type SyncResult } from "./sync.js";

/** Default loopback port — register in Plaid Dashboard redirect URIs. */
export const DEFAULT_PLAID_LOOPBACK_PORT = 8766;

export const PLAID_LOOPBACK_CALLBACK_PATH = "/plaid/callback";

export interface PlaidLoopbackConnectOptions {
  port?: number;
  openBrowser?: boolean;
  timeoutMs?: number;
}

export interface PlaidLoopbackConnectResult {
  itemId: string;
  sync: SyncResult;
  redirectUri: string;
  linkUrl: string;
}

export function plaidLoopbackRedirectUri(port: number): string {
  return `http://127.0.0.1:${port}${PLAID_LOOPBACK_CALLBACK_PATH}`;
}

export { findLoopbackPort };

function resolveLoopbackPort(explicit?: number): number {
  if (explicit !== undefined) return explicit;
  const fromEnv = process.env.ATTACHE_PLAID_LOOPBACK_PORT;
  if (fromEnv) {
    const n = Number(fromEnv);
    if (Number.isInteger(n) && n > 0 && n < 65536) return n;
  }
  return DEFAULT_PLAID_LOOPBACK_PORT;
}

/**
 * Run Plaid Hosted Link with loopback redirect → exchange public_token → sync.
 * Requires PLAID_CLIENT_ID + PLAID_SECRET and matching redirect URI in Plaid Dashboard.
 */
export async function connectPlaidViaLoopback(
  db: Database.Database,
  adapter: LivePlaidAdapter,
  vault: VaultPort,
  options: PlaidLoopbackConnectOptions = {},
): Promise<PlaidLoopbackConnectResult> {
  if (!isPlaidConfigured()) {
    throw new Error("Plaid not configured — set PLAID_CLIENT_ID and PLAID_SECRET");
  }

  const preferred = resolveLoopbackPort(options.port);
  const port = await findLoopbackPort(preferred);
  const redirectUri = plaidLoopbackRedirectUri(port);
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const openBrowser = options.openBrowser !== false;

  const { linkToken } = await createPlaidLinkToken(db, adapter, redirectUri);
  const linkUrl = plaidHostedLinkUrl(linkToken);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            `Plaid Link timed out after ${timeoutMs / 1000}s — complete Link in the browser`,
          ),
        ),
      );
    }, timeoutMs);

    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const path = req.url?.split("?")[0] ?? "";
      if (path !== PLAID_LOOPBACK_CALLBACK_PATH) {
        sendHtml(res, 404, "Not found", "Unknown path.");
        return;
      }

      const params = parseCallbackQuery(req.url ?? "");
      const err = params.get("error");
      if (err) {
        const msg = params.get("error_message") ?? err;
        sendHtml(res, 400, "Link failed", String(msg));
        finish(() => reject(new Error(`Plaid Link error: ${msg}`)));
        return;
      }

      const publicToken = params.get("public_token");
      if (!publicToken) {
        sendHtml(res, 400, "Invalid callback", "Missing public_token.");
        finish(() => reject(new Error("Plaid callback missing public_token")));
        return;
      }

      try {
        const connected = await connectLivePlaid(db, adapter, vault, publicToken);
        sendHtml(
          res,
          200,
          "Bank connected",
          `Linked <strong>${connected.sync.accountsUpdated}</strong> account(s). You can close this tab and return to the terminal.`,
        );
        finish(() =>
          resolve({
            itemId: connected.itemId,
            sync: connected.sync,
            redirectUri,
            linkUrl,
          }),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "connect failed";
        sendHtml(res, 500, "Connection failed", msg);
        finish(() => reject(e instanceof Error ? e : new Error(msg)));
      }
    });

    server.on("error", (e) => {
      finish(() => reject(e));
    });

    server.listen(port, "127.0.0.1", () => {
      if (openBrowser) {
        try {
          openSystemBrowser(linkUrl);
        } catch {
          /* browser open is best-effort */
        }
      }
    });
  });
}
