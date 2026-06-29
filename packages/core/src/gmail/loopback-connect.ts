/**
 * Gmail OAuth loopback connect — VS-4.4 / ADR-008.
 *
 * What: ephemeral 127.0.0.1 HTTP server receives Google redirect without attache web.
 * Why: agent-first — CLI owns token acquisition on the user's device.
 */
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type Database from "better-sqlite3";
import type { GmailAccount } from "../domain.js";
import type { VaultPort } from "../vault/local-vault.js";
import {
  buildGoogleAuthUrl,
  getGoogleOAuthConfig,
} from "./oauth.js";
import {
  connectGmailFromAuthCode,
  consumeGmailOAuthState,
  createGmailOAuthState,
} from "./store.js";

/** Default loopback port — register in Google Cloud Console. */
export const DEFAULT_GMAIL_LOOPBACK_PORT = 8765;

export const GMAIL_LOOPBACK_CALLBACK_PATH = "/oauth/callback";

export interface GmailLoopbackConnectOptions {
  /** Loopback port (default ATTACHE_GMAIL_LOOPBACK_PORT or 8765). */
  port?: number;
  /** Open system browser to Google consent (default true). */
  openBrowser?: boolean;
  /** Max wait for user to complete consent (default 5 min). */
  timeoutMs?: number;
}

export interface GmailLoopbackConnectResult {
  account: GmailAccount;
  redirectUri: string;
  authUrl: string;
}

export function gmailLoopbackRedirectUri(port: number): string {
  return `http://127.0.0.1:${port}${GMAIL_LOOPBACK_CALLBACK_PATH}`;
}

/** Resolve a free TCP port on 127.0.0.1, preferring `preferred` when available. */
export async function findLoopbackPort(preferred?: number): Promise<number> {
  if (preferred !== undefined) {
    try {
      await assertPortFree(preferred);
      return preferred;
    } catch {
      return findLoopbackPort();
    }
  }
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const addr = probe.address();
      if (!addr || typeof addr === "string") {
        probe.close(() => reject(new Error("could not allocate loopback port")));
        return;
      }
      const port = addr.port;
      probe.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function assertPortFree(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => {
      probe.close((err) => (err ? reject(err) : resolve()));
    });
  });
}

function resolveLoopbackPort(explicit?: number): number {
  if (explicit !== undefined) return explicit;
  const fromEnv = process.env.ATTACHE_GMAIL_LOOPBACK_PORT;
  if (fromEnv) {
    const n = Number(fromEnv);
    if (Number.isInteger(n) && n > 0 && n < 65536) return n;
  }
  return DEFAULT_GMAIL_LOOPBACK_PORT;
}

function openSystemBrowser(url: string): void {
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui;padding:2rem;max-width:32rem;margin:auto">
<h1>${title}</h1><p>${body}</p></body></html>`;
}

function sendHtml(res: ServerResponse, status: number, title: string, body: string): void {
  const html = htmlPage(title, body);
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function parseCallbackQuery(url: string): URLSearchParams {
  const q = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  return new URLSearchParams(q);
}

/**
 * Run full OAuth loopback: local listener → browser → code exchange → vault.
 * Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET and matching redirect URI in GCP.
 */
export async function connectGmailViaLoopback(
  db: Database.Database,
  vault: VaultPort,
  options: GmailLoopbackConnectOptions = {},
): Promise<GmailLoopbackConnectResult> {
  const preferred = resolveLoopbackPort(options.port);
  const port = await findLoopbackPort(preferred);
  const redirectUri = gmailLoopbackRedirectUri(port);
  const config = getGoogleOAuthConfig(redirectUri);
  if (!config) {
    throw new Error(
      "Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
    );
  }

  const state = createGmailOAuthState(db);
  const authUrl = buildGoogleAuthUrl(config, state);
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const openBrowser = options.openBrowser !== false;

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
            `Gmail OAuth timed out after ${timeoutMs / 1000}s — complete consent in the browser`,
          ),
        ),
      );
    }, timeoutMs);

    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const path = req.url?.split("?")[0] ?? "";
      if (path !== GMAIL_LOOPBACK_CALLBACK_PATH) {
        sendHtml(res, 404, "Not found", "Unknown path.");
        return;
      }

      const params = parseCallbackQuery(req.url ?? "");
      const err = params.get("error");
      if (err) {
        sendHtml(res, 400, "Authorization denied", `Google returned: ${err}`);
        finish(() => reject(new Error(`Google OAuth error: ${err}`)));
        return;
      }

      const code = params.get("code");
      const returnedState = params.get("state");
      if (!code || !returnedState) {
        sendHtml(res, 400, "Invalid callback", "Missing code or state.");
        finish(() => reject(new Error("OAuth callback missing code or state")));
        return;
      }

      if (!consumeGmailOAuthState(db, returnedState)) {
        sendHtml(res, 400, "Invalid state", "CSRF state expired or already used.");
        finish(() => reject(new Error("invalid OAuth state")));
        return;
      }

      try {
        const account = await connectGmailFromAuthCode(db, vault, code, config);
        sendHtml(
          res,
          200,
          "Gmail connected",
          `Connected <strong>${account.email}</strong>. You can close this tab and return to the terminal.`,
        );
        finish(() =>
          resolve({ account, redirectUri, authUrl }),
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
          openSystemBrowser(authUrl);
        } catch {
          /* browser open is best-effort */
        }
      }
    });
  });
}
