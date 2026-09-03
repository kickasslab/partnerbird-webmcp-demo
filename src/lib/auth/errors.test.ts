import { describe, expect, it } from "vitest";

import {
  getAuthErrorMessage,
  isEmailVerificationError,
} from "./errors";

describe("authentication error messages", () => {
  it("recognizes Neon Auth email verification errors", () => {
    expect(isEmailVerificationError({ code: "EMAIL_NOT_VERIFIED" })).toBe(true);
    expect(
      getAuthErrorMessage({ code: "EMAIL_NOT_VERIFIED" }, "sign-in"),
    ).toContain("Verify your email");
  });

  it("turns duplicate registrations into a useful next step", () => {
    expect(
      getAuthErrorMessage({ code: "USER_ALREADY_EXISTS" }, "sign-up"),
    ).toBe(
      "An account with this email already exists. Sign in instead.",
    );
  });

  it("does not expose unknown upstream messages", () => {
    expect(
      getAuthErrorMessage({ message: "sensitive provider detail" }, "sign-in"),
    ).toBe(
      "We couldn’t sign you in. Check your details and try again.",
    );
  });
});
