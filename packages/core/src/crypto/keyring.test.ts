import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createKeyfile,
  deriveKek,
  hasKeyfile,
  KeyfileError,
  keyfilePath,
  readKeyfile,
  rewrapDek,
  unwrapDek,
  writeKeyfile,
  WrongPassphraseError,
  type ScryptParams,
} from "./keyring.js";

// Small, fast params for tests — production uses N=2^15.
const FAST: ScryptParams = { N: 1024, r: 8, p: 1, keylen: 32 };

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "attache-keyring-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("deriveKek", () => {
  it("is deterministic for the same passphrase, salt, and params", () => {
    const a = deriveKek("hunter2", "00112233445566778899aabbccddeeff", FAST);
    const b = deriveKek("hunter2", "00112233445566778899aabbccddeeff", FAST);
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBe(32);
  });

  it("differs when the salt differs", () => {
    const a = deriveKek("hunter2", "00".repeat(16), FAST);
    const b = deriveKek("hunter2", "ff".repeat(16), FAST);
    expect(a.equals(b)).toBe(false);
  });

  it("differs when the passphrase differs", () => {
    const salt = "00".repeat(16);
    expect(deriveKek("a", salt, FAST).equals(deriveKek("b", salt, FAST))).toBe(false);
  });

  // Negative space: empty passphrase is rejected before any KDF work.
  it("throws WrongPassphraseError on an empty passphrase", () => {
    expect(() => deriveKek("", "00".repeat(16), FAST)).toThrow(WrongPassphraseError);
  });
});

describe("createKeyfile + unwrapDek", () => {
  it("round-trips: the correct passphrase unwraps the original DEK", () => {
    const { keyfile, dek } = createKeyfile("correct horse", FAST);
    const unwrapped = unwrapDek(keyfile, "correct horse");
    expect(unwrapped.equals(dek)).toBe(true);
    expect(unwrapped.length).toBe(32);
  });

  it("generates a distinct random DEK each time", () => {
    const a = createKeyfile("same-pass", FAST);
    const b = createKeyfile("same-pass", FAST);
    expect(a.dek.equals(b.dek)).toBe(false);
    expect(a.keyfile.salt).not.toBe(b.keyfile.salt);
  });

  // Negative space: wrong passphrase must fail via GCM auth, not return garbage.
  it("throws WrongPassphraseError on an incorrect passphrase", () => {
    const { keyfile } = createKeyfile("correct", FAST);
    expect(() => unwrapDek(keyfile, "wrong")).toThrow(WrongPassphraseError);
  });

  // Negative space: tampering with the wrapped ciphertext must be detected.
  it("throws WrongPassphraseError when the wrapped DEK is tampered", () => {
    const { keyfile } = createKeyfile("correct", FAST);
    const tampered = {
      ...keyfile,
      wrappedDek: { ...keyfile.wrappedDek, ciphertext: "de".repeat(32) },
    };
    expect(() => unwrapDek(tampered, "correct")).toThrow(WrongPassphraseError);
  });

  it("throws WrongPassphraseError when creating with an empty passphrase", () => {
    expect(() => createKeyfile("", FAST)).toThrow(WrongPassphraseError);
  });
});

describe("rewrapDek", () => {
  it("re-wraps the same DEK so the new passphrase yields the original key", () => {
    const { keyfile, dek } = createKeyfile("old-pass", FAST);
    const rewrapped = rewrapDek(dek, "new-pass", FAST);
    expect(unwrapDek(rewrapped, "new-pass").equals(dek)).toBe(true);
    // Old passphrase no longer works against the new keyfile.
    expect(() => unwrapDek(rewrapped, "old-pass")).toThrow(WrongPassphraseError);
    // A fresh salt is used so the two keyfiles are not byte-identical.
    expect(rewrapped.salt).not.toBe(keyfile.salt);
  });

  it("throws KeyfileError if the DEK is not 32 bytes", () => {
    expect(() => rewrapDek(Buffer.alloc(16), "pass", FAST)).toThrow(KeyfileError);
  });

  it("throws WrongPassphraseError on an empty new passphrase", () => {
    const { dek } = createKeyfile("x", FAST);
    expect(() => rewrapDek(dek, "", FAST)).toThrow(WrongPassphraseError);
  });
});

describe("keyfile persistence", () => {
  it("writes then reads back an identical keyfile", () => {
    const { keyfile } = createKeyfile("persist-me", FAST);
    writeKeyfile(keyfile, dir);
    expect(readKeyfile(dir)).toEqual(keyfile);
  });

  it("reports presence via hasKeyfile", () => {
    expect(hasKeyfile(dir)).toBe(false);
    const { keyfile } = createKeyfile("p", FAST);
    writeKeyfile(keyfile, dir);
    expect(hasKeyfile(dir)).toBe(true);
  });

  // Negative space: absent keyfile is null (means "unencrypted DB"), not an error.
  it("returns null when no keyfile exists", () => {
    expect(readKeyfile(dir)).toBeNull();
  });

  // Negative space: malformed JSON is a typed error, and hasKeyfile stays false.
  it("throws KeyfileError on invalid JSON but hasKeyfile is false", () => {
    writeFileSync(keyfilePath(dir), "{ not json");
    expect(() => readKeyfile(dir)).toThrow(KeyfileError);
    expect(hasKeyfile(dir)).toBe(false);
  });

  // Negative space: structurally wrong keyfile (missing fields) is rejected.
  it("throws KeyfileError on a structurally invalid keyfile", () => {
    writeFileSync(keyfilePath(dir), JSON.stringify({ version: 1, kdf: "scrypt" }));
    expect(() => readKeyfile(dir)).toThrow(KeyfileError);
  });
});
