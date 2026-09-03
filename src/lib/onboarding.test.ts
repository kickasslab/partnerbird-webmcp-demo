import { describe, expect, it } from "vitest";

import {
  getOnboardingStarterIssue,
  ONBOARDING_STARTER_BIO,
  ONBOARDING_STARTER_HEADLINE,
} from "./onboarding";

describe("onboarding starter text", () => {
  it("points to the starter headline before the starter introduction", () => {
    expect(
      getOnboardingStarterIssue({
        headline: ONBOARDING_STARTER_HEADLINE,
        bio: ONBOARDING_STARTER_BIO,
      }),
    ).toEqual({
      error: "Replace the starter headline with a description of what you do.",
      field: "headline",
      step: 1,
    });
  });

  it("points to the starter introduction when the headline was replaced", () => {
    expect(
      getOnboardingStarterIssue({
        headline: "Partnership strategy for technical teams",
        bio: ONBOARDING_STARTER_BIO,
      }),
    ).toMatchObject({ field: "bio", step: 1 });
  });

  it("accepts an original headline and introduction", () => {
    expect(
      getOnboardingStarterIssue({
        headline: "Partnership strategy for technical teams",
        bio: "I help technical teams build useful, durable collaborations.",
      }),
    ).toBeNull();
  });
});
