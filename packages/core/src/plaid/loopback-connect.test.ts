import { createConnection } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../db.js";
import { createTenant } from "../tenant.js";
import { LocalVaultPort, setVaultForTests } from "../vault/local-vault.js";
import * as sync from "./sync.js";

vi.mock("./sync.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./sync.js")>();
  return {
    ...mod,
    createPlaidLinkToken: vi.fn(),
    connectLivePlaid: vi.fn(),
  };
});

describe("Plaid Link loopback", () => {
  let dataDir: string;
  let vaultDir: string;
  const envBackup = {
    clientId: process.env.PLAID_CLIENT_ID,
    secret: process.env.PLAID_SECRET,
    loopbackPort: process.env.ATTACHE_PLAID_LOOPBACK_PORT,
  };

  afterEach(() => {
    setVaultForTests(null);
    vi.restoreAllMocks();
    process.env.PLAID_CLIENT_ID = envBackup.clientId;
    process.env.PLAID_SECRET = envBackup.secret;
    process.env.ATTACHE_PLAID_LOOPBACK_PORT = envBackup.loopbackPort;
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-plaid-loop-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-plaid-loop-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    return { db, vault };
  }

  it("builds loopback redirect URI", async () => {
    const { plaidLoopbackRedirectUri, PLAID_LOOPBACK_CALLBACK_PATH } = await import(
      "./loopback-connect.js"
    );
    expect(plaidLoopbackRedirectUri(8766)).toBe(
      `http://127.0.0.1:8766${PLAID_LOOPBACK_CALLBACK_PATH}`,
    );
  });

  it("throws when Plaid env is missing", async () => {
    delete process.env.PLAID_CLIENT_ID;
    delete process.env.PLAID_SECRET;
    const { db, vault } = setup();
    const { connectPlaidViaLoopback } = await import("./loopback-connect.js");
    const { LivePlaidAdapter } = await import("../ingest/live-plaid-adapter.js");
    await expect(
      connectPlaidViaLoopback(db, new LivePlaidAdapter({} as never), vault, {
        openBrowser: false,
        timeoutMs: 500,
      }),
    ).rejects.toThrow(/not configured/i);
    db.close();
  });

  it("completes callback and connects item", async () => {
    process.env.PLAID_CLIENT_ID = "test-client";
    process.env.PLAID_SECRET = "test-secret";
    const { db, vault } = setup();
    const { connectPlaidViaLoopback, findLoopbackPort, plaidLoopbackRedirectUri } =
      await import("./loopback-connect.js");
    const { LivePlaidAdapter } = await import("../ingest/live-plaid-adapter.js");
    const port = await findLoopbackPort();
    const redirectUri = plaidLoopbackRedirectUri(port);

    vi.mocked(sync.createPlaidLinkToken).mockResolvedValue({
      linkToken: "link-sandbox-test",
      expiration: new Date().toISOString(),
    });
    vi.mocked(sync.connectLivePlaid).mockResolvedValue({
      itemId: "item-1",
      sync: {
        itemId: "item-1",
        accountsUpdated: 2,
        transactionsNew: 5,
        transactionsSkipped: 0,
      },
    });

    const connectPromise = connectPlaidViaLoopback(
      db,
      new LivePlaidAdapter({} as never),
      vault,
      {
        port,
        openBrowser: false,
        timeoutMs: 10_000,
      },
    );

    await waitForPort(port);

    const res = await fetch(`${redirectUri}?public_token=public-sandbox-test`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Bank connected");

    const result = await connectPromise;
    expect(result.itemId).toBe("item-1");
    expect(result.sync.transactionsNew).toBe(5);
    expect(sync.createPlaidLinkToken).toHaveBeenCalledWith(
      db,
      expect.anything(),
      redirectUri,
    );
    expect(sync.connectLivePlaid).toHaveBeenCalledWith(
      db,
      expect.anything(),
      vault,
      "public-sandbox-test",
    );
    db.close();
  });

  it("rejects callback without public_token", async () => {
    process.env.PLAID_CLIENT_ID = "test-client";
    process.env.PLAID_SECRET = "test-secret";
    const { db, vault } = setup();
    const { connectPlaidViaLoopback, findLoopbackPort, plaidLoopbackRedirectUri } =
      await import("./loopback-connect.js");
    const { LivePlaidAdapter } = await import("../ingest/live-plaid-adapter.js");
    const port = await findLoopbackPort();
    const redirectUri = plaidLoopbackRedirectUri(port);

    vi.mocked(sync.createPlaidLinkToken).mockResolvedValue({
      linkToken: "link-sandbox-test",
      expiration: new Date().toISOString(),
    });

    const connectPromise = connectPlaidViaLoopback(
      db,
      new LivePlaidAdapter({} as never),
      vault,
      {
        port,
        openBrowser: false,
        timeoutMs: 10_000,
      },
    );

    await waitForPort(port);

    const assertReject = expect(connectPromise).rejects.toThrow(/missing public_token/i);
    const res = await fetch(redirectUri);
    expect(res.status).toBe(400);
    await assertReject;
    db.close();
  });

  it("defaults loopback port constant", async () => {
    const { DEFAULT_PLAID_LOOPBACK_PORT } = await import("./loopback-connect.js");
    expect(DEFAULT_PLAID_LOOPBACK_PORT).toBe(8766);
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
