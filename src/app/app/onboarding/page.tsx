import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/owner/onboarding-wizard";
import { getOrClaimOwnerProfile } from "@/server/profiles/owner";

export const metadata: Metadata = { title: "Set up your PartnerBird" };

export default async function OnboardingPage() {
  const profile = await getOrClaimOwnerProfile();
  if (profile.onboardingComplete) redirect("/app/settings/webmcp");
  return (
    <OnboardingWizard
      profile={{
        displayName: profile.displayName,
        handle: profile.handle,
        headline: profile.headline,
        bio: profile.bio,
      }}
    />
  );
}
