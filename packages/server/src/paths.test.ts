import { describe, expect, it } from "vitest";
import { resolvePublicRoot } from "./paths.js";

describe("resolvePublicRoot", () => {
  it("prefers ATTACHE_PUBLIC_ROOT when set", () => {
    const prev = process.env.ATTACHE_PUBLIC_ROOT;
    process.env.ATTACHE_PUBLIC_ROOT = "/bundle/public";
    try {
      expect(resolvePublicRoot("file:///any/dist/index.js")).toBe("/bundle/public");
    } finally {
      if (prev === undefined) delete process.env.ATTACHE_PUBLIC_ROOT;
      else process.env.ATTACHE_PUBLIC_ROOT = prev;
    }
  });

  it("defaults to sibling public/ of the module file", () => {
    const prev = process.env.ATTACHE_PUBLIC_ROOT;
    delete process.env.ATTACHE_PUBLIC_ROOT;
    try {
      expect(resolvePublicRoot("file:///app/packages/server/dist/index.js")).toBe(
        "/app/packages/server/public",
      );
    } finally {
      if (prev !== undefined) process.env.ATTACHE_PUBLIC_ROOT = prev;
    }
  });

  it("ignores blank ATTACHE_PUBLIC_ROOT", () => {
    const prev = process.env.ATTACHE_PUBLIC_ROOT;
    process.env.ATTACHE_PUBLIC_ROOT = "   ";
    try {
      expect(resolvePublicRoot("file:///opt/attache/dist/index.js")).toBe("/opt/attache/public");
    } finally {
      if (prev === undefined) delete process.env.ATTACHE_PUBLIC_ROOT;
      else process.env.ATTACHE_PUBLIC_ROOT = prev;
    }
  });
});
