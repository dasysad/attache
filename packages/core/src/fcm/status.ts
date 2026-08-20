/**
 * FCM / device-channel status (BL-6) — CLI/MCP `devices` JSON.
 *
 * Honesty: registered tokens do not imply Google delivery.
 */
import type Database from "better-sqlite3";
import { fcmBackendFromEnv, fcmServerKeyFromEnv, type FcmBackend } from "./config.js";
import { listPushDevices } from "../notify/device.js";

export interface FcmStatus {
  backend: FcmBackend;
  configured: boolean;
  mode: "off" | "sandbox" | "live";
  deviceCount: number;
  message: string;
}

export function fcmStatus(
  db: Database.Database,
  env: NodeJS.ProcessEnv = process.env,
): FcmStatus {
  const backend = fcmBackendFromEnv(env);
  const deviceCount = listPushDevices(db).length;
  const liveKey = Boolean(fcmServerKeyFromEnv(env));
  const mode: FcmStatus["mode"] =
    backend === "sandbox" ? "sandbox" : backend === "live" && liveKey ? "live" : "off";
  const message =
    backend === "off"
      ? "FCM off — tokens stored; no Google send. Set ATTACHE_FCM=sandbox to dogfood locally."
      : backend === "sandbox"
        ? "Sandbox FCM — sends are recorded in-process, not delivered to a phone."
        : liveKey
          ? "Live FCM — companion tokens will be posted to Google (legacy HTTP)."
          : "Live FCM selected but ATTACHE_FCM_SERVER_KEY is unset.";
  return {
    backend,
    configured: backend !== "off",
    mode,
    deviceCount,
    message,
  };
}
