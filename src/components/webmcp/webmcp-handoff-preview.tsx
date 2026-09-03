"use client";

import { ArrowRight, Bot, CheckCircle2, Clock3, LoaderCircle, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type HandoffPreviewProps = {
  token: string;
  target: { username: string; displayName: string };
  handoff: {
    personName: string;
    companyName: string;
    companyDescription: string;
    partnershipGoal: string;
    contextSummary: string | null;
    expiresAt: string;
  };
  viewer: { authenticated: boolean; verified: boolean; email?: string };
};

export function WebMCPHandoffPreview({ token, target, handoff, viewer }: HandoffPreviewProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const returnTo = `/agent/handoff/${token}`;

  async function activate() {
    if (pending || !viewer.verified) return;
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/agent/handoffs/${encodeURIComponent(token)}/activate`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json() as { ok?: boolean; error?: { message?: string } };
      if (!response.ok || !result.ok) {
        throw new Error(result.error?.message ?? "PartnerBird could not activate this handoff.");
      }
      router.refresh();
    } catch (activationError) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : "PartnerBird could not activate this handoff.",
      );
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--canvas)] px-4 py-10 text-[var(--ink)]" data-testid="webmcp-handoff-preview">
      <section className="mx-auto max-w-3xl rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-9">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[var(--green-strong)]">
              <Bot size={16} /> WebMCP handoff
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-.045em] sm:text-4xl">
              Continue with {target.displayName}’s PartnerBird
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              PartnerBird validated this short-lived handoff. Nothing here has called the PartnerBird Agent or used AI credits.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--green-border)] bg-[var(--mint)] px-3 py-1.5 text-xs font-semibold text-[var(--green-strong)]">
            <Clock3 size={14} /> Expires {formatExpiry(handoff.expiresAt)}
          </span>
        </div>

        {viewer.verified ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2" data-testid="webmcp-handoff-context">
            <ContextCard label="You" value={`${handoff.personName} · ${handoff.companyName}`} />
            <ContextCard label="Target" value={`${target.displayName} · @${target.username}`} />
            <ContextCard label="What your company does" value={handoff.companyDescription} />
            <ContextCard label="Partnership goal" value={handoff.partnershipGoal} />
            {handoff.contextSummary ? (
              <div className="sm:col-span-2">
                <ContextCard label="Context prepared before handoff" value={handoff.contextSummary} />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface-softer)] p-5" data-testid="webmcp-handoff-auth-gate">
            <p className="flex items-center gap-2 font-bold"><LockKeyhole size={17} /> Use the existing PartnerBird sign-in flow</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Sign in or create an account, verify your email as usual, and PartnerBird will return you to this same handoff. The transferred context stays hidden until then.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link className="rounded-xl bg-[var(--green)] px-4 py-2.5 text-sm font-bold text-white" href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
                Sign in to continue
              </Link>
              <Link className="rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-sm font-bold" href={`/signup?returnTo=${encodeURIComponent(returnTo)}`}>
                Create an account
              </Link>
              {viewer.authenticated && viewer.email ? (
                <Link className="rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-sm font-bold" href={`/verify-email?email=${encodeURIComponent(viewer.email)}&returnTo=${encodeURIComponent(returnTo)}`}>
                  Verify email
                </Link>
              ) : null}
            </div>
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-[var(--green-border)] bg-[var(--mint)] p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-[var(--green-strong)]">
            <CheckCircle2 size={17} /> Explicit activation boundary
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            AI usage starts only after you choose the button below. From that point, the existing PartnerBird Agent provider, credit accounting, safety checks, and request workflow apply.
          </p>
          <button
            className="mt-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--green)] px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!viewer.verified || pending}
            onClick={activate}
            type="button"
          >
            {pending ? <LoaderCircle className="animate-spin" size={18} /> : null}
            {pending ? "Starting evaluation…" : "Evaluate with PartnerBird Agent"}
            {!pending ? <ArrowRight size={18} /> : null}
          </button>
          {error ? <p className="mt-3 text-sm text-[var(--danger-ink)]" role="alert">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}

function ContextCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="h-full rounded-2xl border border-[var(--border)] bg-[var(--surface-softer)] p-4">
      <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{value}</p>
    </section>
  );
}

function formatExpiry(value: string) {
  return `${new Date(value).toISOString().slice(11, 16)} UTC`;
}
