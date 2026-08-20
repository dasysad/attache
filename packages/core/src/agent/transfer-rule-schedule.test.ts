/**
 * launchd/cron helpers — write files under a temp home (no launchctl required).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildLaunchdPlist,
  installTransferRulesSchedule,
  readInstalledLaunchdPlist,
  TRANSFER_RULES_LAUNCHD_LABEL,
  transferRulesCronLine,
  transferRulesEvaluateCommand,
  uninstallTransferRulesSchedule,
} from "./transfer-rule-schedule.js";

describe("transfer-rule-schedule", () => {
  let home: string;
  let dataDir: string;

  afterEach(() => {
    if (home) rmSync(home, { recursive: true, force: true });
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it("builds evaluate command and cron line", () => {
    const cmd = transferRulesEvaluateCommand("/tmp/attache-data");
    expect(cmd).toMatch(/ATTACHE_DATA_DIR=/);
    expect(cmd).toMatch(/transfer rules evaluate/);
    expect(transferRulesCronLine("/tmp/attache-data")).toMatch(/^0 6 \* \* \*/);
  });

  it("installs launchd plist without loading (darwin path)", () => {
    home = mkdtempSync(join(tmpdir(), "attache-sched-home-"));
    dataDir = mkdtempSync(join(tmpdir(), "attache-sched-data-"));
    if (process.platform !== "darwin") {
      // Still exercise plist builder + Linux cron file path below.
      expect(buildLaunchdPlist(dataDir)).toContain(TRANSFER_RULES_LAUNCHD_LABEL);
      const status = installTransferRulesSchedule({
        home,
        dataDir,
        loadLaunchd: false,
      });
      expect(status.installed).toBe(true);
      uninstallTransferRulesSchedule({ home, dataDir });
      return;
    }
    const status = installTransferRulesSchedule({
      home,
      dataDir,
      loadLaunchd: false,
    });
    expect(status.installed).toBe(true);
    const plist = readInstalledLaunchdPlist(home);
    expect(plist).toContain(TRANSFER_RULES_LAUNCHD_LABEL);
    expect(plist).toContain("transfer rules evaluate");
    const gone = uninstallTransferRulesSchedule({ home, dataDir });
    expect(gone.installed).toBe(false);
    expect(readInstalledLaunchdPlist(home)).toBeNull();
  });
});
