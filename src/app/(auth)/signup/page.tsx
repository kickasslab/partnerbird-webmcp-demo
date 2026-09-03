import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { safeInternalReturnTo } from "@/lib/safe-return-to";

import { signUpWithEmail } from "../auth-actions";

export const metadata: Metadata = { title: "Create your PartnerBird" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : params.returnTo;
  const returnTo = safeInternalReturnTo(requested, "/app/onboarding");

  return (
    <AuthForm
      mode="sign-up"
      action={signUpWithEmail}
      returnTo={returnTo}
    />
  );
}
