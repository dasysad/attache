/**
 * Shared loopback HTTP helpers — Gmail OAuth, Plaid Link redirect, etc.
 *
 * WHAT: ephemeral 127.0.0.1 listeners for local consent/callback flows.
 * WHY: agent-first CLI acquires tokens on-device without the Attache web server.
 */
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import type { ServerResponse } from "node:http";

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

export function assertPortFree(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => {
      probe.close((err) => (err ? reject(err) : resolve()));
    });
  });
}

export function openSystemBrowser(url: string): void {
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

export function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui;padding:2rem;max-width:32rem;margin:auto">
<h1>${title}</h1><p>${body}</p></body></html>`;
}

export function sendHtml(res: ServerResponse, status: number, title: string, body: string): void {
  const html = htmlPage(title, body);
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

export function parseCallbackQuery(url: string): URLSearchParams {
  const q = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  return new URLSearchParams(q);
}

/** Plaid Hosted Link entry URL for a link_token. */
export function plaidHostedLinkUrl(linkToken: string): string {
  return `https://cdn.plaid.com/link/v2/stable/link.html?token=${encodeURIComponent(linkToken)}`;
}
