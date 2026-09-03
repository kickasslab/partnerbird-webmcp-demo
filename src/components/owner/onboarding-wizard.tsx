"use client";

import { AlertCircle, ArrowLeft, ArrowRight, Eye, LoaderCircle } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import {
  completeOnboardingAction,
  type OwnerActionState,
} from "@/app/app/actions";
import {
  getOnboardingStarterIssue,
  type OnboardingFieldName,
} from "@/lib/onboarding";

type WizardProfile = {
  displayName: string;
  handle: string;
  headline: string;
  bio: string;
};

const steps = [
  "Who are you?",
  "What do you do?",
  "What are you open to?",
  "What can you offer?",
  "What should PartnerBird know?",
  "What should it avoid?",
  "What can you activate?",
  "Preview your PartnerBird",
];

export function OnboardingWizard({ profile }: { profile: WizardProfile }) {
  const [step, setStep] = useState(0);
  const [state, formAction, pending] = useActionState<
    OwnerActionState,
    FormData
  >(completeOnboardingAction, null);
  const progress = ((step + 1) / steps.length) * 100;
  const formRef = useRef<HTMLFormElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissedActionError, setDismissedActionError] = useState(false);
  const actionError = dismissedActionError ? null : state?.error;
  const errorMessage = clientError ?? actionError;

  function focusField(fieldName: OnboardingFieldName) {
    const focus = () => {
      const field = formRef.current?.elements.namedItem(fieldName);
      if (field instanceof HTMLElement) field.focus();
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(focus);
    } else {
      queueMicrotask(focus);
    }
  }

  function advance() {
    const fields = Array.from(
      formRef.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        `[data-onboarding-step="${step}"] input, [data-onboarding-step="${step}"] textarea`,
      ) ?? [],
    );
    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      invalid.focus();
      return;
    }

    if (step === 1) {
      const headline = formRef.current?.elements.namedItem("headline");
      const bio = formRef.current?.elements.namedItem("bio");
      const starterIssue = getOnboardingStarterIssue({
        headline: headline instanceof HTMLInputElement ? headline.value : "",
        bio: bio instanceof HTMLTextAreaElement ? bio.value : "",
      });
      if (starterIssue) {
        setClientError(starterIssue.error);
        focusField(starterIssue.field);
        return;
      }
    }

    setClientError(null);
    setStep((value) => Math.min(steps.length - 1, value + 1));
  }

  function fixActionError() {
    if (state?.step === undefined) return;
    setStep(state.step);
    if (state.field) focusField(state.field);
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mx-auto max-w-3xl"
      onInput={() => {
        setClientError(null);
        setDismissedActionError(true);
      }}
      onSubmit={() => {
        setClientError(null);
        setDismissedActionError(false);
      }}
    >
      <input type="hidden" name="isOpen" value="on" />
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--green)]">
            Step {step + 1} of {steps.length}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-.045em]">{steps[step]}</h1>
        </div>
        <span className="text-xs text-[var(--muted)]">{Math.round(progress)}%</span>
      </div>
      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-[var(--progress-track)]">
        <div
          className="h-full rounded-full bg-[var(--green)] transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <section className="min-h-[330px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8">
        <div data-onboarding-step="0" className={step === 0 ? "space-y-5" : "hidden"}>
          <label className="block text-sm font-medium">
            Display name
            <input name="displayName" defaultValue={profile.displayName} minLength={2} maxLength={120} required className="mt-2 h-12 w-full rounded-lg border border-[var(--border-strong)] px-3 outline-none focus:border-[var(--green)]" />
          </label>
          <label className="block text-sm font-medium">
            Public handle
            <div className="mt-2 flex h-12 items-center rounded-lg border border-[var(--border-strong)] px-3">
              <span className="text-[var(--muted)]">@</span>
              <input name="handle" defaultValue={profile.handle} minLength={2} maxLength={48} pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?" required className="min-w-0 flex-1 border-0 outline-none" />
            </div>
          </label>
        </div>

        <div data-onboarding-step="1" className={step === 1 ? "space-y-5" : "hidden"}>
          <label className="block text-sm font-medium">
            Headline
            <input name="headline" defaultValue={profile.headline} minLength={3} maxLength={180} required className="mt-2 h-12 w-full rounded-lg border border-[var(--border-strong)] px-3 outline-none focus:border-[var(--green)]" />
          </label>
          <label className="block text-sm font-medium">
            Short introduction
            <textarea name="bio" defaultValue={profile.bio} rows={6} minLength={20} maxLength={1600} required className="mt-2 w-full rounded-lg border border-[var(--border-strong)] px-3 py-3 leading-6 outline-none focus:border-[var(--green)]" />
          </label>
        </div>

        <WizardTextArea
          visible={step === 2}
          name="interests"
          label="Partnership interests"
          placeholder={"Sponsorships\nResearch collaborations\nNewsletter collaborations"}
          help="One per line. PartnerBird uses these as signals, not hard limits."
        />
        <WizardTextArea
          visible={step === 3}
          name="capabilities"
          label="What can you contribute?"
          placeholder={"Audience\nContent\nDistribution\nResearch expertise"}
          help="Think about concrete value you can bring to a partner."
        />
        <WizardTextArea
          visible={step === 4}
          name="projects"
          label="Projects or products PartnerBird should understand"
          placeholder={"Your flagship product\nYour newsletter\nYour community"}
          help="One per line. You can add fuller project descriptions later."
        />
        <WizardTextArea
          visible={step === 5}
          name="thingsToAvoid"
          label="What should PartnerBird avoid?"
          placeholder="Overly promotional content, one-sided asks, irrelevant sponsorships…"
          help="This is private guidance and is never shown verbatim to visitors."
        />
        <WizardTextArea
          visible={step === 6}
          name="activations"
          label="Available partnership activations"
          placeholder={"Joint article concepts\nNewsletter collaboration\nResource exchange\nCo-marketing ideas"}
          help="These are capabilities for now; PartnerBird will propose before producing."
        />

        <div data-onboarding-step="7" className={step === 7 ? "grid min-h-[270px] place-items-center text-center" : "hidden"}>
          <div>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--mint)] text-[var(--green)]">
              <Eye size={28} />
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-[-.04em]">Review before publishing</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">
              Check your answers, then publish this first version. Your onboarding is only complete after the save succeeds.
            </p>
          </div>
        </div>

        {errorMessage ? (
          <div role="alert" className="mt-5 flex items-start gap-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] px-3 py-2 text-sm text-[var(--danger-ink)]">
            <AlertCircle className="mt-0.5 flex-none" size={16} />
            <div>
              <p>{errorMessage}</p>
              {actionError && state?.step !== undefined && state.step !== step ? (
                <button
                  type="button"
                  onClick={fixActionError}
                  className="mt-1 font-semibold underline underline-offset-2"
                >
                  Go to the field that needs attention
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--border-strong)] px-4 text-sm font-semibold disabled:opacity-40"
        >
          <ArrowLeft size={16} /> Back
        </button>
        {step < steps.length - 1 ? (
          <button
            key="continue"
            type="button"
            onClick={advance}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--green)] px-5 text-sm font-semibold text-white"
          >
            Continue <ArrowRight size={16} />
          </button>
        ) : (
          <button
            key="publish"
            type="submit"
            disabled={pending}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--green)] px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            Publish PartnerBird
          </button>
        )}
      </div>
    </form>
  );
}

function WizardTextArea({
  visible,
  name,
  label,
  placeholder,
  help,
}: {
  visible: boolean;
  name: string;
  label: string;
  placeholder: string;
  help: string;
}) {
  return (
    <label
      data-onboarding-step={
        name === "interests"
          ? "2"
          : name === "capabilities"
            ? "3"
            : name === "projects"
              ? "4"
              : name === "thingsToAvoid"
                ? "5"
                : "6"
      }
      className={visible ? "block text-sm font-medium" : "hidden"}
    >
      {label}
      <span className="mt-1 block text-xs font-normal text-[var(--muted)]">{help}</span>
      <textarea
        name={name}
        rows={8}
        maxLength={name === "thingsToAvoid" ? 1500 : 2000}
        placeholder={placeholder}
        className="mt-3 w-full rounded-lg border border-[var(--border-strong)] px-3 py-3 leading-6 outline-none focus:border-[var(--green)]"
      />
    </label>
  );
}
