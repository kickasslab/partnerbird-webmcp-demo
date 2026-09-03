"use client";

import { AlertCircle, ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import type { AuthActionState } from "@/app/(auth)/auth-actions";
import { BrandMark } from "@/components/partnerbird/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";

type AuthAction = (
  state: AuthActionState,
  formData: FormData,
) => Promise<AuthActionState>;

export function AuthForm({
  mode,
  action,
  returnTo,
  initialError,
  initialSuccess,
}: {
  mode: "sign-in" | "sign-up";
  action: AuthAction;
  returnTo?: string;
  initialError?: string;
  initialSuccess?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const isSignUp = mode === "sign-up";
  const errorMessage = state?.error ?? initialError;

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] px-4 py-10">
      <section className="w-full max-w-[420px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 text-[var(--ink)] shadow-[var(--shadow-soft)] sm:p-9">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/@darren" className="inline-flex items-center gap-2 text-lg font-bold tracking-[-.035em]">
            <BrandMark className="h-8 w-8" />
            PartnerBird
          </Link>
          <ThemeToggle />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--green)]">
          {isSignUp ? "Create your profile" : "PartnerBird sign in"}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-.05em]">
          {isSignUp ? "Build your PartnerBird" : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          {isSignUp
            ? "Give potential partners a thoughtful first conversation before you join."
            : "Continue your conversation, submit partnership requests, or manage your profile."}
        </p>

        <form
          action={formAction}
          className="mt-7 space-y-4"
        >
          {returnTo ? (
            <input type="hidden" name="returnTo" value={returnTo} />
          ) : null}
          {isSignUp ? (
            <label className="block text-sm font-medium">
              Your name
              <input
                name="name"
                required
                autoComplete="name"
                className="mt-1.5 h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-input)] px-3 text-[var(--ink)] outline-none transition focus:border-[var(--green)]"
                placeholder="Darren"
              />
            </label>
          ) : null}
          <label className="block text-sm font-medium">
            Email address
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1.5 h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-input)] px-3 text-[var(--ink)] outline-none transition focus:border-[var(--green)]"
              placeholder="you@example.com"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              className="mt-1.5 h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-input)] px-3 text-[var(--ink)] outline-none transition focus:border-[var(--green)]"
              placeholder="At least 8 characters"
            />
          </label>
          {errorMessage ? (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] px-3 py-2 text-sm text-[var(--danger-ink)]">
              <AlertCircle className="mt-0.5 flex-none" size={16} />
              <span>{errorMessage}</span>
            </p>
          ) : null}
          {initialSuccess ? (
            <p role="status" className="flex items-start gap-2 rounded-lg border border-[var(--green-border)] bg-[var(--mint)] px-3 py-2 text-sm text-[var(--green-strong)]">
              <CheckCircle2 className="mt-0.5 flex-none" size={16} />
              <span>{initialSuccess}</span>
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--green)] px-4 font-semibold text-white transition hover:bg-[var(--green-hover)] disabled:cursor-wait disabled:opacity-70"
          >
            {pending ? <LoaderCircle className="animate-spin" size={18} /> : null}
            {isSignUp ? "Create my PartnerBird" : "Sign in"}
            {!pending ? <ArrowRight size={17} /> : null}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          {isSignUp ? "Already have a profile?" : "New to PartnerBird?"}{" "}
          <Link
            className="font-semibold text-[var(--green-strong)] hover:underline"
            href={`${isSignUp ? "/login" : "/signup"}${
              returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""
            }`}
          >
            {isSignUp ? "Sign in" : "Create yours"}
          </Link>
        </p>
      </section>
    </main>
  );
}
