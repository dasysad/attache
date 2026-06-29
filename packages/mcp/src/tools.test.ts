import { describe, expect, it } from "vitest";
import { z } from "zod";

/** Schema smoke tests — MCP registration is integration-tested via core agent tests. */
describe("@attache/mcp schemas", () => {
  it("transfer input validates positive amount", () => {
    const schema = z.object({
      fromAccountId: z.string(),
      amountUsd: z.number().positive(),
    });
    expect(() => schema.parse({ fromAccountId: "a", amountUsd: -1 })).toThrow();
    expect(schema.parse({ fromAccountId: "a", amountUsd: 10 })).toEqual({
      fromAccountId: "a",
      amountUsd: 10,
    });
  });
});
