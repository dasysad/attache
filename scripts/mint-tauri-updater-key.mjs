#!/usr/bin/env node
/**
 * Mint (or rotate) the Tauri updater minisign keypair.
 *
 * Stores secrets in Starsystem vault (`ss vault`) and syncs to GitHub Actions.
 * Enables updater artifacts in tauri.conf.json when minting succeeds.
 *
 * Prerequisites:
 *   - `ss` on PATH (starsystem-cli from celestial-intelligence)
 *   - `gh auth login`
 *   - pnpm install (for @attache/desktop tauri CLI)
 *
 * Usage:
 *   node scripts/mint-tauri-updater-key.mjs
 *   node scripts/mint-tauri-updater-key.mjs --force
 *
 * Vault (workspace=attache, env=prod by default):
 *   TAURI_SIGNING_PRIVATE_KEY_B64
 *   TAURI_SIGNING_PRIVATE_KEY_PASSWORD
 *   TAURI_SIGNING_PUBLIC_KEY
 */
import { execSync, spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const desktopRoot = join(repoRoot, "packages/attache-desktop");
const tauriConfPath = join(desktopRoot, "src-tauri/tauri.conf.json");

const args = process.argv.slice(2);
const force = args.includes("--force");
const enableUpdater = !args.includes("--no-enable-updater");
const workspace =
  args.find((a) => a.startsWith("--workspace="))?.split("=")[1] ?? "attache";
const env = args.find((a) => a.startsWith("--env="))?.split("=")[1] ?? "prod";

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...opts,
  }).trim();
}

function ssVault(args) {
  const r = spawnSync("ss", ["vault", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "ss vault failed");
  }
  return (r.stdout ?? "").trim();
}

function haveSs() {
  return spawnSync("ss", ["--version"], { stdio: "ignore" }).status === 0;
}

function vaultGet(key) {
  try {
    return ssVault([
      "get-secret",
      key,
      `--workspace=${workspace}`,
      `--env=${env}`,
      "--raw",
    ]);
  } catch {
    return "";
  }
}

function vaultSet(key, value) {
  ssVault([
    "set-secret",
    `${key}=${value}`,
    `--workspace=${workspace}`,
    `--env=${env}`,
  ]);
}

function vaultSetB64(key, value) {
  const b64 = Buffer.from(value, "utf8").toString("base64");
  vaultSet(`${key}_B64`, b64);
}

function vaultGetB64(key) {
  const b64 = vaultGet(`${key}_B64`);
  if (!b64) return "";
  return Buffer.from(b64, "base64").toString("utf8");
}

function ghRepo() {
  return sh("gh repo view --json nameWithOwner -q .nameWithOwner");
}

function syncGhSecret(name, value) {
  const tmp = join(repoRoot, `.gh-secret-${name}.tmp`);
  writeFileSync(tmp, value, { mode: 0o600 });
  try {
    sh(`gh secret set ${name} --repo ${ghRepo()} < "${tmp}"`);
  } finally {
    execSync(`rm -f "${tmp}"`);
  }
}

function patchTauriConf(pubkey) {
  const conf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
  conf.plugins ??= {};
  conf.plugins.updater ??= {};
  conf.plugins.updater.pubkey = pubkey.trim();
  if (enableUpdater) {
    conf.bundle ??= {};
    conf.bundle.createUpdaterArtifacts = true;
  }
  writeFileSync(tauriConfPath, `${JSON.stringify(conf, null, 2)}\n`);
}

function generateKeypair(keyPath, password) {
  mkdirSync(dirname(keyPath), { recursive: true });
  execSync(
    `pnpm tauri signer generate -w "${keyPath}" --force -p "${password}"`,
    {
      cwd: desktopRoot,
      stdio: "inherit",
      env: { ...process.env, CI: "true" },
    },
  );
  const priv = readFileSync(keyPath, "utf8");
  const pub = readFileSync(`${keyPath}.pub`, "utf8").trim();
  chmodSync(keyPath, 0o600);
  return { priv, pub, password };
}

function main() {
  if (!haveSs()) {
    console.error(
      "❌ ss not found — install starsystem-cli from celestial-intelligence checkout",
    );
    process.exit(1);
  }
  try {
    sh("gh auth status");
  } catch {
    console.error("❌ gh not authenticated — run: gh auth login");
    process.exit(1);
  }

  const existingPriv = vaultGetB64("TAURI_SIGNING_PRIVATE_KEY");
  if (existingPriv && !force) {
    const pub = vaultGet("TAURI_SIGNING_PUBLIC_KEY") || "(unknown)";
    console.log(`✅ Updater key already in vault (${workspace}/${env})`);
    console.log(`   public: ${pub.slice(0, 56)}…`);
    console.log("   Use --force to rotate");
    return;
  }

  const keyPath = join(
    process.env.HOME ?? repoRoot,
    ".tauri",
    "attache-updater.key",
  );
  const password = randomBytes(24).toString("base64url");
  console.log(`[mint] generating minisign keypair → ${keyPath}`);
  const { priv, pub } = generateKeypair(keyPath, password);

  console.log(`[mint] storing in ss vault (${workspace}/${env})…`);
  vaultSetB64("TAURI_SIGNING_PRIVATE_KEY", priv);
  vaultSet("TAURI_SIGNING_PRIVATE_KEY_PASSWORD", password);
  vaultSet("TAURI_SIGNING_PUBLIC_KEY", pub);

  console.log("[mint] syncing GitHub Actions secrets…");
  syncGhSecret("TAURI_SIGNING_PRIVATE_KEY", priv);
  syncGhSecret("TAURI_SIGNING_PRIVATE_KEY_PASSWORD", password);

  patchTauriConf(pub);
  console.log(`[mint] updated ${tauriConfPath} (createUpdaterArtifacts=${enableUpdater})`);

  console.log("");
  console.log("✅ Tauri updater key minted");
  console.log(
    `   vault: ss vault get-secret TAURI_SIGNING_PUBLIC_KEY --workspace=${workspace} --env=${env} --raw`,
  );
  console.log("   next: commit packages/attache-desktop/src-tauri/tauri.conf.json");
  console.log(
    "   then: sf run release-attache-desktop --input version=desktop-v0.1.0",
  );
}

main();
