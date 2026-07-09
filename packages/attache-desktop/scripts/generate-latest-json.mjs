#!/usr/bin/env node
/**
 * Build Tauri updater manifest (latest.json) from signed .tar.gz artifacts.
 *
 * Usage:
 *   node scripts/generate-latest-json.mjs <staging-dir> <tag> [repo]
 *
 * Expects files named:
 *   attache-updater-aarch64-<tag>.tar.gz(.sig)
 *   attache-updater-x86_64-<tag>.tar.gz(.sig)
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const [stagingDir, tag, repo = "dasysad/attache"] = process.argv.slice(2);
if (!stagingDir || !tag) {
  console.error("Usage: generate-latest-json.mjs <staging-dir> <tag> [owner/repo]");
  process.exit(1);
}

const version = tag.replace(/^desktop-v/, "");
const baseUrl = `https://github.com/${repo}/releases/download/${tag}`;

const platforms = {
  "darwin-aarch64": { arch: "aarch64", file: `attache-updater-aarch64-${tag}.tar.gz` },
  "darwin-x86_64": { arch: "x86_64", file: `attache-updater-x86_64-${tag}.tar.gz` },
};

const out = {
  version,
  notes: `Attache Desktop ${tag}`,
  pub_date: new Date().toISOString(),
  platforms: {},
};

for (const [key, { file }] of Object.entries(platforms)) {
  const bundlePath = join(stagingDir, file);
  const sigPath = `${bundlePath}.sig`;
  if (!existsSync(bundlePath) || !existsSync(sigPath)) {
    console.error(`[generate-latest-json] missing ${file} or signature — skip ${key}`);
    continue;
  }
  out.platforms[key] = {
    signature: readFileSync(sigPath, "utf8").trim(),
    url: `${baseUrl}/${file}`,
  };
}

if (!Object.keys(out.platforms).length) {
  console.error("[generate-latest-json] no updater artifacts found");
  process.exit(1);
}

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
