import { chmodSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultVaultDir } from "../db.js";

/**
 * Local credential vault — VS-3 dev stand-in for @celestial/vault.
 * Stores secrets outside SQLite per ADR-004. Files are mode 600.
 */
export interface VaultPort {
  set(ref: string, value: string): void;
  get(ref: string): string | null;
  delete(ref: string): void;
}

export class LocalVaultPort implements VaultPort {
  constructor(private readonly rootDir = defaultVaultDir()) {
    mkdirSync(rootDir, { recursive: true, mode: 0o700 });
  }

  private path(ref: string): string {
    const safe = ref.replace(/[^a-zA-Z0-9/_-]/g, "_");
    return join(this.rootDir, `${safe}.secret`);
  }

  set(ref: string, value: string): void {
    const p = this.path(ref);
    mkdirSync(join(p, ".."), { recursive: true, mode: 0o700 });
    writeFileSync(p, value, { encoding: "utf-8", mode: 0o600 });
  }

  get(ref: string): string | null {
    const p = this.path(ref);
    try {
      return readFileSync(p, "utf-8");
    } catch {
      return null;
    }
  }

  delete(ref: string): void {
    try {
      unlinkSync(this.path(ref));
    } catch {
      /* missing ok */
    }
  }
}

/** Default singleton for CLI and server. */
let defaultVault: VaultPort | null = null;

export function getVault(): VaultPort {
  if (!defaultVault) defaultVault = new LocalVaultPort();
  return defaultVault;
}

export function setVaultForTests(vault: VaultPort | null): void {
  defaultVault = vault;
}
