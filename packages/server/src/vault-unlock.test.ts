import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearSessionDek,
  createKeyfile,
  defaultDataDir,
  writeKeyfile,
  type ScryptParams,
} from "@attache/core";

/**
 * Server vault gate integration — uses dynamic import so ATTACHE_DATA_DIR can be
 * set before the Hono app module loads.
 */

const FAST: ScryptParams = { N: 1024, r: 8, p: 1, keylen: 32 };

let dir: string;
let previousDataDir: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "attache-srv-vault-"));
  previousDataDir = process.env.ATTACHE_DATA_DIR;
  process.env.ATTACHE_DATA_DIR = dir;
  process.env.ATTACHE_SERVER_AUTOSTART = "0";
  clearSessionDek();
});

afterEach(() => {
  clearSessionDek();
  if (previousDataDir === undefined) delete process.env.ATTACHE_DATA_DIR;
  else process.env.ATTACHE_DATA_DIR = previousDataDir;
  rmSync(dir, { recursive: true, force: true });
});

describe("server vault unlock routes", () => {
  it("redirects / to /vault/unlock when encrypted and locked", async () => {
    const { keyfile } = createKeyfile("secret", FAST);
    writeKeyfile(keyfile, dir);
    const { app } = await import("./index.js");

    const res = await app.request("http://localhost/");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/vault/unlock");
  });

  it("returns 503 on /health when locked", async () => {
    const { keyfile } = createKeyfile("secret", FAST);
    writeKeyfile(keyfile, dir);
    const { app } = await import("./index.js");

    const res = await app.request("http://localhost/health");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; encrypted: boolean };
    expect(body.status).toBe("locked");
    expect(body.encrypted).toBe(true);
  });

  it("unlocks via POST /vault/unlock and then serves /", async () => {
    const { keyfile } = createKeyfile("secret", FAST);
    writeKeyfile(keyfile, dir);
    const { app } = await import("./index.js");

    const unlock = await app.request("http://localhost/vault/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "passphrase=secret",
    });
    expect(unlock.status).toBe(302);

    const health = await app.request("http://localhost/health");
    expect(health.status).toBe(200);

    const home = await app.request("http://localhost/");
    // Unlocked: may redirect to /onboard (not set up), but never back to /vault/unlock.
    if (home.status === 302) {
      expect(home.headers.get("location")).not.toBe("/vault/unlock");
    } else {
      expect(home.status).toBe(200);
    }
  });

  it("allows / when no keyfile (plaintext)", async () => {
    expect(defaultDataDir()).toBe(dir);
    const { app } = await import("./index.js");

    const health = await app.request("http://localhost/health");
    expect(health.status).toBe(200);
  });
});
