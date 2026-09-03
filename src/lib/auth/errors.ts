export type AuthFlow = "sign-in" | "sign-up" | "verify-email";

type AuthErrorLike = {
  code?: unknown;
  error?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function authErrorText(error: unknown): string {
  if (typeof error === "string") return error.toLowerCase();
  if (!error || typeof error !== "object") return "";

  const candidate = error as AuthErrorLike;
  return [
    candidate.code,
    candidate.error,
    candidate.message,
    candidate.status,
    candidate.statusCode,
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(" ")
    .toLowerCase();
}

function containsAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

export function isEmailVerificationError(error: unknown): boolean {
  return containsAny(authErrorText(error), [
    "email_not_verified",
    "email not verified",
    "verify your email",
  ]);
}

export function getAuthErrorMessage(error: unknown, flow: AuthFlow): string {
  const value = authErrorText(error);

  if (
    containsAny(value, [
      "user_already_exists",
      "already registered",
      "already exists",
      "duplicate key",
      "unique constraint",
    ])
  ) {
    return "An account with this email already exists. Sign in instead.";
  }

  if (isEmailVerificationError(error)) {
    return "Verify your email before signing in. We’ve sent you a new verification code.";
  }

  if (
    containsAny(value, [
      "invalid_email_or_password",
      "invalid email or password",
      "invalid password",
      "user not found",
      "user_not_found",
    ])
  ) {
    return "That email and password combination isn’t correct. Check both fields and try again.";
  }

  if (
    containsAny(value, [
      "invalid_otp",
      "otp_expired",
      "invalid otp",
      "expired otp",
      "invalid code",
      "expired code",
    ])
  ) {
    return "That verification code is invalid or has expired. Check the code or request a new one.";
  }

  if (
    containsAny(value, [
      "invalid origin",
      "invalid_origin",
      "invalid domain",
      "invalid_domain",
      "invalid callback",
    ])
  ) {
    return "This sign-in address isn’t approved yet. Please contact support and mention the authentication domain.";
  }

  if (
    containsAny(value, ["too_many_requests", "rate limit", "429", "too many"])
  ) {
    return "Too many attempts were made. Wait a moment, then try again.";
  }

  if (
    containsAny(value, [
      "network",
      "fetch failed",
      "service unavailable",
      "upstream",
      "timeout",
    ])
  ) {
    return "Authentication is temporarily unavailable. Check your connection and try again.";
  }

  if (flow === "sign-up") {
    return "We couldn’t create your account. Check your details and try again.";
  }
  if (flow === "verify-email") {
    return "We couldn’t verify that code. Check it carefully or request a new one.";
  }
  return "We couldn’t sign you in. Check your details and try again.";
}
