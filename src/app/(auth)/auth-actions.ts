"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";

import { safeInternalReturnTo } from "@/lib/safe-return-to";
import {
  getAuthErrorMessage,
  isEmailVerificationError,
} from "@/lib/auth/errors";
import { auth } from "@/lib/auth/server";
import { neonSql } from "@/server/db/client";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { hashVisitorIp } from "@/server/security/visitor-session";

export type AuthActionState = { error?: string } | null;
export type VerificationActionState =
  | { error?: string; success?: string }
  | null;

const emailSchema = z.string().trim().toLowerCase().email();

function parseEmail(value: FormDataEntryValue | null) {
  return emailSchema.safeParse(String(value ?? ""));
}

function verificationUrl(email: string, returnTo: string) {
  const query = new URLSearchParams({ email, returnTo });
  return `/verify-email?${query.toString()}`;
}

async function emailIsRegistered(email: string): Promise<boolean> {
  const [row] = await neonSql`
    SELECT EXISTS (
      SELECT 1
      FROM neon_auth."user"
      WHERE lower(email) = ${email}
    ) AS "registered"
  `;

  return row?.registered === true;
}

async function consumeSignUpCheckLimit() {
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-real-ip") ||
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  return consumeRateLimit({
    keyHash: hashVisitorIp(ip),
    action: "auth_signup_check_ip",
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
}

export async function signInWithEmail(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsedEmail = parseEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const returnTo = safeInternalReturnTo(formData.get("returnTo"), "/app");

  if (!parsedEmail.success || !password) {
    return { error: "Enter your email address and password." };
  }

  const email = parsedEmail.data;
  let needsVerification = false;

  try {
    const { error } = await auth.signIn.email({ email, password });
    if (error) {
      if (isEmailVerificationError(error)) {
        needsVerification = true;
      } else {
        return { error: getAuthErrorMessage(error, "sign-in") };
      }
    }
  } catch (error) {
    return { error: getAuthErrorMessage(error, "sign-in") };
  }

  if (needsVerification) redirect(verificationUrl(email, returnTo));
  redirect(returnTo);
}

export async function signUpWithEmail(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const parsedEmail = parseEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const returnTo = safeInternalReturnTo(
    formData.get("returnTo"),
    "/app/onboarding",
  );

  if (!name || !parsedEmail.success || !password) {
    return { error: "Complete each field to create your PartnerBird." };
  }

  if (password.length < 8) {
    return { error: "Use a password with at least eight characters." };
  }

  const email = parsedEmail.data;

  try {
    const limit = await consumeSignUpCheckLimit();
    if (!limit.allowed) {
      return {
        error:
          "Too many registration attempts were made. Wait a while, then try again.",
      };
    }
    if (await emailIsRegistered(email)) {
      return {
        error:
          "An account with this email already exists. Sign in instead.",
      };
    }
  } catch {
    return {
      error:
        "We couldn’t confirm whether that email is available. Please try again.",
    };
  }

  let alreadyVerified = false;
  try {
    const { data, error } = await auth.signUp.email({ name, email, password });
    if (error) {
      return { error: getAuthErrorMessage(error, "sign-up") };
    }
    alreadyVerified = data?.user.emailVerified === true;
  } catch (error) {
    return { error: getAuthErrorMessage(error, "sign-up") };
  }

  if (alreadyVerified) redirect(returnTo);
  redirect(verificationUrl(email, returnTo));
}

export async function verifyEmailCode(
  _previousState: VerificationActionState,
  formData: FormData,
): Promise<VerificationActionState> {
  const parsedEmail = parseEmail(formData.get("email"));
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  const returnTo = safeInternalReturnTo(
    formData.get("returnTo"),
    "/app/onboarding",
  );

  if (!parsedEmail.success) {
    return { error: "Return to sign up and enter a valid email address." };
  }
  if (!/^\d{4,10}$/.test(code)) {
    return { error: "Enter the numeric verification code from your email." };
  }

  let signedIn = false;
  try {
    const { data, error } = await auth.emailOtp.verifyEmail({
      email: parsedEmail.data,
      otp: code,
    });
    if (error) {
      return { error: getAuthErrorMessage(error, "verify-email") };
    }
    signedIn = Boolean(data?.token);
  } catch (error) {
    return { error: getAuthErrorMessage(error, "verify-email") };
  }

  if (signedIn) redirect(returnTo);

  const query = new URLSearchParams({ verified: "1", returnTo });
  redirect(`/login?${query.toString()}`);
}

export async function resendEmailVerificationCode(
  _previousState: VerificationActionState,
  formData: FormData,
): Promise<VerificationActionState> {
  const parsedEmail = parseEmail(formData.get("email"));
  if (!parsedEmail.success) {
    return { error: "Return to sign up and enter a valid email address." };
  }

  try {
    const { error } = await auth.emailOtp.sendVerificationOtp({
      email: parsedEmail.data,
      type: "email-verification",
    });
    if (error) {
      return { error: getAuthErrorMessage(error, "verify-email") };
    }
  } catch (error) {
    return { error: getAuthErrorMessage(error, "verify-email") };
  }

  return {
    success: "A fresh verification code is on its way. Check your inbox and spam folder.",
  };
}

export async function signOut() {
  await auth.signOut();
  redirect("/login");
}
