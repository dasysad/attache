import { createConnection } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../db.js";
import { createTenant } from "../tenant.js";
import { LocalVaultPort, setVaultForTests } from "../vault/local-vault.js";
import {
  createGmailOAuthState,
} from "./store.js";
import * as store from "./store.js";

vi.mock("./store.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./store.js")>();
  return {
    ...mod,
    connectGmailFromAuthCode: vi.fn(),
  };
});

describe("VS-4.4 Gmail loopback OAuth", () => {
  let dataDir: string;
  let vaultDir: string;
  const envBackup = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    loopbackPort: process.env.ATTACHE_GMAIL_LOOPBACK_PORT,
  };

  afterEach(() => {
    setVaultForTests(null);
    vi.restoreAllMocks();
    process.env.GOOGLE_CLIENT_ID = envBackup.clientId;
    process.env.GOOGLE_CLIENT_SECRET = envBackup.clientSecret;
    process.env.ATTACHE_GMAIL_LOOPBACK_PORT = envBackup.loopbackPort;
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-gmail-loop-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-gmail-loop-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    return { db, vault };
  }

  it("builds loopback redirect URI", async () => {
    const { gmailLoopbackRedirectUri, GMAIL_LOOPBACK_CALLBACK_PATH } = await import(
      "./loopback-connect.js"
    );
    expect(gmailLoopbackRedirectUri(8765)).toBe(
      `http://127.0.0.1:8765${GMAIL_LOOPBACK_CALLBACK_PATH}`,
    );
  });

  it("finds an available port", async () => {
    const { findLoopbackPort } = await import("./loopback-connect.js");
    const port = await findLoopbackPort();
    expect(port).toBeGreaterThan(0);
  });

  it("throws when Google OAuth env is missing", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const { db, vault } = setup();
    const { connectGmailViaLoopback } = await import("./loopback-connect.js");
    await expect(
      connectGmailViaLoopback(db, vault, { openBrowser: false, timeoutMs: 500 }),
    ).rejects.toThrow(/not configured/i);
    db.close();
  });

  it("completes callback and connects account", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    const { db, vault } = setup();
    const { connectGmailViaLoopback, findLoopbackPort, gmailLoopbackRedirectUri } =
      await import("./loopback-connect.js");
    const port = await findLoopbackPort();
    const redirectUri = gmailLoopbackRedirectUri(port);

    const mockAccount = {
      id: "g1",
      tenantId: "t1",
      email: "user@gmail.com",
      label: "user@gmail.com",
      vaultCredentialRef: "gmail/account/user@gmail.com",
      status: "active" as const,
      lastSyncAt: null,
      historyId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    vi.mocked(store.connectGmailFromAuthCode).mockResolvedValue(mockAccount);

    const state = createGmailOAuthState(db);
    const connectPromise = connectGmailViaLoopback(db, vault, {
      port,
      openBrowser: false,
      timeoutMs: 10_000,
    });

    await waitForPort(port);

    const res = await fetch(
      `${redirectUri}?code=test-auth-code&state=${encodeURIComponent(state)}`,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Gmail connected");

    const result = await connectPromise;
    expect(result.account.email).toBe("user@gmail.com");
    expect(result.redirectUri).toBe(redirectUri);
    expect(store.connectGmailFromAuthCode).toHaveBeenCalledWith(
      db,
      vault,
      "test-auth-code",
      expect.objectContaining({ redirectUri }),
    );
    db.close();
  });

  it("rejects invalid oauth state", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    const { db, vault } = setup();
    const { connectGmailViaLoopback, findLoopbackPort, gmailLoopbackRedirectUri } =
      await import("./loopback-connect.js");
    const port = await findLoopbackPort();
    const redirectUri = gmailLoopbackRedirectUri(port);

    const connectPromise = connectGmailViaLoopback(db, vault, {
      port,
      openBrowser: false,
      timeoutMs: 10_000,
    });

    await waitForPort(port);

    const assertReject = expect(connectPromise).rejects.toThrow(/invalid OAuth state/i);
    const res = await fetch(`${redirectUri}?code=x&state=bad-state`);
    expect(res.status).toBe(400);
    await assertReject;
    db.close();
  });

  it("defaults loopback port constant", async () => {
    const { DEFAULT_GMAIL_LOOPBACK_PORT } = await import("./loopback-connect.js");
    expect(DEFAULT_GMAIL_LOOPBACK_PORT).toBe(8765);
  });
});

async function waitForPort(port: number, attempts = 40): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await new Promise<void>((resolve, reject) => {
        const sock = createConnection({ port, host: "127.0.0.1" }, () => {
          sock.destroy();
          resolve();
        });
        sock.on("error", reject);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  throw new Error(`port ${port} did not become ready`);
}
