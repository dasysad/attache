/**
 * Local schedule for `attache transfer rules evaluate` (ADR-017).
 *
 * What: install/uninstall a daily job via launchd (macOS) or a crontab line
 *       (Linux). Does not require Starflow.
 * Why: autonomous rules need a clock on the household Mac; agents can still
 *      call evaluate manually.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { defaultDataDir } from "../db.js";

export const TRANSFER_RULES_LAUNCHD_LABEL = "co.attache.transfer-rules-evaluate";

export interface TransferRulesScheduleStatus {
  platform: NodeJS.Platform;
  installed: boolean;
  launchdPlistPath: string | null;
  cronLine: string;
  evaluateCommand: string;
  message: string;
}

function attacheBin(): string {
  // Prefer PATH `attache`; fall back to pnpm workspace CLI for dogfood.
  return process.env.ATTACHE_BIN?.trim() || "attache";
}

export function transferRulesEvaluateCommand(
  dataDir: string = defaultDataDir(),
): string {
  const bin = attacheBin();
  return `ATTACHE_DATA_DIR=${shellQuote(dataDir)} ${bin} transfer rules evaluate`;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function transferRulesLaunchdPlistPath(
  home: string = homedir(),
): string {
  return join(home, "Library", "LaunchAgents", `${TRANSFER_RULES_LAUNCHD_LABEL}.plist`);
}

export function transferRulesCronLine(
  dataDir: string = defaultDataDir(),
): string {
  // Daily 06:00 local.
  return `0 6 * * * ${transferRulesEvaluateCommand(dataDir)} >> ${join(dataDir, "logs", "transfer-rules.log")} 2>&1`;
}

export function buildLaunchdPlist(
  dataDir: string = defaultDataDir(),
): string {
  const bin = attacheBin();
  const logDir = join(dataDir, "logs");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${TRANSFER_RULES_LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>export ATTACHE_DATA_DIR=${shellQuote(dataDir)}; ${shellQuote(bin)} transfer rules evaluate</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>6</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${join(logDir, "transfer-rules.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(logDir, "transfer-rules.err.log")}</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
`;
}

export function transferRulesScheduleStatus(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  dataDir: string = defaultDataDir(),
): TransferRulesScheduleStatus {
  const platform = process.platform;
  const plist = transferRulesLaunchdPlistPath(home);
  const installed =
    platform === "darwin"
      ? existsSync(plist)
      : existsSync(join(dataDir, "schedule", "transfer-rules.cron"));
  return {
    platform,
    installed,
    launchdPlistPath: platform === "darwin" ? plist : null,
    cronLine: transferRulesCronLine(dataDir),
    evaluateCommand: transferRulesEvaluateCommand(dataDir),
    message: installed
      ? "Schedule installed — daily 06:00 local evaluate."
      : platform === "darwin"
        ? "Not installed. Run: attache transfer rules schedule install"
        : "Not installed. Run: attache transfer rules schedule install (writes crontab line file; add with crontab -e)",
  };
}

export function installTransferRulesSchedule(
  options: {
    home?: string;
    dataDir?: string;
    loadLaunchd?: boolean;
  } = {},
): TransferRulesScheduleStatus {
  const home = options.home ?? homedir();
  const dataDir = options.dataDir ?? defaultDataDir();
  mkdirSync(join(dataDir, "logs"), { recursive: true });

  if (process.platform === "darwin") {
    const plistPath = transferRulesLaunchdPlistPath(home);
    mkdirSync(dirname(plistPath), { recursive: true });
    writeFileSync(plistPath, buildLaunchdPlist(dataDir), "utf8");
    chmodSync(plistPath, 0o644);
    if (options.loadLaunchd !== false) {
      try {
        execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
      } catch {
        /* not loaded yet */
      }
      try {
        execFileSync("launchctl", ["load", plistPath], { stdio: "pipe" });
      } catch (e) {
        // Still installed on disk — operator can load manually.
        void e;
      }
    }
  } else {
    const cronPath = join(dataDir, "schedule", "transfer-rules.cron");
    mkdirSync(dirname(cronPath), { recursive: true });
    writeFileSync(
      cronPath,
      `# Attache transfer rules — add to crontab:\n${transferRulesCronLine(dataDir)}\n`,
      "utf8",
    );
  }
  return transferRulesScheduleStatus(process.env, home, dataDir);
}

export function uninstallTransferRulesSchedule(
  options: { home?: string; dataDir?: string } = {},
): TransferRulesScheduleStatus {
  const home = options.home ?? homedir();
  const dataDir = options.dataDir ?? defaultDataDir();
  if (process.platform === "darwin") {
    const plistPath = transferRulesLaunchdPlistPath(home);
    try {
      execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
    } catch {
      /* ignore */
    }
    if (existsSync(plistPath)) unlinkSync(plistPath);
  } else {
    const cronPath = join(dataDir, "schedule", "transfer-rules.cron");
    if (existsSync(cronPath)) unlinkSync(cronPath);
  }
  return transferRulesScheduleStatus(process.env, home, dataDir);
}

/** Test helper: read plist contents if present. */
export function readInstalledLaunchdPlist(
  home: string = homedir(),
): string | null {
  const path = transferRulesLaunchdPlistPath(home);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}
