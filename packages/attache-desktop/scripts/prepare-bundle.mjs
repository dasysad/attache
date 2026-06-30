#!/usr/bin/env node
/**
 * Stage @attache/server + prod node_modules into src-tauri/server-bundle for
 * Tauri `bundle.resources`. Invoked by `beforeBuildCommand` before `tauri build`.
 *
 * Set ATTACHE_BUNDLE_NODE=1 to embed a Node 22 binary (macOS DMG / CI).
 */
import { createWriteStream, createReadStream, mkdirSync, rmSync, chmodSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { get } from "node:https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(__dirname, "..");
const monorepoRoot = join(desktopRoot, "../..");
const bundleDir = join(desktopRoot, "src-tauri/server-bundle");

const NODE_VERSION = process.env.ATTACHE_NODE_VERSION ?? "v22.14.0";

function download(url, dest) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`GET ${url} → ${res.statusCode}`));
        return;
      }
      const out = createWriteStream(dest);
      res.pipe(out);
      out.on("finish", resolve);
      out.on("error", reject);
    }).on("error", reject);
  });
}

async function bundleNode(targetDir) {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const folder = `node-${NODE_VERSION}-darwin-${arch}`;
  const tarball = `${folder}.tar.gz`;
  const url = `https://nodejs.org/dist/${NODE_VERSION}/${tarball}`;
  const tarPath = join(targetDir, tarball);
  const nodeDir = join(targetDir, "node");

  console.log(`[prepare-bundle] downloading ${url}`);
  await download(url, tarPath);
  mkdirSync(nodeDir, { recursive: true });
  execSync(`tar -xzf "${tarPath}" -C "${nodeDir}" --strip-components=1`, { stdio: "inherit" });
  rmSync(tarPath, { force: true });
  const nodeBin = join(nodeDir, "bin", "node");
  if (existsSync(nodeBin)) chmodSync(nodeBin, 0o755);
  console.log(`[prepare-bundle] embedded Node at ${nodeBin}`);
}

console.log("[prepare-bundle] building workspace packages…");
execSync("pnpm --filter @attache/core build", { cwd: monorepoRoot, stdio: "inherit" });
execSync("pnpm --filter @attache/ui build:full", { cwd: monorepoRoot, stdio: "inherit" });
execSync("pnpm --filter @attache/server build", { cwd: monorepoRoot, stdio: "inherit" });

rmSync(bundleDir, { recursive: true, force: true });
mkdirSync(bundleDir, { recursive: true });

console.log(`[prepare-bundle] pnpm deploy → ${bundleDir}`);
execSync(`pnpm --filter=@attache/server deploy --legacy "${bundleDir}"`, {
  cwd: monorepoRoot,
  stdio: "inherit",
});

if (process.env.ATTACHE_BUNDLE_NODE === "1") {
  await bundleNode(bundleDir);
}

console.log("[prepare-bundle] done");
