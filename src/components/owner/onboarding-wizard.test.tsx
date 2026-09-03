// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/app/actions", () => ({
  completeOnboardingAction: vi.fn(),
}));

import {
  ONBOARDING_STARTER_BIO,
  ONBOARDING_STARTER_HEADLINE,
} from "@/lib/onboarding";

import { OnboardingWizard } from "./onboarding-wizard";

afterEach(cleanup);

describe("OnboardingWizard", () => {
  const profile = {
    displayName: "New PartnerBird owner",
    handle: "new-owner",
    headline: ONBOARDING_STARTER_HEADLINE,
    bio: ONBOARDING_STARTER_BIO,
  };

  it("stops on the introduction step until starter text is replaced", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard profile={profile} />);

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "What do you do?" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Replace the starter headline",
    );
    expect(
      screen.getByRole("heading", { name: "What do you do?" }),
    ).toBeInTheDocument();
  });

  it("describes the last step as a review, not a completed onboarding", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard profile={profile} />);

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.clear(screen.getByLabelText("Headline"));
    await user.type(
      screen.getByLabelText("Headline"),
      "Partnership strategy for technical teams",
    );
    await user.clear(screen.getByLabelText("Short introduction"));
    await user.type(
      screen.getByLabelText("Short introduction"),
      "I help technical teams build useful, durable collaborations.",
    );

    for (let step = 1; step < 7; step += 1) {
      await user.click(screen.getByRole("button", { name: "Continue" }));
    }

    expect(
      screen.getByRole("heading", { name: "Review before publishing" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/onboarding complete/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Publish PartnerBird" }),
    ).toBeEnabled();
  });
});
