"use client";

import { Bot, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useActionState, useEffect } from "react";

import { saveWebMCPSettingsAction } from "@/app/app/settings/webmcp/actions";
import { SubmitButton } from "@/components/owner/form-controls";
import type { WebMCPSettings } from "@/lib/webmcp/types";
import styles from "./owner-ui.module.css";

const accessControls = [
  ["allowPublicProfileRead", "Allow agents to read my public partnership profile", "Only the fields listed in the access summary below are returned."],
  ["allowDiscovery", "Allow my profile to appear in WebMCP partnership searches", "Search is capped and respects publication, blocks, and platform limits."],
  ["allowMatching", "Allow agents to use my public profile for partnership matching", "Only publicly shared interests and profile content can be returned."],
  ["allowSavePartners", "Allow agents acting for me to save potential partners", "Saved partners remain private to your account."],
  ["allowCreateDrafts", "Allow agents acting for me to create partnership request drafts", "Drafts are private and do not contact recipients."],
  ["allowSubmitRequests", "Allow agents acting for me to submit partnership requests", "Submission pauses for your approval in a visible PartnerBird dialog showing the exact recipient and message."],
  ["allowIncomingRequests", "Allow incoming partnership requests initiated through WebMCP", "Platform anti-spam limits remain mandatory."],
] as const;

export function WebMCPSettingsForm({ settings }: { settings: WebMCPSettings }) {
  const [state, action] = useActionState(saveWebMCPSettingsAction, null);
  useEffect(() => {
    if (state?.success) window.dispatchEvent(new CustomEvent("partnerbird:webmcp-settings-changed"));
  }, [state]);
  return (
    <form action={action} className={styles.formCard}>
      <div className={styles.formSection}>
        <div className="flex items-start gap-3">
          <span className={styles.listIcon}><Bot size={18} /></span>
          <div><h2>WebMCP & Agent Access</h2><p>WebMCP lets compatible AI agents use selected PartnerBird features on your behalf. Your normal PartnerBird privacy, security and anti-spam protections still apply.</p></div>
        </div>
        <label className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-[var(--green-border)] bg-[var(--mint)] p-4 text-[13px] font-bold">
          <span>Enable WebMCP for my PartnerBird account<small className="mt-1 block font-normal text-[var(--muted)]">Turn this off to immediately stop exposing authenticated WebMCP capabilities.</small></span>
          <input name="enabled" type="checkbox" defaultChecked={settings.enabled} className="h-6 w-6 accent-[var(--green)]" />
        </label>
      </div>
      <div className={styles.formSection}>
        <h2>Agent permissions</h2>
        <p>Choose individual capabilities. The master control above must also be enabled.</p>
        <div className="mt-4 grid gap-2">
          {accessControls.map(([name, label, help]) => (
            <label key={name} className="flex items-start justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-softer)] p-3 text-[12px] font-semibold">
              <span>{label}<small className="mt-1 block font-normal leading-4 text-[var(--muted)]">{help}</small></span>
              <input name={name} type="checkbox" defaultChecked={settings[name]} className="mt-0.5 h-5 w-5 flex-none accent-[var(--green)]" />
            </label>
          ))}
        </div>
      </div>
      <div className={styles.formSection}>
        <h2>Incoming request protections</h2>
        <p>These controls add protection; they never disable PartnerBird&apos;s mandatory abuse controls.</p>
        <div className="mt-4 grid gap-2">
          <Toggle name="requireVerifiedEmail" checked={settings.requireVerifiedEmail} label="Require verified email" help="Only verified PartnerBird accounts may submit WebMCP requests to you." />
          <Toggle name="requireCompleteProfile" checked={settings.requireCompleteProfile} label="Require a sufficiently completed PartnerBird profile" help="Senders must finish PartnerBird onboarding before outreach." />
        </div>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>Partnership interest fit<select name="interestMatchMode" defaultValue={settings.interestMatchMode} className={styles.select}><option value="off">No preference</option><option value="prefer">Prefer matching interests</option><option value="require">Require a listed interest match</option></select><small>Private rule details are never disclosed to other users.</small></label>
          <label className={styles.field}>Inbound WebMCP request limit<select name="inboundStrictness" defaultValue={settings.inboundStrictness} className={styles.select}><option value="standard">Standard</option><option value="strict">Strict</option><option value="very_strict">Very strict</option></select><small>Global recipient and sender limits apply in every mode.</small></label>
        </div>
      </div>
      <div className={styles.formSection}>
        <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-softer)] p-4">
          <LockKeyhole size={18} className="mt-0.5 flex-none text-[var(--green-strong)]" />
          <div><h2>Mandatory platform safeguards</h2><p>Authentication, authorization, blocks, account suspension, subscription limits, CSRF/origin checks, duplicate detection, idempotency, content validation, rate limits, and recipient rules cannot be switched off.</p></div>
        </div>
        {state?.error ? <p role="alert" className="mt-4 text-[11px] text-[var(--danger-ink)]">{state.error}</p> : null}
        {state?.success ? <p role="status" className="mt-4 flex items-center gap-1 text-[11px] text-[var(--green-strong)]"><CheckCircle2 size={12} />{state.success}</p> : null}
      </div>
      <div className="flex items-center justify-between gap-4 p-4"><span className="flex items-center gap-2 text-[11px] text-[var(--muted)]"><ShieldCheck size={13} /> Owner-scoped settings</span><SubmitButton>Save WebMCP settings</SubmitButton></div>
    </form>
  );
}

function Toggle({ name, checked, label, help }: { name: string; checked: boolean; label: string; help: string }) {
  return <label className="flex items-start justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-softer)] p-3 text-[12px] font-semibold"><span>{label}<small className="mt-1 block font-normal leading-4 text-[var(--muted)]">{help}</small></span><input name={name} type="checkbox" defaultChecked={checked} className="mt-0.5 h-5 w-5 flex-none accent-[var(--green)]" /></label>;
}
