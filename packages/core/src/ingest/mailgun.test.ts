/**
 * BL-8 P0: BYO Mailgun inbound — signature + existing ingest pipeline.
 */
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { createTenant } from "../tenant.js";
import { FakeDocumentAdapter } from "./fake-document-adapter.js";
import { hostedIngressStatus } from "./ingress-status.js";
import {
  ingestMailgunWebhook,
  MailgunWebhookError,
  mailgunFormToPayload,
  signMailgunWebhook,
  verifyMailgunSignature,
} from "./mailgun.js";
import { getOrCreateIngestToken, ingestEmailAddress } from "./token.js";

describe("BL-8 Mailgun ingress", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-mg-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Mail", holderDisplayName: "A" });
    return { db };
  }

  it("accepts a fresh HMAC and rejects a bad/stale signature (negative)", () => {
    const key = "signing-secret";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const token = "tok123";
    const signature = signMailgunWebhook(key, timestamp, token);
    expect(verifyMailgunSignature(key, timestamp, token, signature)).toBe(true);
    expect(verifyMailgunSignature(key, timestamp, token, "deadbeef")).toBe(false);
    expect(verifyMailgunSignature(key, "100", token, signature)).toBe(false);
    const other = createHmac("sha256", "other-key")
      .update(`${timestamp}${token}`)
      .digest("hex");
    expect(verifyMailgunSignature(key, timestamp, token, other)).toBe(false);
  });

  it("maps Mailgun form fields; missing subject is 400 (negative)", () => {
    const payload = mailgunFormToPayload({
      recipient: "bills+abc@ingest.attache.app",
      sender: "util@example.com",
      subject: "Your bill",
      "body-plain": "Amount due $40",
    });
    expect(payload.to).toContain("bills+");
    expect(payload.from).toBe("util@example.com");
    expect(() =>
      mailgunFormToPayload({ sender: "a@b.com", subject: "x" }),
    ).toThrow(MailgunWebhookError);
  });

  it("503 without signing key; 401 on bad sig; ingest on valid (negative)", async () => {
    const { db } = setup();
    const token = getOrCreateIngestToken(db);
    const to = ingestEmailAddress(token);
    const ts = String(Math.floor(Date.now() / 1000));
    const mgToken = "mg-token";
    const key = "mg-secret";
    const body = {
      timestamp: ts,
      token: mgToken,
      signature: signMailgunWebhook(key, ts, mgToken),
      recipient: to,
      sender: "bills@utility.example",
      subject: "Electric bill due",
      "body-plain": "Payee: Mailgun Utility\nAmount: $42.00\nDue: 2026-09-15",
    };

    await expect(
      ingestMailgunWebhook(db, new FakeDocumentAdapter(), body, {}),
    ).rejects.toMatchObject({ statusCode: 503 });

    await expect(
      ingestMailgunWebhook(db, new FakeDocumentAdapter(), body, {
        ATTACHE_MAILGUN_SIGNING_KEY: "wrong",
      }),
    ).rejects.toMatchObject({ statusCode: 401 });

    const result = await ingestMailgunWebhook(
      db,
      new FakeDocumentAdapter(),
      body,
      { ATTACHE_MAILGUN_SIGNING_KEY: key },
    );
    expect(result.billsCreated).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it("status discloses plaintext and names IMAP/Gmail as primary", () => {
    const { db } = setup();
    const off = hostedIngressStatus(db, {});
    expect(off.mailgunConfigured).toBe(false);
    expect(off.primaryPath).toBe("imap_or_gmail");
    expect(off.honesty).toMatch(/plaintext/);
    expect(off.webhookPath).toBe("/api/ingest/mailgun");

    const on = hostedIngressStatus(db, { ATTACHE_MAILGUN_SIGNING_KEY: "k" });
    expect(on.mailgunConfigured).toBe(true);
    expect(on.message).toMatch(/Mailgun/);
    db.close();
  });
});
