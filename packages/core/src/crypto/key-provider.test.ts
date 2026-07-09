import { describe, expect, it } from "vitest";
import { createKeyfile, type ScryptParams } from "./keyring.js";
import {
  DatabaseLockedError,
  resolveKey,
} from "./key-provider.js";

const FAST: ScryptParams = { N: 1024, r: 8, p: 1, keylen: 32 };

/** Build a keyfile + its DEK for tests. */
function fixture(passphrase = "pass") {
  return createKeyfile(passphrase, FAST);
}

describe("resolveKey — no keyfile (unencrypted)", () => {
  it("returns a null key with source 'none'", () => {
    expect(resolveKey(null, { env: {} })).toEqual({ dek: null, source: "none" });
  });

  it("still honours an explicit DEK even without a keyfile", () => {
    const dek = Buffer.alloc(32, 7);
    expect(resolveKey(null, { dek, env: {} })).toEqual({ dek, source: "explicit-dek" });
  });
});

describe("resolveKey — precedence", () => {
  it("explicit DEK beats everything", () => {
    const { keyfile } = fixture();
    const dek = Buffer.alloc(32, 1);
    const r = resolveKey(keyfile, {
      dek,
      passphrase: "pass",
      env: { ATTACHE_DEK: "ab".repeat(32), ATTACHE_PASSPHRASE: "pass" },
    });
    expect(r.source).toBe("explicit-dek");
    expect(r.dek).toBe(dek);
  });

  it("explicit passphrase beats env sources", () => {
    const { keyfile, dek } = fixture("real-pass");
    const r = resolveKey(keyfile, {
      passphrase: "real-pass",
      env: { ATTACHE_PASSPHRASE: "wrong" },
    });
    expect(r.source).toBe("explicit-passphrase");
    expect(r.dek?.equals(dek)).toBe(true);
  });

  it("env DEK beats env passphrase", () => {
    const { keyfile } = fixture();
    const rawDek = "cd".repeat(32);
    const r = resolveKey(keyfile, {
      env: { ATTACHE_DEK: rawDek, ATTACHE_PASSPHRASE: "pass" },
    });
    expect(r.source).toBe("env-dek");
    expect(r.dek?.toString("hex")).toBe(rawDek);
  });

  it("env passphrase unwraps the DEK when no env DEK present", () => {
    const { keyfile, dek } = fixture("s3cret");
    const r = resolveKey(keyfile, { env: { ATTACHE_PASSPHRASE: "s3cret" } });
    expect(r.source).toBe("env-passphrase");
    expect(r.dek?.equals(dek)).toBe(true);
  });

  it("falls back to the interactive prompt", () => {
    const { keyfile, dek } = fixture("typed");
    const r = resolveKey(keyfile, { env: {}, prompt: () => "typed" });
    expect(r.source).toBe("prompt");
    expect(r.dek?.equals(dek)).toBe(true);
  });
});

describe("resolveKey — negative space", () => {
  it("throws DatabaseLockedError when encrypted and no source available", () => {
    const { keyfile } = fixture();
    expect(() => resolveKey(keyfile, { env: {} })).toThrow(DatabaseLockedError);
  });

  it("throws DatabaseLockedError when the prompt is cancelled (null)", () => {
    const { keyfile } = fixture();
    expect(() => resolveKey(keyfile, { env: {}, prompt: () => null })).toThrow(
      DatabaseLockedError,
    );
  });

  it("rejects a malformed ATTACHE_DEK (wrong length)", () => {
    const { keyfile } = fixture();
    expect(() => resolveKey(keyfile, { env: { ATTACHE_DEK: "abcd" } })).toThrow(
      DatabaseLockedError,
    );
  });

  it("rejects a non-hex ATTACHE_DEK", () => {
    const { keyfile } = fixture();
    expect(() =>
      resolveKey(keyfile, { env: { ATTACHE_DEK: "zz".repeat(32) } }),
    ).toThrow(DatabaseLockedError);
  });

  it("rejects an explicit DEK of the wrong size", () => {
    const { keyfile } = fixture();
    expect(() => resolveKey(keyfile, { dek: Buffer.alloc(16) })).toThrow(
      DatabaseLockedError,
    );
  });

  it("propagates WrongPassphraseError semantics via env passphrase", () => {
    const { keyfile } = fixture("right");
    // Wrong passphrase surfaces as an unlock failure (WrongPassphraseError).
    expect(() => resolveKey(keyfile, { env: { ATTACHE_PASSPHRASE: "nope" } })).toThrow();
  });
});
