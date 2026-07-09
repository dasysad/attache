import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearSessionDek,
  DatabaseLockedError,
  resolveKey,
  setSessionDek,
} from "./key-provider.js";
import { createKeyfile, writeKeyfile, type ScryptParams } from "./keyring.js";
import {
  assertDatabaseUnlocked,
  databaseLockedHelp,
  isDatabaseUnlocked,
  unlockDatabaseWithPassphrase,
} from "./unlock.js";

const FAST: ScryptParams = { N: 1024, r: 8, p: 1, keylen: 32 };

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "attache-unlock-"));
});

afterEach(() => {
  clearSessionDek();
  rmSync(dir, { recursive: true, force: true });
});

describe("session DEK in resolveKey", () => {
  it("uses the session DEK before env sources", () => {
    const { keyfile } = createKeyfile("env-pass", FAST);
    const session = Buffer.alloc(32, 9);
    setSessionDek(session);
    const resolved = resolveKey(keyfile, {
      env: { ATTACHE_PASSPHRASE: "env-pass" },
    });
    expect(resolved.source).toBe("session-dek");
    expect(resolved.dek).toBe(session);
  });
});

describe("isDatabaseUnlocked", () => {
  it("is true with no keyfile", () => {
    expect(isDatabaseUnlocked(dir)).toBe(true);
  });

  it("is false when encrypted and no key source", () => {
    const { keyfile } = createKeyfile("p", FAST);
    writeKeyfile(keyfile, dir);
    expect(isDatabaseUnlocked(dir)).toBe(false);
  });

  it("is true after unlockDatabaseWithPassphrase caches the DEK", () => {
    const { keyfile } = createKeyfile("secret", FAST);
    writeKeyfile(keyfile, dir);
    unlockDatabaseWithPassphrase("secret", dir);
    expect(isDatabaseUnlocked(dir)).toBe(true);
  });
});

describe("assertDatabaseUnlocked", () => {
  it("throws DatabaseLockedError when locked", () => {
    const { keyfile } = createKeyfile("p", FAST);
    writeKeyfile(keyfile, dir);
    expect(() => assertDatabaseUnlocked(dir)).toThrow(DatabaseLockedError);
  });

  it("does not throw for an unencrypted directory", () => {
    expect(() => assertDatabaseUnlocked(dir)).not.toThrow();
  });
});

describe("databaseLockedHelp", () => {
  it("mentions ATTACHE_PASSPHRASE and recovery caveat", () => {
    const help = databaseLockedHelp();
    expect(help).toContain("ATTACHE_PASSPHRASE");
    expect(help.toLowerCase()).toContain("lost passphrase");
  });
});

describe("unlockDatabaseWithPassphrase", () => {
  it("throws WrongPassphraseError on a bad passphrase", () => {
    const { keyfile } = createKeyfile("right", FAST);
    writeKeyfile(keyfile, dir);
    expect(() => unlockDatabaseWithPassphrase("wrong", dir)).toThrow();
  });

  it("is a no-op when there is no keyfile", () => {
    expect(() => unlockDatabaseWithPassphrase("anything", dir)).not.toThrow();
  });
});
