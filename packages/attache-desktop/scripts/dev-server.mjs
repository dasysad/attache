#!/usr/bin/env node
/**
 * Dev helper for `tauri dev` — build workspace packages, start loopback
 * server in the background, wait until :8780 accepts connections, then exit
 * so Tauri can open the webview.
 */
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(__dirname, "..");
const monorepoRoot = join(desktopRoot, "../..");
const serverRoot = join(monorepoRoot, "packages/server");
const port = Number(process.env.PORT ?? 8780);

function portOpen(p) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: p });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitForPort(p, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await portOpen(p)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for 127.0.0.1:${p}`);
}

console.log("[attache-desktop] building core, ui, server…");
execSync("pnpm --filter @attache/core build", { cwd: monorepoRoot, stdio: "inherit" });
execSync("pnpm --filter @attache/ui build:full", { cwd: monorepoRoot, stdio: "inherit" });
execSync("pnpm --filter @attache/server build", { cwd: monorepoRoot, stdio: "inherit" });

if (await portOpen(port)) {
  console.log(`[attache-desktop] server already listening on :${port}`);
  process.exit(0);
}

console.log(`[attache-desktop] starting server on :${port}…`);
const child = spawn("node", ["dist/index.js"], {
  cwd: serverRoot,
  env: { ...process.env, PORT: String(port) },
  detached: true,
  stdio: "ignore",
});
child.unref();

await waitForPort(port);
console.log(`[attache-desktop] server ready → http://127.0.0.1:${port}`);
