import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { createKeyfile, writeKeyfile, type ScryptParams } from "./keyring.js";
import { encryptPlaintextDatabase, MigrationError } from "./migrate.js";
import { KeyfileError } from "./keyring.js";

const FAST: ScryptParams = { N: 1024, r: 8, p: 1, keylen: 32 };

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "attache-migrate-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Seed a plaintext DB with a recognizable row. */
function seedPlaintext(): void {
  const db = openDatabase(dir);
  db.exec("CREATE TABLE probe(x)");
  db.prepare("INSERT INTO probe VALUES ('migrate-me-1234')").run();
  db.close();
}

describe("encryptPlaintextDatabase", () => {
  it("encrypts the file, preserves data, and leaves a plaintext backup", () => {
    seedPlaintext();
    const { keyfile, dek } = createKeyfile("new-pass", FAST);

    encryptPlaintextDatabase(dir, dek);
    writeKeyfile(keyfile, dir); // caller writes keyfile after success

    const dbPath = join(dir, "attache.db");
    const bytes = readFileSync(dbPath);
    // No plaintext header, and the secret string is gone from the ciphertext.
    expect(bytes.subarray(0, 15).toString("latin1")).not.toBe("SQLite format 3");
    expect(bytes.includes(Buffer.from("migrate-me-1234"))).toBe(false);

    // Backup exists and is still plaintext.
    const backup = readFileSync(join(dir, "attache.db.plaintext.bak"));
    expect(backup.subarray(0, 15).toString("latin1")).toBe("SQLite format 3");

    // Data reads back through the encrypted open path.
    const db = openDatabase(dir, { passphrase: "new-pass" });
    const row = db.prepare("SELECT x FROM probe").get() as { x: string };
    expect(row.x).toBe("migrate-me-1234");
    db.close();
  });

  // Negative space: refuse if a keyfile already exists (already encrypted).
  it("throws KeyfileError when a keyfile already exists", () => {
    seedPlaintext();
    const { keyfile, dek } = createKeyfile("p", FAST);
    writeKeyfile(keyfile, dir);
    expect(() => encryptPlaintextDatabase(dir, dek)).toThrow(KeyfileError);
  });

  // Negative space: refuse if there is no database to migrate.
  it("throws MigrationError when no plaintext database exists", () => {
    const { dek } = createKeyfile("p", FAST);
    expect(() => encryptPlaintextDatabase(dir, dek)).toThrow(MigrationError);
  });

  // Negative space: reject an incorrectly sized key.
  it("throws MigrationError on a wrong-size DEK", () => {
    seedPlaintext();
    expect(() => encryptPlaintextDatabase(dir, Buffer.alloc(16))).toThrow(MigrationError);
  });

  it("does not leave a temp file behind after success", () => {
    seedPlaintext();
    const { dek } = createKeyfile("p", FAST);
    encryptPlaintextDatabase(dir, dek);
    expect(existsSync(join(dir, "attache.db.enc.tmp"))).toBe(false);
  });
});
