import { redirect } from "next/navigation";

import { getOrClaimOwnerProfile } from "@/server/profiles/owner";

export default async function DemoAccountPage() {
  const profile = await getOrClaimOwnerProfile();
  redirect(profile.onboardingComplete ? "/app/settings/webmcp" : "/app/onboarding");
}
