import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { createKeyfile, writeKeyfile, type ScryptParams } from "./keyring.js";
import { encryptPlaintextDatabase } from "./migrate.js";
import { sealSecretUtf8 } from "./secret-file.js";
import { vaultStatus } from "./status.js";

const FAST: ScryptParams = { N: 1024, r: 8, p: 1, keylen: 32 };

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "attache-status-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("vaultStatus", () => {
  it("reports an empty, unencrypted directory", () => {
    const s = vaultStatus(dir);
    expect(s.encrypted).toBe(false);
    expect(s.databaseExists).toBe(false);
    expect(s.plaintextBackupExists).toBe(false);
    expect(s.kdf).toBeUndefined();
  });

  it("reports a plaintext database as unencrypted but present", () => {
    openDatabase(dir).close();
    const s = vaultStatus(dir);
    expect(s.encrypted).toBe(false);
    expect(s.databaseExists).toBe(true);
  });

  it("reports encryption + kdf params once a keyfile exists", () => {
    const { keyfile } = createKeyfile("p", FAST);
    writeKeyfile(keyfile, dir);
    const s = vaultStatus(dir);
    expect(s.encrypted).toBe(true);
    expect(s.kdf).toBe("scrypt");
    expect(s.params).toEqual(FAST);
  });

  it("reports the plaintext backup after a migration", () => {
    openDatabase(dir).close();
    const { keyfile, dek } = createKeyfile("p", FAST);
    encryptPlaintextDatabase(dir, dek);
    writeKeyfile(keyfile, dir);
    const s = vaultStatus(dir);
    expect(s.encrypted).toBe(true);
    expect(s.plaintextBackupExists).toBe(true);
  });

  it("counts plaintext and encrypted secret files", () => {
    const vaultDir = mkdtempSync(join(tmpdir(), "attache-status-vault-"));
    writeFileSync(join(vaultDir, "a.secret"), "plain", { mode: 0o600 });
    writeFileSync(join(vaultDir, "b.secret"), sealSecretUtf8(Buffer.alloc(32, 1), "enc"), {
      mode: 0o600,
    });
    const s = vaultStatus(dir, vaultDir);
    expect(s.plaintextSecretCount).toBe(1);
    expect(s.encryptedSecretCount).toBe(1);
    rmSync(vaultDir, { recursive: true, force: true });
  });
});
