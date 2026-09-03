import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmailVerificationForm } from "@/components/auth/email-verification-form";
import { safeInternalReturnTo } from "@/lib/safe-return-to";

export const metadata: Metadata = { title: "Verify your email" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const email = first(params.email)?.trim().toLowerCase();
  if (!email || !email.includes("@")) redirect("/signup");

  return (
    <EmailVerificationForm
      email={email}
      returnTo={safeInternalReturnTo(params.returnTo, "/app/onboarding")}
    />
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
