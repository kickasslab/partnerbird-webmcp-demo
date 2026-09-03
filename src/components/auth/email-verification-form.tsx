"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  MailCheck,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import {
  resendEmailVerificationCode,
  verifyEmailCode,
} from "@/app/(auth)/auth-actions";
import { BrandMark } from "@/components/partnerbird/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";

export function EmailVerificationForm({
  email,
  returnTo,
}: {
  email: string;
  returnTo: string;
}) {
  const [verifyState, verifyAction, verifying] = useActionState(
    verifyEmailCode,
    null,
  );
  const [resendState, resendAction, resending] = useActionState(
    resendEmailVerificationCode,
    null,
  );
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

        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--mint)] text-[var(--green-strong)]">
          <MailCheck size={22} />
        </span>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[.14em] text-[var(--green)]">
          Verify your email
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-.05em]">
          Check your inbox
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Enter the verification code Neon Auth sent to <strong className="text-[var(--ink-soft)]">{email}</strong>. Codes expire after 15 minutes.
        </p>

        <form action={verifyAction} className="mt-7 space-y-4">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="block text-sm font-medium">
            Verification code
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]+"
              maxLength={19}
              className="mt-1.5 h-12 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-input)] px-3 text-center text-lg font-semibold tracking-[.22em] text-[var(--ink)] outline-none transition focus:border-[var(--green)]"
              placeholder="000000"
              aria-describedby="verification-help"
            />
          </label>
          <p id="verification-help" className="text-[11px] leading-5 text-[var(--muted)]">
            The code confirms you own this address before PartnerBird creates an authenticated session.
          </p>

          {verifyState?.error ? (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] px-3 py-2 text-sm text-[var(--danger-ink)]">
              <AlertCircle className="mt-0.5 flex-none" size={16} />
              <span>{verifyState.error}</span>
            </p>
          ) : null}

          <button
            type="submit"
            disabled={verifying || resending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--green)] px-4 font-semibold text-white transition hover:bg-[var(--green-hover)] disabled:cursor-wait disabled:opacity-70"
          >
            {verifying ? <LoaderCircle className="animate-spin" size={18} /> : null}
            Verify and continue
            {!verifying ? <ArrowRight size={17} /> : null}
          </button>
        </form>

        <form action={resendAction} className="mt-3">
          <input type="hidden" name="email" value={email} />
          <button
            type="submit"
            disabled={verifying || resending}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-input)] px-4 text-sm font-semibold transition hover:border-[var(--green-border)] disabled:cursor-wait disabled:opacity-70"
          >
            {resending ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <RefreshCw size={15} />
            )}
            Send a new code
          </button>
        </form>

        {resendState?.error ? (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] px-3 py-2 text-sm text-[var(--danger-ink)]">
            <AlertCircle className="mt-0.5 flex-none" size={16} />
            <span>{resendState.error}</span>
          </p>
        ) : null}
        {resendState?.success ? (
          <p role="status" className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--green-border)] bg-[var(--mint)] px-3 py-2 text-sm text-[var(--green-strong)]">
            <CheckCircle2 className="mt-0.5 flex-none" size={16} />
            <span>{resendState.success}</span>
          </p>
        ) : null}

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          Wrong email?{" "}
          <Link className="font-semibold text-[var(--green-strong)] hover:underline" href="/signup">
            Start again
          </Link>
        </p>
      </section>
    </main>
  );
}
