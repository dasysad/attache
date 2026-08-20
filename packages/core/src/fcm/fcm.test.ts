/**
 * BL-6 P0: Android device register + FCM fan-out.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { createTenant } from "../tenant.js";
import { upsertNotification } from "../notify/store.js";
import {
  listPushDevices,
  parsePushDevicePlatform,
  registerPushDevice,
  unlinkPushDevice,
} from "../notify/device.js";
import { fcmBackendFromEnv } from "./config.js";
import { createFcmAdapter, setFcmForTests } from "./create-adapter.js";
import { deliverFcmForNotification } from "./deliver.js";
import { FakeFcmAdapter } from "./fake-adapter.js";
import { LiveFcmAdapter } from "./live-adapter.js";
import { fcmStatus } from "./status.js";

describe("BL-6 FCM device channel", () => {
  let dataDir: string;

  afterEach(() => {
    setFcmForTests(undefined);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-fcm-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "FCM Home", holderDisplayName: "A" });
    return { db };
  }

  it("rejects register before onboard (negative)", () => {
    const db = openDatabase(mkdtempSync(join(tmpdir(), "attache-fcm-empty-")));
    expect(() =>
      registerPushDevice(db, { fcmToken: "tok" }),
    ).toThrow(/not onboarded/);
    db.close();
  });

  it("rejects empty token and non-android platform (negative)", () => {
    const { db } = setup();
    expect(() => registerPushDevice(db, { fcmToken: "  " })).toThrow(/fcm_token/);
    expect(() =>
      registerPushDevice(db, { fcmToken: "tok", platform: "ios" }),
    ).toThrow(/android/);
    expect(() => parsePushDevicePlatform("web")).toThrow(/android/);
    expect(listPushDevices(db)).toEqual([]);
    db.close();
  });

  it("upserts the same FCM token and unlinks", () => {
    const { db } = setup();
    const first = registerPushDevice(db, {
      fcmToken: "abc",
      platform: "android",
      label: "Pixel",
    });
    const second = registerPushDevice(db, {
      fcmToken: "abc",
      label: "Pixel 9",
    });
    expect(second.id).toBe(first.id);
    expect(second.label).toBe("Pixel 9");
    expect(listPushDevices(db)).toHaveLength(1);

    const gone = unlinkPushDevice(db, first.id);
    expect(gone?.id).toBe(first.id);
    expect(listPushDevices(db)).toHaveLength(0);
    expect(unlinkPushDevice(db, first.id)).toBeNull();
    db.close();
  });

  it("defaults ATTACHE_FCM off; live without key throws (negative)", () => {
    expect(fcmBackendFromEnv({})).toBe("off");
    expect(createFcmAdapter({})).toBeNull();
    expect(createFcmAdapter({ ATTACHE_FCM: "sandbox" })).toBeInstanceOf(
      FakeFcmAdapter,
    );
    expect(() => createFcmAdapter({ ATTACHE_FCM: "live" })).toThrow(
      /ATTACHE_FCM_SERVER_KEY/,
    );
    expect(() => fcmBackendFromEnv({ ATTACHE_FCM: "ios" })).toThrow(/Unknown/);
  });

  it("fans out to devices and skips failed tokens (negative)", async () => {
    const { db } = setup();
    const fake = new FakeFcmAdapter();
    fake.failTokens.add("bad");
    registerPushDevice(db, { fcmToken: "good" });
    registerPushDevice(db, { fcmToken: "bad" });
    const { notification } = upsertNotification(db, {
      dedupeKey: "system:fcm-test",
      kind: "system",
      severity: "info",
      title: "Hello",
      body: "body",
      actionUrl: "/app/notifications",
    });

    const sent = await deliverFcmForNotification(db, notification, fake);
    expect(sent).toBe(1);
    expect(fake.sends).toHaveLength(1);
    expect(fake.sends[0]?.token).toBe("good");
    const refreshed = db
      .prepare("SELECT channels_delivered FROM notification WHERE id = ?")
      .get(notification.id) as { channels_delivered: string };
    expect(JSON.parse(refreshed.channels_delivered)).toContain("fcm");
    db.close();
  });

  it("deliver is a no-op without adapter or devices (negative)", async () => {
    const { db } = setup();
    const { notification } = upsertNotification(db, {
      dedupeKey: "system:noop",
      kind: "system",
      severity: "info",
      title: "x",
      body: "y",
    });
    expect(await deliverFcmForNotification(db, notification, null)).toBe(0);
    registerPushDevice(db, { fcmToken: "tok" });
    expect(await deliverFcmForNotification(db, notification, null)).toBe(0);
    db.close();
  });

  it("live adapter posts Authorization key and surfaces HTTP errors", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const okFetch: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ message_id: 99 }), { status: 200 });
    };
    const live = new LiveFcmAdapter("secret", "https://example.test/fcm", okFetch);
    const ok = await live.send("tok", {
      title: "t",
      body: "b",
      notificationId: "n1",
      actionUrl: "/app/notifications",
    });
    expect(ok.ok).toBe(true);
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: "key=secret",
    });

    const fail = new LiveFcmAdapter("secret", "https://example.test/fcm", async () =>
      new Response("nope", { status: 401 }),
    );
    const bad = await fail.send("tok", {
      title: "t",
      body: "b",
      notificationId: "n1",
      actionUrl: null,
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/401/);
  });

  it("status reports stored tokens even when FCM is off", () => {
    const { db } = setup();
    registerPushDevice(db, { fcmToken: "tok" });
    const status = fcmStatus(db, {});
    expect(status.backend).toBe("off");
    expect(status.deviceCount).toBe(1);
    expect(status.message).toMatch(/tokens stored/);
    db.close();
  });
});
