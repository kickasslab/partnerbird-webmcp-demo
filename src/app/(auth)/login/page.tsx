import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { safeInternalReturnTo } from "@/lib/safe-return-to";

import { signInWithEmail } from "../auth-actions";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : params.returnTo;
  const returnTo = safeInternalReturnTo(requested, "/app");

  return (
    <AuthForm
      mode="sign-in"
      action={signInWithEmail}
      returnTo={returnTo}
      initialSuccess={
        first(params.verified) === "1"
          ? "Email verified. You can sign in now."
          : undefined
      }
    />
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
