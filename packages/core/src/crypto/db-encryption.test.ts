import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { DatabaseLockedError } from "./key-provider.js";
import {
  createKeyfile,
  writeKeyfile,
  WrongPassphraseError,
  type ScryptParams,
} from "./keyring.js";

/**
 * Integration: openDatabase honours the VS-8 keyfile + KeyProvider (ADR-011).
 * Uses fast scrypt params so the suite stays quick.
 */

const FAST: ScryptParams = { N: 1024, r: 8, p: 1, keylen: 32 };

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "attache-dbenc-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Write a keyfile for `passphrase` into `dir`. */
function initVault(passphrase: string): void {
  const { keyfile } = createKeyfile(passphrase, FAST);
  writeKeyfile(keyfile, dir);
}

describe("openDatabase — unencrypted (no keyfile)", () => {
  it("opens plaintext and persists a plaintext SQLite header", () => {
    const db = openDatabase(dir);
    db.exec("CREATE TABLE probe(x)");
    db.prepare("INSERT INTO probe VALUES (1)").run();
    db.close();

    const header = readFileSync(join(dir, "attache.db")).subarray(0, 15).toString("latin1");
    expect(header).toBe("SQLite format 3");
  });
});

describe("openDatabase — encrypted (keyfile present)", () => {
  it("writes an encrypted file (no plaintext SQLite header)", () => {
    initVault("cfo-pass");
    const db = openDatabase(dir, { passphrase: "cfo-pass" });
    db.exec("CREATE TABLE probe(secret)");
    db.prepare("INSERT INTO probe VALUES ('balance-4200')").run();
    db.close();

    const bytes = readFileSync(join(dir, "attache.db"));
    expect(bytes.subarray(0, 15).toString("latin1")).not.toBe("SQLite format 3");
    // The plaintext secret must not appear anywhere in the file.
    expect(bytes.includes(Buffer.from("balance-4200"))).toBe(false);
  });

  it("round-trips data across close/reopen with the right passphrase", () => {
    initVault("cfo-pass");
    const first = openDatabase(dir, { passphrase: "cfo-pass" });
    first.exec("CREATE TABLE probe(x)");
    first.prepare("INSERT INTO probe VALUES (7)").run();
    first.close();

    const second = openDatabase(dir, { passphrase: "cfo-pass" });
    const row = second.prepare("SELECT x FROM probe").get() as { x: number };
    expect(row.x).toBe(7);
    second.close();
  });

  it("unlocks via ATTACHE_PASSPHRASE env", () => {
    initVault("env-pass");
    const write = openDatabase(dir, { env: { ATTACHE_PASSPHRASE: "env-pass" } });
    write.exec("CREATE TABLE probe(x)");
    write.prepare("INSERT INTO probe VALUES (5)").run();
    write.close();

    // A second open using only the env passphrase must read the ciphered data.
    const read = openDatabase(dir, { env: { ATTACHE_PASSPHRASE: "env-pass" } });
    expect((read.prepare("SELECT x FROM probe").get() as { x: number }).x).toBe(5);
    read.close();
  });

  // Negative space: wrong passphrase must not open the DB.
  it("throws WrongPassphraseError with the wrong passphrase", () => {
    initVault("correct");
    expect(() => openDatabase(dir, { passphrase: "incorrect" })).toThrow(
      WrongPassphraseError,
    );
  });

  // Negative space: encrypted DB with no key source is locked, not silently plaintext.
  it("throws DatabaseLockedError when no key source is available", () => {
    initVault("correct");
    expect(() => openDatabase(dir, { env: {} })).toThrow(DatabaseLockedError);
  });

  // Negative space: a wrong key cannot read a DB created with a different key.
  it("cannot read data written under a different key", () => {
    initVault("first-pass");
    const db = openDatabase(dir, { passphrase: "first-pass" });
    db.exec("CREATE TABLE probe(x)");
    db.prepare("INSERT INTO probe VALUES (1)").run();
    db.close();

    // Simulate a stale keyfile pointing at a different DEK by rewriting it.
    const { keyfile } = createKeyfile("second-pass", FAST);
    writeKeyfile(keyfile, dir);
    expect(() => {
      const bad = openDatabase(dir, { passphrase: "second-pass" });
      bad.prepare("SELECT x FROM probe").get();
    }).toThrow();
  });
});
