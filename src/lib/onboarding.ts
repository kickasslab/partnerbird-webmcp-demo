export const ONBOARDING_STARTER_HEADLINE =
  "Tell potential partners what you do";

export const ONBOARDING_STARTER_BIO =
  "Add a short introduction so PartnerBird can represent you well.";

export type OnboardingFieldName =
  | "displayName"
  | "handle"
  | "headline"
  | "bio"
  | "interests"
  | "capabilities"
  | "projects"
  | "thingsToAvoid"
  | "activations";

export type OnboardingStarterIssue = {
  error: string;
  field: "headline" | "bio";
  step: 1;
};

export function getOnboardingStarterIssue({
  headline,
  bio,
}: {
  headline: string;
  bio: string;
}): OnboardingStarterIssue | null {
  if (headline.trim() === ONBOARDING_STARTER_HEADLINE) {
    return {
      error: "Replace the starter headline with a description of what you do.",
      field: "headline",
      step: 1,
    };
  }

  if (bio.trim() === ONBOARDING_STARTER_BIO) {
    return {
      error: "Replace the starter introduction with your own introduction.",
      field: "bio",
      step: 1,
    };
  }

  return null;
}
