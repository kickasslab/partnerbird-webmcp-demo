import { Activity, ArrowLeft, Bookmark, Bug, FilePenLine, LockKeyhole, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { WebMCPSettingsForm } from "@/components/owner/webmcp-settings-form";
import { PageHeader, SectionHeading, StatusBadge, ownerStyles as styles } from "@/components/owner/owner-ui";
import { getOwnerWebMCPPageData } from "@/server/webmcp/read-models";
import { blockPartnerAction, unblockPartnerAction } from "./actions";

export const metadata: Metadata = { title: "WebMCP & Agent Access" };

const activityLabels: Record<string, string> = {
  profile_accessed: "Profile accessed for matching",
  partner_search_performed: "Partner search performed",
  partner_saved: "Partner saved",
  request_draft_created: "Request draft created",
  request_draft_updated: "Request draft updated",
  request_submitted: "Partnership request submitted",
  request_withdrawn: "Partnership request withdrawn",
  request_accepted: "Partnership request accepted",
  request_declined: "Partnership request declined",
};

export default async function WebMCPSettingsPage() {
  const data = await getOwnerWebMCPPageData();
  return <>
    <PageHeader eyebrow="Demo account setup" title="WebMCP & Agent Access" description="Control exactly how compatible browser agents may discover profiles and perform partnership work through your signed-in PartnerBird session." actions={<Link href="/" className={styles.secondaryButton}><ArrowLeft size={13} /> Demo home</Link>} />
    <WebMCPSettingsForm settings={data.settings} />

    <section className={styles.section}>
      <SectionHeading title="What WebMCP can access" description="Plain-language allowlist; PartnerBird never serializes complete database records" />
      <div className={styles.threeGrid}>
        <AccessCard icon={<ShieldCheck size={17} />} title="Public profile data" text="Username, display name, profile URL, avatar, headline, public bio, public website/social links, interests, capabilities, projects, and activation options." />
        <AccessCard icon={<Bookmark size={17} />} title="Your private workflow" text="Your own WebMCP preferences, saved-partner shortlist, and request drafts or requests where you are a party." />
        <AccessCard icon={<LockKeyhole size={17} />} title="Never exposed" text="Emails, auth IDs, tokens, billing data, private agent guidance, moderation data, risk signals, visitor conversations, Agent Chat prompts, OpenRouter data, and private notes." />
      </div>
    </section>

    <section className={styles.section}>
      <SectionHeading title="WebMCP Activity" description="Meaningful actions only—external agent prompts and sensitive contents are not logged" />
      {data.activity.length ? <div className={styles.list}>{data.activity.map((event) => <div className={styles.listRow} key={event.id}><div className={styles.listMain}><span className={styles.listIcon}><Activity size={16} /></span><div className={styles.listText}><strong>{activityLabels[event.action] ?? event.action.replaceAll("_", " ")}</strong><p>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(event.createdAt)}</p></div></div><StatusBadge status={event.outcome} /></div>)}</div> : <div className={`${styles.card} ${styles.cardPadding}`}><p className="text-[12px] text-[var(--muted)]">No WebMCP activity yet.</p></div>}
    </section>

    <div className={`${styles.twoGrid} ${styles.section}`}>
      <section><SectionHeading title="Saved partners" /><div className={styles.list}>{data.savedPartners.length ? data.savedPartners.map((partner) => <Link className={styles.listRow} href={`/@${partner.handle}`} key={partner.id}><div className={styles.listMain}><span className={styles.listIcon}><Bookmark size={16} /></span><div className={styles.listText}><strong>{partner.displayName} · @{partner.handle}</strong><p>{partner.headline}</p></div></div></Link>) : <div className={styles.cardPadding}><p className="text-[12px] text-[var(--muted)]">No partners saved through WebMCP.</p></div>}</div></section>
      <section><SectionHeading title="Agent-assisted requests" /><div className={styles.list}>{data.requests.length ? data.requests.map((request) => <div className={styles.listRow} key={request.id}><div className={styles.listMain}><span className={styles.listIcon}><FilePenLine size={16} /></span><div className={styles.listText}><strong>{request.title}</strong><p>{request.direction}{request.counterpart ? ` · @${request.counterpart.handle}` : ""}</p></div></div><StatusBadge status={request.status} /></div>) : <div className={styles.cardPadding}><p className="text-[12px] text-[var(--muted)]">No WebMCP request drafts or submissions.</p></div>}</div></section>
    </div>

    <section className={styles.section}>
      <SectionHeading title="Blocked PartnerBird accounts" description="Blocks apply in both directions to search, saving, drafts, and request delivery" />
      <div className={`${styles.card} ${styles.cardPadding}`}>
        <form action={blockPartnerAction} className="flex flex-wrap gap-2"><label className="min-w-56 flex-1"><span className="sr-only">Username to block</span><input name="username" className={styles.input} placeholder="username without @" required /></label><button className={styles.dangerButton} type="submit">Block account</button></form>
        {data.blockedProfiles.length ? <div className="mt-4 grid gap-2 border-t border-[var(--border)] pt-4">{data.blockedProfiles.map((blocked) => <div className="flex items-center justify-between gap-3 text-[12px]" key={blocked.handle}><span><strong>{blocked.displayName}</strong> <span className="text-[var(--muted)]">@{blocked.handle}</span></span><form action={unblockPartnerAction}><input type="hidden" name="username" value={blocked.handle} /><button className={styles.secondaryButton} type="submit">Unblock</button></form></div>)}</div> : <p className="mt-4 border-t border-[var(--border)] pt-4 text-[11px] text-[var(--muted)]">You have not blocked any PartnerBird accounts.</p>}
      </div>
    </section>

    {process.env.NODE_ENV !== "production" ? <div className="mt-5"><Link href="/app/settings/webmcp/debug" className={styles.secondaryButton}><Bug size={13} /> Open development debug view</Link></div> : null}
  </>;
}

function AccessCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <article className={`${styles.card} ${styles.cardPadding}`}><span className={styles.listIcon}>{icon}</span><h3 className="mt-4 text-[13px] font-bold">{title}</h3><p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">{text}</p></article>; }
