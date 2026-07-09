import { describe, expect, it } from "vitest";
import { mapPlaidApiError, PlaidError, plaidErrorHelp } from "./errors.js";

describe("PlaidError taxonomy", () => {
  it("maps ITEM_LOGIN_REQUIRED to needsRelink", () => {
    const err = mapPlaidApiError({
      response: {
        data: {
          error_code: "ITEM_LOGIN_REQUIRED",
          error_message: "the login details of this item have changed",
        },
      },
    });
    expect(err).toBeInstanceOf(PlaidError);
    expect(err.code).toBe("ITEM_LOGIN_REQUIRED");
    expect(err.needsRelink).toBe(true);
    expect(plaidErrorHelp(err)).toContain("link-token");
  });

  it("maps unknown codes to UNKNOWN", () => {
    const err = mapPlaidApiError({
      response: { data: { error_code: "WEIRD_CODE", error_message: "boom" } },
    });
    expect(err.code).toBe("UNKNOWN");
    expect(err.needsRelink).toBe(false);
  });

  it("marks institution errors as retryable", () => {
    const err = mapPlaidApiError({
      response: {
        data: {
          error_code: "INSTITUTION_DOWN",
          error_message: "try again",
        },
      },
    });
    expect(err.retryable).toBe(true);
  });
});
