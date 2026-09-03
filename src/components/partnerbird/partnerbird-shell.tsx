"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  CheckCircle2,
  CircleUserRound,
  ExternalLink,
  Filter,
  Globe2,
  Hand,
  Handshake,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Menu,
  MessageCircleMore,
  SearchCheck,
  Send,
  Sparkles,
  Star,
  RotateCcw,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import {
  type CSSProperties,
  FormEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { PublicProfile } from "@/lib/profile-data";
import {
  getProfileThemeVariables,
  resolveProfileTheme,
} from "@/lib/profile-themes";
import { ThemeToggle } from "@/components/theme-toggle";

import { BrandMark } from "./brand-mark";
import {
  activationIcons,
  capabilityIcons,
  interestIcons,
  projectIcons,
  valueIcons,
} from "./profile-icons";
import styles from "./partnerbird-shell.module.css";

type Mode = "lobby" | "transition" | "chat";

type FitLabel =
  | "Strong Fit"
  | "Good Fit"
  | "Worth Exploring"
  | "Weak Fit"
  | "Not a Fit";

type PublicIdea = {
  id: string;
  fitLabel: FitLabel;
  type: string;
  title: string;
  description: string;
  whyItWorks: string;
  ownerContribution: string;
  visitorContribution: string;
  mutualValue: string;
  activation: string;
};

type PublicFit = {
  label: FitLabel;
  rationale: string;
  strengths: string[];
  concerns: string[];
};

type ProposalCompletion = {
  title: string;
  resumeEmailSent: boolean;
};

type AnalysisStage =
  | "understand_business"
  | "compare_audiences"
  | "find_angles"
  | "assess_fit";

type ChatTurn = {
  id: string;
  message: string;
  assistant: string;
  stages: Partial<Record<AnalysisStage, "active" | "done">>;
  fit?: PublicFit;
  ideas: PublicIdea[];
  error?: string;
  quotaFallback?: {
    title: string;
    description: string;
    actionLabel: string;
  };
  nextState?: ConversationState;
  isComplete: boolean;
  action?: TurnAction;
  ideaId?: string;
  hideVisitorMessage?: boolean;
};

type HumanConversationMessage = {
  id: string;
  role: "visitor" | "owner";
  content: string;
  createdAt: string;
};

type StoredAgentMessage = {
  id: string;
  role: "visitor" | "assistant";
  content: string;
  createdAt: string;
};

type ConversationContactStatus = {
  email: string;
  verified: boolean;
  accountCreated?: boolean;
} | null;

type LeadIntake = {
  personName: string | null;
  companyName: string | null;
  companyDescription: string | null;
  initialIntent: string | null;
  intakeCompletedAt: string | null;
} | null;

type ProfileIntakeValues = {
  personName: string;
  companyName: string;
  companyDescription: string;
};

type ChatTextSize = "small" | "standard" | "large";

type IntakeStep =
  | "person_name"
  | "company_name"
  | "company_description"
  | "email"
  | "code"
  | "member_approval"
  | "ready";

type ConversationSyncPayload = {
  controlMode?: string;
  state?: ConversationState;
  messages?: HumanConversationMessage[];
  agentMessages?: StoredAgentMessage[];
  fit?: PublicFit | null;
  ideas?: PublicIdea[];
  contact?: ConversationContactStatus;
  lead?: LeadIntake;
  viewer?: ConversationContactStatus;
};

type ConversationState =
  | "DISCOVERY"
  | "FIT_ASSESSMENT"
  | "IDEA_GENERATION"
  | "QUALIFICATION"
  | "PROPOSAL_READY"
  | "PROPOSAL_SENT"
  | "NO_FIT";

type PublicAgentEvent =
  | { type: "conversation"; conversationId: string }
  | { type: "status"; stage: AnalysisStage; state: "active" | "done" }
  | { type: "assistant_delta"; delta: string }
  | { type: "fit"; fit: PublicFit }
  | { type: "ideas"; ideas: PublicIdea[] }
  | { type: "done"; state: ConversationState }
  | { type: "error"; code: string; message: string };

type TurnAction =
  | "message"
  | "analyze_url"
  | "explore_idea"
  | "refine_idea"
  | "propose_idea";

type PartnerBirdShellProps = {
  profile: PublicProfile;
  entryMode?: "NORMAL" | "WEBMCP_HANDOFF";
  initialChat?: boolean;
  initialConversationId?: string;
  experience?: "profile" | "demo";
  initialViewer?: ConversationContactStatus;
};

const prompts = [
  { label: "See if we’re a fit", icon: SearchCheck },
  { label: "Suggest partnership ideas", icon: Sparkles },
  { label: "I want a newsletter collaboration", icon: Mail },
  { label: "We have a product to share", icon: Handshake },
];

const CHAT_LAYOUT_SETTLE_MS = 720;
const calmLayoutEase = [0.22, 1, 0.36, 1] as const;

function conversationStorageKey(handle: string) {
  return `partnerbird:v1:conversation:${handle.toLowerCase()}`;
}

const chatTextSizeStorageKey = "partnerbird:v1:chat-text-size";
const chatTextSizeChangeEvent = "partnerbird:chat-text-size-change";

function getStoredChatTextSize(): ChatTextSize {
  const saved = window.localStorage.getItem(chatTextSizeStorageKey);
  return saved === "small" || saved === "large" ? saved : "standard";
}

function subscribeToChatTextSize(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(chatTextSizeChangeEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(chatTextSizeChangeEvent, onStoreChange);
  };
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function hydrateStoredTurns(payload: ConversationSyncPayload) {
  const restored: ChatTurn[] = [];
  for (const message of payload.agentMessages ?? []) {
    if (message.role === "visitor") {
      restored.push({
        id: message.id,
        message: message.content,
        assistant: "",
        stages: {},
        ideas: [],
        isComplete: true,
      });
      continue;
    }
    const current = restored.at(-1);
    if (current) current.assistant = message.content;
  }

  const latest = restored.at(-1);
  if (latest) {
    latest.fit = payload.fit ?? undefined;
    latest.ideas = payload.ideas ?? [];
    latest.nextState = payload.state;
  }
  const first = restored.at(0);
  if (first && payload.lead?.intakeCompletedAt && first.message === firstAgentMessage(payload.lead)) {
    first.hideVisitorMessage = true;
  }
  return restored;
}

function resolveIntakeStep(
  lead: LeadIntake,
  contact: ConversationContactStatus,
  viewer: ConversationContactStatus,
): IntakeStep {
  if (!lead?.personName) return "person_name";
  if (!lead.companyName) return "company_name";
  if (!lead.companyDescription) return "company_description";
  if (contact?.verified) return "ready";
  if (viewer?.verified) return "member_approval";
  if (contact?.accountCreated) return "code";
  return "email";
}

function firstAgentMessage(lead: NonNullable<LeadIntake>) {
  const introduction = `I’m ${lead.personName} from ${lead.companyName}. ${lead.companyDescription}`;
  const intent = lead.initialIntent?.trim();
  return intent && intent !== "See if we’re a fit"
    ? `${introduction}\n\nI’d like to explore: ${intent}`
    : introduction;
}

const valueProps = [
  {
    title: "Understands both sides",
    detail: "Learns what you do and what Darren is building.",
  },
  {
    title: "Suggests genuine ideas",
    detail: "Proposes relevant concepts, not generic outreach.",
  },
  {
    title: "Qualifies before introducing",
    detail: "Focuses the conversation on mutual-value fits.",
  },
  {
    title: "Activates useful work",
    detail: "Turns a good fit into content, widgets, and swaps.",
  },
];

function Header() {
  return (
    <header className={styles.header}>
      <Link
        href="/"
        className={styles.brand}
        aria-label="PartnerBird WebMCP demo home"
      >
        <BrandMark className="h-8 w-8" />
        <span>PartnerBird</span>
      </Link>
      <div className={styles.headerActions}>
        <Link
          href="/signup"
          className={`${styles.secondaryButton} ${styles.headerCreate} inline-flex items-center gap-2`}
        >
          <span>Create your PartnerBird</span>
          <Sparkles size={14} aria-hidden="true" />
        </Link>
        <ThemeToggle />
        <Link
          href="/login"
          aria-label="Sign in"
          className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--muted)] transition hover:border-[var(--green-border)] hover:bg-[var(--mint)] hover:text-[var(--green-strong)]"
        >
          <CircleUserRound size={21} />
        </Link>
      </div>
    </header>
  );
}

function StatusPill({
  isOpen,
  name,
}: {
  isOpen: boolean;
  name?: string;
}) {
  return (
    <span
      className={`${styles.statusPill} ${isOpen ? "" : styles.statusPillClosed}`}
    >
      <span
        className={`${styles.statusDot} ${isOpen ? "" : styles.statusDotClosed}`}
        aria-hidden="true"
      />
      {isOpen
        ? name
          ? `${name} is open to partnerships`
          : "Open to partnerships"
        : name
          ? `${name} is not accepting proposals`
          : "Not accepting proposals"}
    </span>
  );
}

function AgentOrb({ small = false }: { small?: boolean }) {
  if (small) {
    return (
      <span className={styles.miniAgent} aria-hidden="true">
        <BrandMark framed />
      </span>
    );
  }

  return (
    <span className={styles.agentOrb} aria-hidden="true">
      <BrandMark />
    </span>
  );
}

function AgentHeader({ profile }: { profile: PublicProfile }) {
  return (
    <div className={styles.agentHeader}>
      <div className={styles.agentIdentity}>
        <AgentOrb />
        <div>
          <h2>Talk to {agentDisplayName(profile)}</h2>
          <p>AI Partnership Agent</p>
        </div>
      </div>
      <span className={styles.secure}>
        <LockKeyhole size={12} aria-hidden="true" />
        Protected session
      </span>
    </div>
  );
}

function ProjectMark({ index, tone }: { index: number; tone: string }) {
  const Icon = projectIcons[index % projectIcons.length];
  return (
    <span className={`${styles.projectMark} ${styles[tone]}`}>
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
    </span>
  );
}

function ProfileOverview({ profile }: { profile: PublicProfile }) {
  return (
    <motion.section layout className={`${styles.surface} ${styles.profileCard}`}>
      <div className={styles.identity}>
        <div className={styles.avatarFrame}>
          <Image
            src={profile.avatarUrl}
            alt={`Illustrated portrait of ${profile.displayName}`}
            width={512}
            height={512}
            sizes="(max-width: 560px) 92px, (max-width: 820px) 118px, 168px"
            priority
          />
        </div>
        <div>
          <h1>{profile.displayName}</h1>
          <p className={styles.headline}>{profile.headline}</p>
          <StatusPill isOpen={profile.isOpen} />
          <div className={styles.bio}>
            {profile.bio.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <ProfileLinks profile={profile} />
        </div>
      </div>

      {profile.interests.length ? (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>What {profile.displayName} is looking for</h2>
          <div className={styles.chipGrid}>
            {profile.interests.map((interest, index) => {
              const Icon = interestIcons[index % interestIcons.length];
              return (
                <span className={styles.chip} key={interest}>
                  <Icon size={16} color="var(--green)" strokeWidth={1.8} aria-hidden="true" />
                  {interest}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {profile.capabilities.length ? (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>What {profile.displayName} can offer</h2>
          <div className={styles.offerGrid}>
            {profile.capabilities.map((capability, index) => {
              const Icon = capabilityIcons[index % capabilityIcons.length];
              return (
                <div className={styles.offerTile} key={capability.label}>
                  <Icon size={23} strokeWidth={1.65} aria-hidden="true" />
                  <strong>{capability.label}</strong>
                  <span>{capability.detail}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {profile.projects.length ? (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Projects PartnerBird knows about</h2>
          <div className={styles.projectGrid}>
            {profile.projects.map((project, index) => (
              <article className={styles.projectCard} key={project.name}>
                <div className={styles.projectNameRow}>
                  <ProjectMark index={index} tone={project.tone} />
                  <h3>{project.name}</h3>
                </div>
                <p>{project.description}</p>
                <span
                  className={`${styles.fitBadge} ${
                    project.fit === "Good fit" ? styles.fitBadgeGood : ""
                  }`}
                >
                  {project.fit}
                </span>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </motion.section>
  );
}

function ProfileLinks({ profile }: { profile: PublicProfile }) {
  const links = [
    profile.websiteUrl ? { label: "Website", href: profile.websiteUrl } : null,
    profile.socialLinks.linkedin
      ? { label: "LinkedIn", href: profile.socialLinks.linkedin }
      : null,
    profile.socialLinks.x ? { label: "X", href: profile.socialLinks.x } : null,
    profile.socialLinks.youtube
      ? { label: "YouTube", href: profile.socialLinks.youtube }
      : null,
  ].filter((link): link is { label: string; href: string } => Boolean(link));

  if (!links.length) return null;
  return (
    <div className={styles.profileLinks} aria-label={`${profile.displayName}’s links`}>
      {links.map((link) => (
        <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
          {link.label} <ExternalLink size={11} aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
};

function Composer({
  value,
  onChange,
  onSubmit,
  placeholder = "Paste your website or ask a question…",
  disabled,
  label = "Message PartnerBird",
}: ComposerProps) {
  function submit(event: FormEvent) {
    event.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  }

  return (
    <form className={styles.composer} onSubmit={submit}>
      <label className="sr-only" htmlFor="partnerbird-message">
        {label}
      </label>
      <input
        id="partnerbird-message"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={4000}
      />
      <button
        type="submit"
        className={styles.sendButton}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
      >
        <Send size={17} aria-hidden="true" />
      </button>
    </form>
  );
}

function StarterPanel({
  profile,
  input,
  setInput,
  onStart,
  onContinue,
  experience,
}: {
  profile: PublicProfile;
  input: string;
  setInput: (value: string) => void;
  onStart: (value: string) => void;
  onContinue?: () => void;
  experience: "profile" | "demo";
}) {
  return (
    <motion.aside layout className={`${styles.surface} ${styles.starter}`}>
      <AgentHeader profile={profile} />
      <div className={styles.welcomeWrap}>
        <AgentOrb small />
        <div className={styles.welcomeBubble}>
          <p>{profile.agentGreeting}</p>
          <p>{profile.agentIntroduction}</p>
          {!profile.isOpen ? (
            <p>{profile.displayName} is not accepting new proposals right now.</p>
          ) : null}
        </div>
      </div>
      {profile.isOpen ? (
        <>
          <div className={styles.dotRow} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <Composer value={input} onChange={setInput} onSubmit={onStart} />
          <p className={styles.promptTitle}>Try a suggested prompt</p>
          <div className={styles.promptList}>
            {experience === "demo" ? (
              <button
                type="button"
                className={styles.promptButton}
                onClick={() =>
                  onStart(
                    "We build AcmeMonitor, an observability platform for teams shipping AI applications. Find a genuinely useful educational collaboration.",
                  )
                }
              >
                <Globe2 size={15} color="var(--green)" strokeWidth={1.8} aria-hidden="true" />
                Try the AcmeMonitor example
              </button>
            ) : null}
            {prompts.map(({ label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                className={styles.promptButton}
                onClick={() => onStart(label)}
              >
                <Icon size={15} color="var(--green)" strokeWidth={1.8} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.primaryCta}
            onClick={() => onStart(input.trim() || "See if we’re a fit")}
          >
            Start with PartnerBird
          </button>
          {onContinue ? (
            <button
              type="button"
              className={styles.continueConversationButton}
              onClick={onContinue}
            >
              <MessageCircleMore size={15} aria-hidden="true" />
              Continue your previous conversation
            </button>
          ) : null}
          <div className={styles.privacyNote}>
            <Sparkles size={18} color="var(--green)" aria-hidden="true" />
            <p>
              Starting opens the full partner chat where we’ll evaluate fit and develop
              ideas together.
            </p>
          </div>
        </>
      ) : (
        <div className={styles.closedNote}>
          You can still review the public profile and collaboration examples while this
          PartnerBird is paused.
        </div>
      )}
    </motion.aside>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <span className={`${styles.skeletonBlock} ${className}`} />;
}

function ContextRailSkeleton() {
  return (
    <motion.aside
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: calmLayoutEase }}
      className={`${styles.surface} ${styles.contextRail} ${styles.skeletonRail}`}
      aria-hidden="true"
    >
      <div className={styles.skeletonIdentity}>
        <SkeletonBlock className={styles.skeletonAvatar} />
        <SkeletonBlock className={styles.skeletonName} />
        <SkeletonBlock className={styles.skeletonHeadline} />
        <SkeletonBlock className={styles.skeletonStatus} />
      </div>
      {[3, 4, 3].map((rows, sectionIndex) => (
        <div className={styles.skeletonRailSection} key={sectionIndex}>
          <SkeletonBlock className={styles.skeletonSectionTitle} />
          <div className={styles.skeletonRailGroup}>
            {Array.from({ length: rows }, (_, rowIndex) => (
              <div className={styles.skeletonRailRow} key={rowIndex}>
                <SkeletonBlock className={styles.skeletonRailIcon} />
                <SkeletonBlock
                  className={rowIndex % 2 ? styles.skeletonLineShort : styles.skeletonLine}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </motion.aside>
  );
}

function ChatWorkspaceSkeleton({ profileName }: { profileName: string }) {
  return (
    <motion.section
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.26, ease: calmLayoutEase }}
      className={`${styles.surface} ${styles.workspace} ${styles.skeletonWorkspace}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`Preparing ${profileName}’s PartnerBird conversation`}
      data-testid="chat-transition"
    >
      <span className="sr-only">Preparing the PartnerBird conversation.</span>
      <div className={styles.workspaceHeader} aria-hidden="true">
        <div className={styles.skeletonAgentHeader}>
          <SkeletonBlock className={styles.skeletonAgentOrb} />
          <div className={styles.skeletonHeaderCopy}>
            <SkeletonBlock className={styles.skeletonHeaderTitle} />
            <SkeletonBlock className={styles.skeletonHeaderSubtitle} />
          </div>
          <SkeletonBlock className={styles.skeletonSecure} />
        </div>
      </div>
      <div className={`${styles.transcript} ${styles.skeletonTranscript}`} aria-hidden="true">
        <div className={styles.skeletonMessageRow}>
          <SkeletonBlock className={styles.skeletonMiniOrb} />
          <div className={styles.skeletonBubble}>
            <SkeletonBlock className={styles.skeletonLineWide} />
            <SkeletonBlock className={styles.skeletonLine} />
            <SkeletonBlock className={styles.skeletonLineShort} />
          </div>
        </div>
        <div className={styles.skeletonAnalysisStrip}>
          {Array.from({ length: 4 }, (_, index) => (
            <div className={styles.skeletonAnalysisStep} key={index}>
              <SkeletonBlock className={styles.skeletonStepDot} />
              <SkeletonBlock className={styles.skeletonStepLabel} />
            </div>
          ))}
        </div>
      </div>
      <div className={`${styles.workspaceComposer} ${styles.skeletonComposerWrap}`} aria-hidden="true">
        <SkeletonBlock className={styles.skeletonActionLine} />
        <div className={styles.skeletonComposer}>
          <SkeletonBlock className={styles.skeletonComposerLine} />
          <SkeletonBlock className={styles.skeletonSend} />
        </div>
      </div>
    </motion.section>
  );
}

function LowerLobby({ profile }: { profile: PublicProfile }) {
  const metricIcons = [Filter, Star, CheckCircle2];
  return (
    <div className={styles.lowerSections}>
      <section className={`${styles.surface} ${styles.lowerCard}`}>
        <h2 className={styles.sectionTitle}>
          Why use PartnerBird instead of sending a cold message?
        </h2>
        <div className={styles.valueGrid}>
          {valueProps.map((item, index) => {
            const Icon = valueIcons[index];
            return (
              <article className={styles.valueCard} key={item.title}>
                <span className={styles.valueIcon}>
                  <Icon size={23} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>
                    {index === 0
                      ? `Learns what you do and what ${profile.displayName} is building.`
                      : item.detail}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {profile.metrics.length ? (
        <section className={`${styles.surface} ${styles.lowerCard}`}>
          {profile.isDemo ? (
            <span className={styles.demoLabel}>
              <Sparkles size={12} aria-hidden="true" /> Demo profile activity
            </span>
          ) : null}
          <div className={styles.stats}>
          {profile.metrics.map((metric, index) => {
            const Icon = metricIcons[index];
            return (
              <div className={styles.stat} key={metric.label}>
                <Icon size={28} strokeWidth={1.7} aria-hidden="true" />
                <div>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </div>
              </div>
            );
          })}
          </div>
        </section>
      ) : null}

      {profile.collaborations.length ? <CollaborationSection profile={profile} /> : null}

      <section className={`${styles.surface} ${styles.lowerCard}`}>
        <div
          className={`grid gap-6 ${
            profile.activations.length ? "lg:grid-cols-[.9fr_1.1fr]" : ""
          }`}
        >
          {profile.activations.length ? (
            <div>
            <h2 className={styles.sectionTitle}>What PartnerBird can activate</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {profile.activations.map((activation, index) => {
                const Icon = activationIcons[index % activationIcons.length];
                return (
                  <div className={styles.offerTile} key={activation.label}>
                    <Icon size={23} strokeWidth={1.65} aria-hidden="true" />
                    <strong>{activation.label}</strong>
                    <span>{activation.note}</span>
                  </div>
                );
              })}
            </div>
            </div>
          ) : null}
          <div>
            <h2 className={styles.sectionTitle}>What happens after you start</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["1", "Share your business", "Tell us what you do."],
                ["2", "PartnerBird evaluates fit", "We compare both sides."],
                ["3", "PartnerBird proposes", "You get tailored ideas."],
                ["4", "A real chat opens", "Only when there’s value."],
              ].map(([number, title, detail]) => (
                <div className="relative px-2 text-center" key={number}>
                  <span className="mx-auto mb-2 grid h-7 w-7 place-items-center rounded-full bg-[var(--mint)] text-xs font-bold text-[var(--green-strong)]">
                    {number}
                  </span>
                  <strong className="block text-[11px]">{title}</strong>
                  <span className="mt-1 block text-[9.5px] leading-4 text-[var(--muted)]">
                    {detail}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function CollaborationSection({ profile }: { profile: PublicProfile }) {
  return (
    <section className={`${styles.surface} ${styles.lowerCard}`}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className={`${styles.sectionTitle} !mb-0`}>Recent collaboration examples</h2>
        {profile.isDemo ? (
          <span className={styles.demoLabel}>Illustrative demo examples</span>
        ) : null}
      </div>
      <div className={styles.collabGrid}>
        {profile.collaborations.map((collaboration) => (
          <article className={styles.collabCard} key={`${collaboration.left}-${collaboration.right}`}>
            <div className={styles.logoPair}>
              <span className={styles.tinyLogo}>
                <Globe2 size={15} aria-hidden="true" />
              </span>
              <span>{collaboration.left}</span>
              <X size={11} />
              <span>{collaboration.right}</span>
            </div>
            <h3>{collaboration.left} × {collaboration.right}</h3>
            <span
              className={`${styles.fitBadge} ${
                collaboration.fit === "Good fit" ? styles.fitBadgeGood : ""
              }`}
            >
              {collaboration.fit}
            </span>
            <p>{collaboration.description}</p>
            <footer>{collaboration.formats}</footer>
          </article>
        ))}
      </div>
    </section>
  );
}

function ContextRail({ profile }: { profile: PublicProfile }) {
  return (
    <motion.aside
      layout
      className={`${styles.surface} ${styles.contextRail} ${styles.contentReveal}`}
    >
      <div className={styles.compactIdentity}>
        <div className={styles.avatarFrame}>
          <Image
            src={profile.avatarUrl}
            alt={`Illustrated portrait of ${profile.displayName}`}
            width={512}
            height={512}
            sizes="118px"
          />
        </div>
        <h1>{profile.displayName}</h1>
        <p className={styles.headline}>{profile.headline}</p>
        <StatusPill isOpen={profile.isOpen} />
      </div>

      <div className={styles.railSection}>
        <h2 className={styles.sectionTitle}>PartnerBird knows about</h2>
        <div className={styles.railList}>
          {profile.projects.map((project, index) => {
            const Icon = projectIcons[index % projectIcons.length];
            return (
              <div className={styles.railRow} key={project.name}>
                <Icon size={15} />
                <span>{project.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.railSection}>
        <h2 className={styles.sectionTitle}>Currently interested in</h2>
        <div className={styles.railChips}>
          {profile.interests.slice(0, 5).map((interest) => (
            <span key={interest}>{interest}</span>
          ))}
        </div>
      </div>

      <div className={styles.railSection}>
        <h2 className={styles.sectionTitle}>Available activations</h2>
        <div className={styles.railList}>
          {profile.activations.map((activation, index) => {
            const Icon = activationIcons[index % activationIcons.length];
            return (
              <div className={styles.railRow} key={activation.label}>
                <Icon size={14} />
                <span>{activation.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.railSection}>
        <h2 className={styles.sectionTitle}>Partnership guidelines</h2>
        <div className="space-y-2">
          {profile.guidelines.slice(0, 4).map((guideline) => (
            <p className="flex gap-2 text-[10px] leading-4 text-[var(--muted)]" key={guideline}>
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--green)]" />
              {guideline}
            </p>
          ))}
        </div>
      </div>
    </motion.aside>
  );
}

function MobileContext({
  profile,
  themeVariables,
}: {
  profile: PublicProfile;
  themeVariables: CSSProperties;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className={`${styles.secondaryButton} ${styles.mobileContextButton}`}>
          <Menu size={14} /> About {profile.displayName}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-[var(--overlay)] backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-x-3 bottom-3 z-[90] max-h-[85dvh] overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--ink)] shadow-2xl"
          style={themeVariables}
        >
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="font-semibold">About {profile.displayName}</Dialog.Title>
            <Dialog.Close className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border)]" aria-label="Close profile details">
              <X size={17} />
            </Dialog.Close>
          </div>
          <div className="flex items-center gap-4">
            <Image src={profile.avatarUrl} alt="" width={76} height={76} className="rounded-full" />
            <div>
              <p className="text-xl font-bold">{profile.displayName}</p>
              <p className="text-sm text-[var(--muted)]">{profile.headline}</p>
              <StatusPill isOpen={profile.isOpen} />
            </div>
          </div>
          <div className="mt-5">
            <h3 className={styles.sectionTitle}>Projects PartnerBird knows</h3>
            <div className={styles.railList}>
              {profile.projects.map((project, index) => {
                const Icon = projectIcons[index % projectIcons.length];
                return <div className={styles.railRow} key={project.name}><Icon size={15}/>{project.name}</div>;
              })}
            </div>
          </div>
          <div className="mt-5">
            <h3 className={styles.sectionTitle}>Partnership interests</h3>
            <div className={styles.railChips}>
              {profile.interests.map((interest) => <span key={interest}>{interest}</span>)}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function IntakeForm({
  lead,
  step,
  viewer,
  contact,
  error,
  notice,
  busy,
  onProfileSubmit,
  onVerificationSubmit,
  onResendVerification,
  onApprove,
  onBegin,
  signInHref,
}: {
  lead: LeadIntake;
  step: IntakeStep;
  viewer: ConversationContactStatus;
  contact: ConversationContactStatus;
  error?: string;
  notice?: string;
  busy: boolean;
  onProfileSubmit: (values: ProfileIntakeValues) => void;
  onVerificationSubmit: (value: string, password?: string) => void;
  onResendVerification: () => void;
  onApprove: () => void;
  onBegin: () => void;
  signInHref: string;
}) {
  const [personName, setPersonName] = useState(lead?.personName ?? "");
  const [companyName, setCompanyName] = useState(lead?.companyName ?? "");
  const [companyDescription, setCompanyDescription] = useState(
    lead?.companyDescription ?? "",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const verificationValue = step === "code" ? code : email;
  const isProfileStep =
    step === "person_name" || step === "company_name" || step === "company_description";
  const profileComplete =
    personName.trim().length >= 2 &&
    companyName.trim().length >= 2 &&
    companyDescription.trim().length >= 10;

  const submitProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profileComplete || busy) return;
    onProfileSubmit({
      personName: personName.trim(),
      companyName: companyName.trim(),
      companyDescription: companyDescription.trim(),
    });
  };

  const submitVerification = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !verificationValue.trim() ||
      busy ||
      (step === "email" && password.length < 8)
    ) return;
    onVerificationSubmit(
      verificationValue.trim(),
      step === "email" ? password : undefined,
    );
  };

  return (
    <div className={styles.intakeCard} data-testid="agent-intake-form">
      <div className={styles.intakeCardHeader}>
        <span className={styles.intakeCardIcon}>
          {isProfileStep ? <CircleUserRound size={18} /> : <LockKeyhole size={18} />}
        </span>
        <div>
          <strong>
            {isProfileStep ? "A quick introduction" : "Verify your email to continue"}
          </strong>
          <p>
            {isProfileStep
              ? "Complete these three fields before starting Agent Chat. No AI credits are used."
              : "Verification happens here without closing this conversation."}
          </p>
        </div>
      </div>

      {isProfileStep ? (
        <form className={styles.intakeForm} onSubmit={submitProfile}>
          <label>
            <span><b>1</b> Your name</span>
            <input
              autoComplete="name"
              value={personName}
              onChange={(event) => setPersonName(event.target.value)}
              placeholder="e.g. Taylor Reed"
              maxLength={120}
              required
            />
          </label>
          <label>
            <span><b>2</b> Company or product</span>
            <input
              autoComplete="organization"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="e.g. AcmeMonitor"
              maxLength={180}
              required
            />
          </label>
          <label>
            <span><b>3</b> What does it do?</span>
            <textarea
              value={companyDescription}
              onChange={(event) => setCompanyDescription(event.target.value)}
              placeholder="Describe it in one or two sentences."
              maxLength={600}
              rows={3}
              required
            />
          </label>
          <button type="submit" disabled={!profileComplete || busy}>
            {busy ? <LoaderCircle className="animate-spin" size={14} /> : <Check size={14} />}
            Continue
          </button>
        </form>
      ) : null}

      {step === "email" || step === "code" ? (
        <form className={styles.intakeForm} onSubmit={submitVerification}>
          <label>
            <span>{step === "email" ? "Work email" : "Six-digit verification code"}</span>
            <input
              autoComplete={step === "email" ? "email" : "one-time-code"}
              inputMode={step === "code" ? "numeric" : "email"}
              pattern={step === "code" ? "[0-9]{6}" : undefined}
              value={verificationValue}
              onChange={(event) =>
                step === "code" ? setCode(event.target.value) : setEmail(event.target.value)
              }
              placeholder={step === "email" ? "you@company.com" : "000000"}
              maxLength={step === "code" ? 6 : 255}
              required
            />
          </label>
          {step === "email" ? (
            <label>
              <span>Create a password</span>
              <input
                autoComplete="new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                maxLength={128}
                required
              />
            </label>
          ) : null}
          <p className={styles.intakeHint}>
            {step === "email"
              ? "This creates your secure PartnerBird account. We’ll email you a six-digit verification code."
              : `Code sent to ${contact?.email ?? "your email"}.`}
          </p>
          <button
            type="submit"
            disabled={
              busy ||
              !verificationValue.trim() ||
              (step === "email" && password.length < 8)
            }
          >
            {busy ? <LoaderCircle className="animate-spin" size={14} /> : <Mail size={14} />}
            {step === "email" ? "Create account & send code" : "Verify email"}
          </button>
          {step === "code" ? (
            <button
              className={styles.intakeSecondaryButton}
              type="button"
              onClick={onResendVerification}
              disabled={busy}
            >
              {busy ? <LoaderCircle className="animate-spin" size={14} /> : <RotateCcw size={14} />}
              Resend code
            </button>
          ) : null}
          {step === "email" ? (
            <p className={styles.intakeSignIn}>
              Already have a PartnerBird account? <Link href={signInHref}>Sign in</Link>
            </p>
          ) : null}
        </form>
      ) : null}

      {step === "member_approval" ? (
        <div className={styles.intakeAction}>
          <p><strong>Use your verified member email?</strong></p>
          <p>{viewer?.email} will be shared with this lead and attached to the conversation.</p>
          <button type="button" onClick={onApprove} disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" size={14} /> : <Check size={14} />}
            Approve and continue
          </button>
        </div>
      ) : null}
      {step === "ready" ? (
        <div className={styles.intakeAction}>
          <p><strong><CheckCircle2 size={15} /> Email verified</strong></p>
          <p>AI credits start only when you continue to Agent Chat.</p>
          <button type="button" onClick={onBegin} disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" size={14} /> : <Sparkles size={14} />}
            Continue to Agent Chat
          </button>
        </div>
      ) : null}
      {notice ? <div className={styles.intakeNotice} role="status">{notice}</div> : null}
      {error ? <div className={styles.streamError} role="alert"><span>{error}</span></div> : null}
    </div>
  );
}

function ChatWorkspace({
  profile,
  turns,
  conversationId,
  isSending,
  input,
  setInput,
  onSend,
  onExplore,
  onRetry,
  experience,
  controlMode,
  humanMessages,
  humanReplyError,
  contactStatus,
  themeVariables,
  lead,
  intakeStep,
  viewer,
  intakeError,
  intakeNotice,
  proposalCompletion,
  onSubmitProfile,
  onSubmitVerification,
  onResendVerification,
  onApproveEmail,
  onBeginAI,
  onProposalSubmitted,
  textSize,
  onTextSizeChange,
  signInHref,
}: {
  profile: PublicProfile;
  turns: ChatTurn[];
  conversationId?: string;
  isSending: boolean;
  input: string;
  setInput: (value: string) => void;
  onSend: (value: string, action?: TurnAction) => void;
  onExplore: (idea: PublicIdea) => void;
  onRetry: (turn: ChatTurn) => void;
  experience: "profile" | "demo";
  controlMode: "agent" | "owner";
  humanMessages: HumanConversationMessage[];
  humanReplyError?: string;
  contactStatus: ConversationContactStatus;
  themeVariables: CSSProperties;
  lead: LeadIntake;
  intakeStep: IntakeStep;
  viewer: ConversationContactStatus;
  intakeError?: string;
  intakeNotice?: string;
  proposalCompletion: ProposalCompletion | null;
  onSubmitProfile: (values: ProfileIntakeValues) => void;
  onSubmitVerification: (value: string, password?: string) => void;
  onResendVerification: () => void;
  onApproveEmail: () => void;
  onBeginAI: () => void;
  onProposalSubmitted: (completion: ProposalCompletion) => void;
  textSize: ChatTextSize;
  onTextSizeChange: (value: ChatTextSize) => void;
  signInHref: string;
}) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const hasPositionedTranscriptRef = useRef(false);

  useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    transcript.scrollTo({
      top: transcript.scrollHeight,
      behavior: hasPositionedTranscriptRef.current ? "smooth" : "auto",
    });
    hasPositionedTranscriptRef.current = true;
  }, [humanMessages, proposalCompletion, turns]);

  return (
    <motion.section
      layout
      className={`${styles.surface} ${styles.workspace} ${styles.contentReveal}`}
      aria-label="PartnerBird conversation"
    >
      <div className={styles.workspaceHeader}>
        <div className="flex items-center justify-between gap-3">
          <AgentHeader profile={profile} />
          <div className="flex items-center gap-2">
            <label className={styles.textSizeControl}>
              <span aria-hidden="true">Aa</span>
              <span className="sr-only">Chat text size</span>
              <select
                aria-label="Chat text size"
                value={textSize}
                onChange={(event) =>
                  onTextSizeChange(event.target.value as ChatTextSize)
                }
              >
                <option value="small">Small</option>
                <option value="standard">Standard</option>
                <option value="large">Large</option>
              </select>
            </label>
            {conversationId && contactStatus?.verified ? (
              <span className={`${styles.claimButton} ${styles.claimButtonVerified}`}>
                <CheckCircle2 size={13} />
                <span>Verified &amp; saved</span>
              </span>
            ) : null}
            <MobileContext profile={profile} themeVariables={themeVariables} />
          </div>
        </div>
      </div>
      <div
        ref={transcriptRef}
        className={styles.transcript}
        aria-live="polite"
        data-testid="chat-transcript"
      >
        {intakeStep !== "ready" || turns.length === 0 ? (
          <IntakeForm
            lead={lead}
            step={intakeStep}
            viewer={viewer}
            contact={contactStatus}
            error={intakeError}
            notice={intakeNotice}
            busy={isSending}
            onProfileSubmit={onSubmitProfile}
            onVerificationSubmit={onSubmitVerification}
            onResendVerification={onResendVerification}
            onApprove={onApproveEmail}
            onBegin={onBeginAI}
            signInHref={signInHref}
          />
        ) : null}

        {intakeStep === "ready" ? turns.map((turn) => (
          <ChatTurnView
            key={turn.id}
            turn={turn}
            conversationId={conversationId}
            profileName={profile.displayName}
            onExplore={onExplore}
            onRetry={onRetry}
            actionsDisabled={isSending || Boolean(proposalCompletion)}
            experience={experience}
            themeVariables={themeVariables}
            viewer={viewer}
            lead={lead}
            signInHref={signInHref}
            onProposalSubmitted={onProposalSubmitted}
          />
        )) : null}

        {controlMode === "owner" ? (
          <div className={styles.ownerControlNotice} role="status">
            <Hand size={15} aria-hidden="true" />
            {profile.displayName} has joined. PartnerBird is paused while you chat directly.
          </div>
        ) : null}

        {humanMessages.map((message) =>
          message.role === "visitor" ? (
            <div
              className={`${styles.messageRow} ${styles.messageRowUser}`}
              key={message.id}
            >
              <div>
                <div
                  className={`${styles.message} ${styles.messageUser}`}
                  data-testid="visitor-message"
                >
                  {message.content}
                </div>
                <div className={`${styles.time} text-right`}>Delivered to owner</div>
              </div>
            </div>
          ) : (
            <div className={styles.messageRow} key={message.id}>
              <span className={styles.ownerAvatar} aria-hidden="true">
                <Hand size={14} />
              </span>
              <div>
                <div className={`${styles.message} ${styles.messageOwner}`}>
                  {message.content}
                </div>
                <div className={styles.time}>{profile.displayName} · Owner</div>
              </div>
            </div>
          ),
        )}

        {humanReplyError ? (
          <div className={styles.streamError} role="alert">
            <MessageCircleMore size={16} aria-hidden="true" />
            <span>{humanReplyError}</span>
          </div>
        ) : null}

        {proposalCompletion ? (
          <ProposalCompletionCard
            profileName={profile.displayName}
            completion={proposalCompletion}
          />
        ) : null}
      </div>
      {intakeStep === "ready" && turns.length > 0 ? (
        <div className={styles.workspaceComposer} data-testid="workspace-composer">
        {controlMode === "agent" && !proposalCompletion ? <div className={styles.quickActions}>
          <button
            type="button"
            disabled={isSending}
            onClick={() => onSend("Ask me the most important qualification question.")}
          >
            <Users size={13} className="mr-1 inline" />Continue qualification
          </button>
          <button
            type="button"
            disabled={isSending}
            onClick={() => onSend("Be candid: is this actually a strong mutual fit?")}
          >
            <MessageCircleMore size={13} className="mr-1 inline" />Tell me honestly
          </button>
        </div> : null}
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={onSend}
          placeholder={
            proposalCompletion
              ? "Request submitted — refresh the page to continue chatting."
              : controlMode === "owner"
              ? `Reply directly to ${profile.displayName}…`
              : "Tell me more about your business or ask a question…"
          }
          disabled={isSending || Boolean(proposalCompletion)}
          label={controlMode === "owner" ? `Message ${profile.displayName}` : "Message PartnerBird"}
        />
        </div>
      ) : null}
    </motion.section>
  );
}

function ProposalCompletionCard({
  profileName,
  completion,
}: {
  profileName: string;
  completion: ProposalCompletion;
}) {
  return (
    <div
      className={styles.submissionComplete}
      data-testid="proposal-completion"
      role="status"
    >
      <div
        className={styles.submissionConfetti}
        data-testid="submission-confetti"
        aria-hidden="true"
      >
        {Array.from({ length: 12 }, (_, index) => <span key={index} />)}
      </div>
      <span className={styles.submissionCompleteIcon} aria-hidden="true">
        <CheckCircle2 size={24} />
      </span>
      <span className={styles.eyebrow}>Request submitted</span>
      <h3>Thank you — your partnership request is on its way.</h3>
      <p>
        {profileName} can now review “{completion.title}” and follow up using your
        verified email.
        {completion.resumeEmailSent
          ? " We also sent you a private link to return to this conversation."
          : " You can safely close this chat now."}
      </p>
      <small>The reply field is paused for this visit. Refresh the page if you need to continue.</small>
    </div>
  );
}

const analysisStages: Array<{ key: AnalysisStage; label: string }> = [
  { key: "understand_business", label: "Understand business" },
  { key: "compare_audiences", label: "Compare audiences" },
  { key: "find_angles", label: "Find collaboration angles" },
  { key: "assess_fit", label: "Assess fit" },
];

function ChatTurnView({
  turn,
  conversationId,
  profileName,
  onExplore,
  onRetry,
  actionsDisabled,
  experience,
  themeVariables,
  viewer,
  lead,
  signInHref,
  onProposalSubmitted,
}: {
  turn: ChatTurn;
  conversationId?: string;
  profileName: string;
  onExplore: (idea: PublicIdea) => void;
  onRetry: (turn: ChatTurn) => void;
  actionsDisabled: boolean;
  experience: "profile" | "demo";
  themeVariables: CSSProperties;
  viewer: ConversationContactStatus;
  lead: LeadIntake;
  signInHref: string;
  onProposalSubmitted: (completion: ProposalCompletion) => void;
}) {
  return (
    <div className={styles.turnGroup} data-testid="chat-turn">
      {!turn.hideVisitorMessage ? (
        <div className={`${styles.messageRow} ${styles.messageRowUser}`}>
          <div>
            <div
              className={`${styles.message} ${styles.messageUser}`}
              data-testid="visitor-message"
            >
              {turn.message}
            </div>
            <div className={`${styles.time} text-right`}>Just now · delivered</div>
          </div>
        </div>
      ) : null}

      <div className={styles.analysisStrip} aria-label="Analysis progress">
        {analysisStages.map(({ key, label }) => {
          const state = turn.stages[key] ?? "waiting";
          return (
            <div
              key={key}
              className={`${styles.analysisStep} ${
                state === "done" ? styles.analysisStepDone : ""
              } ${state === "active" ? styles.analysisStepActive : ""}`}
            >
              <span className={styles.stepDot}>
                {state === "done" ? (
                  <Check size={11} />
                ) : state === "active" ? (
                  <LoaderCircle className="animate-spin" size={11} />
                ) : null}
              </span>
              {label}
            </div>
          );
        })}
      </div>

      {turn.assistant || (!turn.isComplete && !turn.error) ? (
        <div className={styles.messageRow}>
          <AgentOrb small />
          <div>
            <div className={styles.message} data-testid="assistant-message">
              {turn.assistant || <TypingIndicator />}
            </div>
            <div className={styles.time}>
              {turn.isComplete ? "A moment ago" : `${profileName}’s PartnerBird is thinking…`}
            </div>
          </div>
        </div>
      ) : null}

      {turn.error ? (
        <div className={styles.streamError} role="alert">
          <MessageCircleMore size={16} aria-hidden="true" />
          <span>{turn.error}</span>
          <button
            className={styles.retryButton}
            disabled={actionsDisabled}
            onClick={() => onRetry(turn)}
            type="button"
          >
            <RotateCcw size={13} aria-hidden="true" /> Try again
          </button>
        </div>
      ) : null}

      {turn.quotaFallback && conversationId && experience === "profile" ? (
        <div className={styles.limitFallback} data-testid="usage-limit-fallback">
          <div>
            <span className={styles.eyebrow}>PartnerBird is still open</span>
            <h3>{turn.quotaFallback.title}</h3>
            <p>{turn.quotaFallback.description}</p>
          </div>
          <ManualProposalDialog
            conversationId={conversationId}
            profileName={profileName}
            label={turn.quotaFallback.actionLabel}
            themeVariables={themeVariables}
            visitorName={lead?.personName ?? undefined}
            visitorEmail={viewer?.email}
            disabled={actionsDisabled}
            onSubmitted={onProposalSubmitted}
          />
        </div>
      ) : null}

      {turn.fit ? <FitSummary fit={turn.fit} /> : null}

      {turn.ideas.length > 0 ? (
        <div className={styles.ideaGrid} data-testid="idea-grid">
          {turn.ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              conversationId={conversationId}
              profileName={profileName}
              canSubmit={
                turn.isComplete &&
                !turn.error &&
                !actionsDisabled &&
                turn.nextState !== "PROPOSAL_SENT"
              }
              onExplore={onExplore}
              actionsDisabled={actionsDisabled}
              experience={experience}
              themeVariables={themeVariables}
              viewer={viewer}
              lead={lead}
              signInHref={signInHref}
              onSubmitted={onProposalSubmitted}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TypingIndicator() {
  return (
    <span className={styles.typingIndicator} aria-label="PartnerBird is thinking">
      <span />
      <span />
      <span />
    </span>
  );
}

function FitSummary({ fit }: { fit: PublicFit }) {
  const noFit = fit.label === "Not a Fit" || fit.label === "Weak Fit";
  return (
    <div
      className={`${styles.fitSummary} ${noFit ? styles.fitSummaryNo : ""}`}
      data-testid="fit-summary"
    >
      <span
        className={`${styles.fitBadge} ${
          fit.label === "Good Fit" || fit.label === "Worth Exploring"
            ? styles.fitBadgeGood
            : ""
        }`}
      >
        {fit.label.toUpperCase()}
      </span>
      <p>{fit.rationale}</p>
      {fit.concerns.length > 0 ? (
        <ul>
          {fit.concerns.slice(0, 3).map((concern) => (
            <li key={concern}>{concern}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function IdeaCard({
  idea,
  conversationId,
  profileName,
  canSubmit,
  onExplore,
  actionsDisabled,
  experience,
  themeVariables,
  viewer,
  lead,
  signInHref,
  onSubmitted,
}: {
  idea: PublicIdea;
  conversationId?: string;
  profileName: string;
  canSubmit: boolean;
  onExplore: (idea: PublicIdea) => void;
  actionsDisabled: boolean;
  experience: "profile" | "demo";
  themeVariables: CSSProperties;
  viewer: ConversationContactStatus;
  lead: LeadIntake;
  signInHref: string;
  onSubmitted: (completion: ProposalCompletion) => void;
}) {
  return (
    <article className={styles.ideaCard} data-testid="idea-card">
      <span
        className={`${styles.fitBadge} ${
          idea.fitLabel === "Good Fit" || idea.fitLabel === "Worth Exploring"
            ? styles.fitBadgeGood
            : ""
        }`}
      >
        {idea.fitLabel.toUpperCase()}
      </span>
      <h3>{idea.type}</h3>
      <p><strong>“{idea.title}”</strong></p>
      <p className="mt-2">{idea.description}</p>
      <p className="mt-2"><strong>Why it works:</strong> {idea.whyItWorks}</p>
      <div className={styles.ideaActions}>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={actionsDisabled}
          onClick={() => onExplore(idea)}
        >
          Explore idea
        </button>
        {experience === "demo" && !viewer?.verified ? (
          <Link href={signInHref} className={styles.solidButton}>
            Submit with PartnerBird
          </Link>
        ) : (
          <ProposalDialog
            idea={idea}
            conversationId={conversationId}
            profileName={profileName}
            enabled={canSubmit}
            themeVariables={themeVariables}
            triggerLabel={experience === "demo" ? "Submit with PartnerBird" : "Send proposal"}
            visitorName={lead?.personName ?? undefined}
            visitorEmail={viewer?.email}
            onSubmitted={onSubmitted}
          />
        )}
      </div>
    </article>
  );
}

function ProposalDialog({
  idea,
  conversationId,
  profileName,
  enabled,
  themeVariables,
  triggerLabel = "Send proposal",
  visitorName,
  visitorEmail,
  onSubmitted,
}: {
  idea: PublicIdea;
  conversationId?: string;
  profileName: string;
  enabled: boolean;
  themeVariables: CSSProperties;
  triggerLabel?: string;
  visitorName?: string;
  visitorEmail?: string;
  onSubmitted: (completion: ProposalCompletion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const [resumeEmailSent, setResumeEmailSent] = useState(false);

  async function submitProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conversationId || !enabled || status === "sending") return;
    const form = new FormData(event.currentTarget);
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/public/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "idea",
          conversationId,
          ideaId: idea.id,
          visitorName: form.get("visitorName"),
          visitorEmail: form.get("visitorEmail"),
        }),
      });
      const responseText = await response.text();
      let payload: { error?: string; resumeEmailSent?: boolean } = {};
      try {
        payload = responseText
          ? (JSON.parse(responseText) as { error?: string; resumeEmailSent?: boolean })
          : {};
      } catch {
        payload = {};
      }
      if (!response.ok) throw new Error(payload.error || "The proposal could not be sent.");
      const sentResumeEmail = Boolean(payload.resumeEmailSent);
      setResumeEmailSent(sentResumeEmail);
      setStatus("sent");
      onSubmitted({ title: idea.title, resumeEmailSent: sentResumeEmail });
      setOpen(false);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The proposal could not be sent.",
      );
      setStatus("error");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen && status !== "sent") setStatus("idle");
    }}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={styles.solidButton}
          disabled={!conversationId || !enabled}
          title={enabled ? undefined : "Wait for PartnerBird to finish this idea"}
        >
          {triggerLabel}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.proposalOverlay} />
        <Dialog.Content
          className={styles.proposalDialog}
          data-testid="proposal-dialog"
          style={themeVariables}
        >
          <div className={styles.proposalHeader}>
            <div>
              <span className={styles.eyebrow}>Partnership proposal</span>
              <Dialog.Title>{idea.title}</Dialog.Title>
              <Dialog.Description>
                Share this concise brief with {profileName}. Your contact details are only
                used to follow up on this proposal.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close proposal"><X size={17} /></Dialog.Close>
          </div>

          {status === "sent" ? (
            <div className={styles.proposalSuccess} role="status">
              <CheckCircle2 size={34} aria-hidden="true" />
              <h3>Proposal sent</h3>
              <p>
                {profileName} can now review the idea and your contact details.
                {resumeEmailSent
                  ? " We also emailed your private continuation link."
                  : " The owner can follow up using your work email."}
              </p>
              <Dialog.Close className={styles.solidButton}>Done</Dialog.Close>
            </div>
          ) : (
            <form onSubmit={submitProposal} className={styles.proposalForm}>
              <div className={styles.proposalBrief}>
                <p><strong>Concept</strong>{idea.description}</p>
                <p><strong>Activation</strong>{idea.activation}</p>
                <p><strong>Mutual value</strong>{idea.mutualValue}</p>
              </div>
              <label>
                Your name
                <input name="visitorName" minLength={2} maxLength={120} required autoComplete="name" defaultValue={visitorName} readOnly={Boolean(visitorName)} />
              </label>
              <label>
                Work email
                <input name="visitorEmail" type="email" maxLength={255} required autoComplete="email" defaultValue={visitorEmail} readOnly={Boolean(visitorEmail)} />
              </label>
              {error ? <p className={styles.formError} role="alert">{error}</p> : null}
              <button type="submit" className={styles.solidButton} disabled={status === "sending"}>
                {status === "sending" ? <><LoaderCircle className="animate-spin" size={15} /> Sending…</> : "Send to owner"}
              </button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ManualProposalDialog({
  conversationId,
  profileName,
  label,
  themeVariables,
  visitorName,
  visitorEmail,
  disabled,
  onSubmitted,
}: {
  conversationId: string;
  profileName: string;
  label: string;
  themeVariables: CSSProperties;
  visitorName?: string;
  visitorEmail?: string;
  disabled: boolean;
  onSubmitted: (completion: ProposalCompletion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    const form = new FormData(event.currentTarget);
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/public/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "manual",
          conversationId,
          visitorName: form.get("visitorName"),
          visitorEmail: form.get("visitorEmail"),
          title: form.get("title"),
          concept: form.get("concept"),
          possibleActivation: form.get("possibleActivation"),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        resumeEmailSent?: boolean;
      };
      if (!response.ok) throw new Error(payload.error || "The proposal could not be sent.");
      setStatus("sent");
      onSubmitted({
        title: String(form.get("title") ?? "Partnership request"),
        resumeEmailSent: Boolean(payload.resumeEmailSent),
      });
      setOpen(false);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The proposal could not be sent.",
      );
      setStatus("error");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className={styles.solidButton} disabled={disabled}>{label}</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.proposalOverlay} />
        <Dialog.Content className={styles.proposalDialog} style={themeVariables}>
          <div className={styles.proposalHeader}>
            <div>
              <span className={styles.eyebrow}>Direct partnership proposal</span>
              <Dialog.Title>Send your idea to {profileName}</Dialog.Title>
              <Dialog.Description>
                AI assistance is paused, but the owner can still review a clear, structured proposal.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close proposal"><X size={17} /></Dialog.Close>
          </div>
          {status === "sent" ? (
            <div className={styles.proposalSuccess} role="status">
              <CheckCircle2 size={34} aria-hidden="true" />
              <h3>Proposal sent</h3>
              <p>{profileName} can review your idea and follow up using your work email.</p>
              <Dialog.Close className={styles.solidButton}>Done</Dialog.Close>
            </div>
          ) : (
            <form onSubmit={submit} className={styles.proposalForm}>
              <label>Your name<input name="visitorName" minLength={2} maxLength={120} required autoComplete="name" defaultValue={visitorName} readOnly={Boolean(visitorName)} /></label>
              <label>Work email<input name="visitorEmail" type="email" maxLength={255} required autoComplete="email" defaultValue={visitorEmail} readOnly={Boolean(visitorEmail)} /></label>
              <label>Proposal title<input name="title" minLength={5} maxLength={220} required placeholder="A concise collaboration idea" /></label>
              <label>What are you proposing?<textarea name="concept" minLength={20} maxLength={2400} required placeholder="Explain the idea, what each side contributes, and why it could be useful." /></label>
              <label>Possible activation <span className={styles.optionalLabel}>Optional</span><input name="possibleActivation" maxLength={600} placeholder="Newsletter, event, guide, integration…" /></label>
              {error ? <p className={styles.formError} role="alert">{error}</p> : null}
              <button type="submit" className={styles.solidButton} disabled={status === "sending"}>
                {status === "sending" ? <><LoaderCircle className="animate-spin" size={15} /> Sending…</> : "Send to owner"}
              </button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PartnerBirdShell({
  profile,
  entryMode = "NORMAL",
  initialChat = false,
  initialConversationId,
  experience = "profile",
  initialViewer = null,
}: PartnerBirdShellProps) {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<Mode>(
    initialChat && profile.isOpen ? "transition" : "lobby",
  );
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [isSending, setIsSending] = useState(false);
  const [conversationControl, setConversationControl] = useState<"agent" | "owner">("agent");
  const [humanMessages, setHumanMessages] = useState<HumanConversationMessage[]>([]);
  const [humanReplyError, setHumanReplyError] = useState<string>();
  const [contactStatus, setContactStatus] = useState<ConversationContactStatus>(null);
  const [leadIntake, setLeadIntake] = useState<LeadIntake>(null);
  const [viewer, setViewer] = useState<ConversationContactStatus>(initialViewer);
  const [pendingIntent, setPendingIntent] = useState("See if we’re a fit");
  const [intakeError, setIntakeError] = useState<string>();
  const [intakeNotice, setIntakeNotice] = useState<string>();
  const [proposalCompletion, setProposalCompletion] = useState<ProposalCompletion | null>(null);
  const [storedConversationAvailable, setStoredConversationAvailable] = useState(false);
  const chatTextSize = useSyncExternalStore(
    subscribeToChatTextSize,
    getStoredChatTextSize,
    (): ChatTextSize => "standard",
  );
  const requestControllerRef = useRef<AbortController | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const transitionFrameRef = useRef<number | null>(null);
  const transitionSequenceRef = useRef(0);
  const busyRef = useRef(false);
  const handoffStartedRef = useRef(false);

  const updateChatTextSize = useCallback((value: ChatTextSize) => {
    window.localStorage.setItem(chatTextSizeStorageKey, value);
    window.dispatchEvent(new Event(chatTextSizeChangeEvent));
  }, []);
  const profileTheme = useMemo(
    () =>
      resolveProfileTheme(
        profile.appearance?.accentPreset,
        profile.appearance?.primaryColor,
      ),
    [profile.appearance?.accentPreset, profile.appearance?.primaryColor],
  );
  const profileThemeVariables = useMemo(
    () =>
      getProfileThemeVariables(
        profile.appearance?.accentPreset,
        profile.appearance?.primaryColor,
      ) as CSSProperties,
    [profile.appearance?.accentPreset, profile.appearance?.primaryColor],
  );
  const portalThemeVariables = useMemo(
    () =>
      ({
        ...profileThemeVariables,
        "--green": "var(--profile-primary)",
        "--green-hover": "var(--profile-primary-hover)",
        "--green-strong":
          "color-mix(in srgb, var(--profile-primary) 45%, var(--ink))",
        "--green-border":
          "color-mix(in srgb, var(--profile-primary) 28%, var(--surface))",
        "--mint":
          "color-mix(in srgb, var(--profile-primary) 8%, var(--surface))",
        "--mint-strong":
          "color-mix(in srgb, var(--profile-primary) 15%, var(--surface))",
        "--on-accent": "var(--profile-on-accent)",
        "--chat-text": chatTextSize === "small" ? "12px" : chatTextSize === "large" ? "16px" : "14px",
        "--chat-meta": chatTextSize === "small" ? "11px" : chatTextSize === "large" ? "14px" : "12px",
        "--chat-heading": chatTextSize === "small" ? "15px" : chatTextSize === "large" ? "19px" : "17px",
      }) as CSSProperties,
    [chatTextSize, profileThemeVariables],
  );

  const layoutTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : { type: "tween" as const, duration: 0.62, ease: calmLayoutEase },
    [reduceMotion],
  );

  const restoreConversation = useCallback(
    async (id: string) => {
      const response = await fetch(
        `/api/public/conversations/${encodeURIComponent(id)}/messages?history=1`,
        { cache: "no-store" },
      ).catch(() => null);
      if (!response?.ok) {
        if (window.localStorage.getItem(conversationStorageKey(profile.handle)) === id) {
          window.localStorage.removeItem(conversationStorageKey(profile.handle));
        }
        setConversationId((current) => (current === id ? undefined : current));
        setConversationControl("agent");
        setTurns([]);
        setHumanMessages([]);
        setContactStatus(null);
        setLeadIntake(null);
        setStoredConversationAvailable(false);
        return false;
      }

      const payload = (await response.json()) as ConversationSyncPayload;
      setConversationId(id);
      setConversationControl(payload.controlMode === "owner" ? "owner" : "agent");
      const canShowConversation = Boolean(
        payload.lead?.intakeCompletedAt && payload.contact?.verified,
      );
      setHumanMessages(canShowConversation ? payload.messages ?? [] : []);
      setTurns(canShowConversation ? hydrateStoredTurns(payload) : []);
      setContactStatus(payload.contact ?? null);
      setLeadIntake(payload.lead ?? null);
      setViewer(payload.viewer ?? initialViewer);
      setPendingIntent(payload.lead?.initialIntent ?? "See if we’re a fit");
      window.localStorage.setItem(conversationStorageKey(profile.handle), id);
      setStoredConversationAvailable(true);
      return true;
    },
    [initialViewer, profile.handle],
  );

  useEffect(() => {
    if (!profile.isOpen) return;
    const storedId = window.localStorage.getItem(conversationStorageKey(profile.handle));
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return;
      setStoredConversationAvailable(Boolean(storedId));
      if (!initialChat && !storedId) return;

      const targetId = initialConversationId ?? storedId;
      if (!targetId) {
        setMode("chat");
        return;
      }

      setMode("transition");
      const minimumSkeleton = reduceMotion ? Promise.resolve() : wait(420);
      void Promise.all([restoreConversation(targetId), minimumSkeleton]).then(([restored]) => {
        if (cancelled) return;
        const nextUrl = new URL(window.location.href);
        if (restored) {
          nextUrl.searchParams.set("chat", "1");
          nextUrl.searchParams.set("conversation", targetId);
        } else {
          nextUrl.searchParams.delete("conversation");
        }
        nextUrl.searchParams.delete("resumed");
        window.history.replaceState({ chat: true }, "", nextUrl);
        setMode("chat");
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [
    initialChat,
    initialConversationId,
    profile.handle,
    profile.isOpen,
    reduceMotion,
    restoreConversation,
  ]);

  useEffect(() => {
    const onPopState = () => {
      transitionSequenceRef.current += 1;
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
      if (transitionFrameRef.current !== null) {
        window.cancelAnimationFrame(transitionFrameRef.current);
        transitionFrameRef.current = null;
      }

      const shouldShowChat =
        profile.isOpen &&
        new URL(window.location.href).searchParams.get("chat") === "1";
      if (!shouldShowChat && requestControllerRef.current) {
        const activeController = requestControllerRef.current;
        requestControllerRef.current = null;
        activeController.abort();
        busyRef.current = false;
        setIsSending(false);
        setTurns((current) => current.filter((turn) => turn.isComplete));
      }
      setMode(shouldShowChat ? "chat" : "lobby");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [profile.isOpen]);

  useEffect(() => {
    return () => {
      transitionSequenceRef.current += 1;
      const activeController = requestControllerRef.current;
      requestControllerRef.current = null;
      activeController?.abort();
      busyRef.current = false;
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
      if (transitionFrameRef.current !== null) {
        window.cancelAnimationFrame(transitionFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (experience !== "profile" || !conversationId) return;
    let cancelled = false;

    const syncOwnerConversation = async () => {
      const response = await fetch(
        `/api/public/conversations/${encodeURIComponent(conversationId)}/messages`,
        { cache: "no-store" },
      ).catch(() => null);
      if (!response?.ok || cancelled) return;
      const payload = (await response.json()) as {
        controlMode?: string;
        contact?: ConversationContactStatus;
        messages?: Array<{
          id: string;
          role: string;
          content: string;
          createdAt: string;
        }>;
      };
      if (cancelled) return;
      setConversationControl(payload.controlMode === "owner" ? "owner" : "agent");
      setHumanMessages(
        (payload.messages ?? []).filter(
          (message): message is HumanConversationMessage =>
            (message.role === "owner" || message.role === "visitor") &&
            Boolean(message.id && message.content),
        ),
      );
      setContactStatus(payload.contact ?? null);
    };

    void syncOwnerConversation();
    const interval = window.setInterval(syncOwnerConversation, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [conversationId, experience]);

  function continueStoredConversation() {
    const storedId = window.localStorage.getItem(conversationStorageKey(profile.handle));
    if (!storedId || mode !== "lobby") return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("chat", "1");
    nextUrl.searchParams.set("conversation", storedId);
    window.history.pushState({ chat: true }, "", nextUrl);
    setMode("transition");
    const minimumSkeleton = reduceMotion ? Promise.resolve() : wait(420);
    void Promise.all([restoreConversation(storedId), minimumSkeleton]).then(([restored]) => {
      if (restored) setMode("chat");
      else {
        nextUrl.searchParams.delete("conversation");
        window.history.replaceState({ chat: true }, "", nextUrl);
        setMode("chat");
      }
    });
  }

  function startChat(message: string) {
    if (!profile.isOpen || mode !== "lobby") return;
    const nextMessage = message.trim() || "See if we’re a fit";
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("chat", "1");
    nextUrl.searchParams.delete("conversation");
    window.history.pushState({ chat: true }, "", nextUrl);
    setConversationId(undefined);
    setTurns([]);
    setHumanMessages([]);
    setContactStatus(null);
    setLeadIntake(null);
    setIntakeError(undefined);
    setPendingIntent(nextMessage);
    setConversationControl("agent");

    if (reduceMotion) {
      setMode("chat");
      return;
    }

    const transitionSequence = transitionSequenceRef.current + 1;
    transitionSequenceRef.current = transitionSequence;
    setMode("transition");
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      if (transitionSequenceRef.current === transitionSequence) setMode("chat");
    }, CHAT_LAYOUT_SETTLE_MS);
  }

  const intakeStep = resolveIntakeStep(leadIntake, contactStatus, viewer);

  async function submitProfileIntake(values: ProfileIntakeValues) {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsSending(true);
    setIntakeError(undefined);
    try {
      const endpoint = `/api/public/profiles/${encodeURIComponent(profile.handle)}/intake`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_profile",
          conversationId,
          ...values,
          initialIntent: pendingIntent,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            conversationId?: string;
            lead?: NonNullable<LeadIntake>;
            error?: string;
          }
        | null;
      if (!response.ok) throw new Error(payload?.error || "Your details could not be saved.");

      if (payload?.conversationId) {
        setConversationId(payload.conversationId);
        window.localStorage.setItem(conversationStorageKey(profile.handle), payload.conversationId);
        setStoredConversationAvailable(true);
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("chat", "1");
        nextUrl.searchParams.set("conversation", payload.conversationId);
        window.history.replaceState({ chat: true }, "", nextUrl);
      }
      if (payload?.lead) setLeadIntake(payload.lead);
    } catch (error) {
      setIntakeError(error instanceof Error ? error.message : "Your details could not be saved.");
    } finally {
      busyRef.current = false;
      setIsSending(false);
    }
  }

  async function submitVerification(value: string, password?: string) {
    if (busyRef.current || !conversationId) return;
    const normalized = value.trim();
    if (!normalized || (intakeStep !== "email" && intakeStep !== "code")) return;
    busyRef.current = true;
    setIsSending(true);
    setIntakeError(undefined);
    setIntakeNotice(undefined);
    try {
      const response = await fetch(
        `/api/public/profiles/${encodeURIComponent(profile.handle)}/intake`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            intakeStep === "email"
              ? {
                  action: "request_verification",
                  conversationId,
                  email: normalized,
                  password,
                }
              : {
                  action: "verify_code",
                  conversationId,
                  email: contactStatus?.email,
                  code: normalized.replace(/\s+/g, ""),
                },
          ),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { verified?: boolean; email?: string; error?: string }
        | null;
      if (!response.ok) throw new Error(payload?.error || "Email verification failed.");

      if (intakeStep === "email") {
        setContactStatus({
          email: normalized.toLowerCase(),
          verified: false,
          accountCreated: true,
        });
      }
      if (payload?.verified) {
        const email = payload.email || contactStatus?.email || normalized.toLowerCase();
        setContactStatus({ email, verified: true, accountCreated: true });
        setViewer({ email, verified: true, accountCreated: true });
      }
    } catch (error) {
      setIntakeError(error instanceof Error ? error.message : "Email verification failed.");
    } finally {
      busyRef.current = false;
      setIsSending(false);
    }
  }

  async function resendVerification() {
    if (busyRef.current || !conversationId || intakeStep !== "code") return;
    busyRef.current = true;
    setIsSending(true);
    setIntakeError(undefined);
    setIntakeNotice(undefined);
    try {
      const response = await fetch(
        `/api/public/profiles/${encodeURIComponent(profile.handle)}/intake`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resend_verification", conversationId }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { sent?: boolean; code?: string; error?: string }
        | null;
      if (!response.ok || !payload?.sent) {
        if (payload?.code === "account_setup_required") setContactStatus(null);
        throw new Error(payload?.error || "A new verification code could not be sent.");
      }
      setIntakeNotice("A new verification code was sent. Check your inbox and spam folder.");
    } catch (error) {
      setIntakeError(
        error instanceof Error
          ? error.message
          : "A new verification code could not be sent.",
      );
    } finally {
      busyRef.current = false;
      setIsSending(false);
    }
  }

  async function approveMemberEmail() {
    if (!conversationId || busyRef.current || !viewer?.verified) return;
    busyRef.current = true;
    setIsSending(true);
    setIntakeError(undefined);
    try {
      const response = await fetch(
        `/api/public/profiles/${encodeURIComponent(profile.handle)}/intake`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve_member_email", conversationId }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { verified?: boolean; email?: string; error?: string }
        | null;
      if (!response.ok || !payload?.verified) {
        throw new Error(payload?.error || "Your verified email could not be attached.");
      }
      setContactStatus({ email: payload.email || viewer.email, verified: true });
    } catch (error) {
      setIntakeError(
        error instanceof Error ? error.message : "Your verified email could not be attached.",
      );
    } finally {
      busyRef.current = false;
      setIsSending(false);
    }
  }

  function beginVerifiedAIChat() {
    if (!conversationId || !leadIntake?.intakeCompletedAt || !contactStatus?.verified) return;
    setIntakeError(undefined);
    void sendTurn(firstAgentMessage(leadIntake), "message", undefined, conversationId, true);
  }

  async function sendTurn(
    rawMessage: string,
    requestedAction?: TurnAction,
    ideaId?: string,
    conversationOverride?: string | null,
    hideVisitorMessage = false,
  ) {
    if (busyRef.current) return;
    const message = normalizeVisitorInput(rawMessage);
    if (!message) return;
    const activeConversationId =
      conversationOverride === null ? undefined : conversationOverride ?? conversationId;
    if (
      experience === "profile" &&
      activeConversationId &&
      conversationControl === "owner"
    ) {
      await sendOwnerControlledMessage(message);
      return;
    }

    const turnId = crypto.randomUUID();
    const action = requestedAction ?? (/^https?:\/\//i.test(message) ? "analyze_url" : "message");
    const demoHistory =
      experience === "demo"
        ? turns.filter((turn) => !turn.error).slice(-4).flatMap((turn) => [
            { role: "visitor" as const, content: turn.message.slice(0, 2000) },
            ...(turn.assistant
              ? [{ role: "assistant" as const, content: turn.assistant.slice(0, 2000) }]
              : []),
          ])
        : undefined;
    const selectedIdea = ideaId
      ? turns.flatMap((turn) => turn.ideas).find((idea) => idea.id === ideaId)
      : undefined;
    const nextTurn: ChatTurn = {
      id: turnId,
      message,
      assistant: "",
      stages: { understand_business: "active" },
      ideas: [],
      isComplete: false,
      action,
      ideaId,
      hideVisitorMessage,
    };

    busyRef.current = true;
    setIsSending(true);
    setInput("");
    setTurns((current) => [...current, nextTurn]);

    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const turnEndpoint =
        experience === "demo"
          ? "/api/demo/turns"
          : `/api/public/profiles/${encodeURIComponent(profile.handle)}/turns`;
      const response = await fetch(turnEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          ideaId,
          message,
          action,
          idempotencyKey: crypto.randomUUID(),
          ...(experience === "demo"
            ? {
                history: demoHistory,
                ideaContext: selectedIdea
                  ? [
                      `Type: ${selectedIdea.type}`,
                      `Title: ${selectedIdea.title}`,
                      `Description: ${selectedIdea.description}`,
                      `Why it works: ${selectedIdea.whyItWorks}`,
                      `Activation: ${selectedIdea.activation}`,
                    ]
                      .join("\n")
                      .slice(0, 2400)
                  : undefined,
              }
            : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          code?: string;
          error?: string;
          conversationId?: string;
          fallback?: {
            title: string;
            description: string;
            actionLabel: string;
          };
        } | null;
        if (payload?.code === "owner_controlled" && conversationId) {
          setConversationControl("owner");
          setTurns((current) => current.filter((turn) => turn.id !== turnId));
          busyRef.current = false;
          setIsSending(false);
          await sendOwnerControlledMessage(message);
          return;
        }
        if (payload?.fallback && experience === "profile") {
          const fallbackConversationId = payload.conversationId ?? activeConversationId;
          if (fallbackConversationId) {
            setConversationId(fallbackConversationId);
            window.localStorage.setItem(
              conversationStorageKey(profile.handle),
              fallbackConversationId,
            );
            setStoredConversationAvailable(true);
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.set("chat", "1");
            nextUrl.searchParams.set("conversation", fallbackConversationId);
            window.history.replaceState({ chat: true }, "", nextUrl);
          }
          updateTurn(turnId, (turn) => ({
            ...turn,
            stages: completeActiveStages(turn.stages),
            quotaFallback: payload.fallback,
            isComplete: true,
          }));
          return;
        }
        throw new Error(payload?.error || "PartnerBird could not respond just now.");
      }
      if (!response.body) throw new Error("PartnerBird returned an empty response.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          applyAgentEvent(turnId, JSON.parse(line) as PublicAgentEvent);
        }
      }
      if (buffer.trim()) applyAgentEvent(turnId, JSON.parse(buffer) as PublicAgentEvent);
    } catch (error) {
      if (controller.signal.aborted) return;
      const messageText =
        error instanceof Error ? error.message : "PartnerBird could not respond just now.";
      updateTurn(turnId, (turn) => ({
        ...turn,
        stages: completeActiveStages(turn.stages),
        error: messageText,
        isComplete: true,
      }));
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        busyRef.current = false;
        setIsSending(false);
      }
    }
  }

  const startHandoffTurn = useEffectEvent(() => {
    if (!conversationId || !leadIntake?.intakeCompletedAt || !contactStatus?.verified) return;
    void sendTurn(firstAgentMessage(leadIntake), "message", undefined, conversationId, true);
  });

  useEffect(() => {
    if (
      entryMode !== "WEBMCP_HANDOFF" ||
      mode !== "chat" ||
      !conversationId ||
      !leadIntake?.intakeCompletedAt ||
      !contactStatus?.verified ||
      turns.length > 0 ||
      handoffStartedRef.current
    ) return;
    handoffStartedRef.current = true;
    startHandoffTurn();
  }, [
    contactStatus?.verified,
    conversationId,
    entryMode,
    leadIntake?.intakeCompletedAt,
    mode,
    turns.length,
  ]);

  function applyAgentEvent(turnId: string, event: PublicAgentEvent) {
    if (event.type === "conversation") {
      setConversationId(event.conversationId);
      if (experience === "profile") {
        window.localStorage.setItem(
          conversationStorageKey(profile.handle),
          event.conversationId,
        );
        setStoredConversationAvailable(true);
        const nextUrl = new URL(window.location.href);
        if (nextUrl.searchParams.get("chat") === "1") {
          nextUrl.searchParams.set("conversation", event.conversationId);
          window.history.replaceState({ chat: true }, "", nextUrl);
        }
      }
      return;
    }
    if (event.type === "status") {
      updateTurn(turnId, (turn) => ({
        ...turn,
        stages: { ...turn.stages, [event.stage]: event.state },
      }));
      return;
    }
    if (event.type === "assistant_delta") {
      updateTurn(turnId, (turn) => ({
        ...turn,
        assistant: `${turn.assistant}${event.delta}`,
      }));
      return;
    }
    if (event.type === "fit") {
      updateTurn(turnId, (turn) => ({ ...turn, fit: event.fit }));
      return;
    }
    if (event.type === "ideas") {
      updateTurn(turnId, (turn) => ({ ...turn, ideas: event.ideas }));
      return;
    }
    if (event.type === "error") {
      if (event.code === "owner_controlled") setConversationControl("owner");
      updateTurn(turnId, (turn) => ({
        ...turn,
        stages: completeActiveStages(turn.stages),
        error: event.message,
        isComplete: true,
      }));
      return;
    }
    if (event.type === "done") {
      updateTurn(turnId, (turn) => ({
        ...turn,
        nextState: event.state,
        isComplete: true,
      }));
    }
  }

  function updateTurn(turnId: string, updater: (turn: ChatTurn) => ChatTurn) {
    setTurns((current) =>
      current.map((turn) => (turn.id === turnId ? updater(turn) : turn)),
    );
  }

  async function sendOwnerControlledMessage(message: string) {
    if (!conversationId || busyRef.current) return;
    busyRef.current = true;
    setIsSending(true);
    setInput("");
    setHumanReplyError(undefined);
    try {
      const response = await fetch(
        `/api/public/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | HumanConversationMessage
        | { error?: string }
        | null;
      if (!response.ok || !payload || !("id" in payload)) {
        throw new Error(
          (payload && "error" in payload && payload.error) ||
            "Your reply could not be delivered.",
        );
      }
      setHumanMessages((current) =>
        current.some((item) => item.id === payload.id)
          ? current
          : [...current, payload],
      );
    } catch (error) {
      setInput(message);
      setHumanReplyError(
        error instanceof Error ? error.message : "Your reply could not be delivered.",
      );
    } finally {
      busyRef.current = false;
      setIsSending(false);
    }
  }

  function exploreIdea(idea: PublicIdea) {
    void sendTurn(
      `Tell me more about “${idea.title}”. Clarify what each side would contribute and the first practical step.`,
      "explore_idea",
      idea.id,
    );
  }

  function retryTurn(turn: ChatTurn) {
    void sendTurn(turn.message, turn.action, turn.ideaId, undefined, turn.hideVisitorMessage);
  }

  const conversationPath = `/@${profile.handle}`;
  const conversationReturnTo = conversationId
    ? `${conversationPath}?chat=1&conversation=${encodeURIComponent(conversationId)}`
    : `${conversationPath}?chat=1`;
  const signInHref = `/login?returnTo=${encodeURIComponent(conversationReturnTo)}`;

  return (
    <div
      className={styles.page}
      data-accent={profileTheme.preset.id}
      data-theme-source={profileTheme.isCustom ? "custom" : "preset"}
      data-surface={profile.appearance?.surfacePreset ?? "clean"}
      data-card={profile.appearance?.cardPreset ?? "soft"}
      data-density={profile.appearance?.density ?? "comfortable"}
      data-chat-text-size={chatTextSize}
      data-testid="public-profile-theme"
      style={profileThemeVariables}
    >
      <Header />
      <main className={styles.container}>
        <motion.div
          layout
          transition={layoutTransition}
          className={`${styles.topGrid} ${mode !== "lobby" ? styles.topGridChat : ""}`}
          data-mode={mode}
          data-testid="chat-layout-grid"
        >
          <div className={`${styles.layoutSlot} ${styles.contextSlot}`}>
            <AnimatePresence mode="sync" initial={false}>
              {mode === "lobby" ? (
                <ProfileOverview key="profile-overview" profile={profile} />
              ) : mode === "transition" ? (
                <ContextRailSkeleton key="context-rail-skeleton" />
              ) : (
                <ContextRail key="context-rail" profile={profile} />
              )}
            </AnimatePresence>
          </div>

          <div className={styles.layoutSlot}>
            <AnimatePresence mode="sync" initial={false}>
              {mode === "lobby" ? (
                <StarterPanel
                  key="starter"
                  profile={profile}
                  input={input}
                  setInput={setInput}
                  onStart={startChat}
                  onContinue={storedConversationAvailable ? continueStoredConversation : undefined}
                  experience={experience}
                />
              ) : mode === "transition" ? (
                <ChatWorkspaceSkeleton
                  key="chat-skeleton"
                  profileName={profile.displayName}
                />
              ) : (
                <ChatWorkspace
                  key="chat"
                  profile={profile}
                  turns={turns}
                  conversationId={conversationId}
                  isSending={isSending}
                  input={input}
                  setInput={setInput}
                  onSend={(message, action) => void sendTurn(message, action)}
                  onExplore={exploreIdea}
                  onRetry={retryTurn}
                  experience={experience}
                  controlMode={conversationControl}
                  humanMessages={humanMessages}
                  humanReplyError={humanReplyError}
                  contactStatus={contactStatus}
                  themeVariables={portalThemeVariables}
                  lead={leadIntake}
                  intakeStep={intakeStep}
                  viewer={viewer}
                  intakeError={intakeError}
                  intakeNotice={intakeNotice}
                  proposalCompletion={proposalCompletion}
                  onSubmitProfile={(values) => void submitProfileIntake(values)}
                  onSubmitVerification={(value, password) => void submitVerification(value, password)}
                  onResendVerification={() => void resendVerification()}
                  onApproveEmail={() => void approveMemberEmail()}
                  onBeginAI={beginVerifiedAIChat}
                  onProposalSubmitted={setProposalCompletion}
                  textSize={chatTextSize}
                  onTextSizeChange={updateChatTextSize}
                  signInHref={signInHref}
                />
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {mode === "lobby" ? <LowerLobby profile={profile} /> : mode === "chat" ? (
          <div className={`${styles.chatCollaborations} mt-3`}>
            {profile.collaborations.length ? (
              <CollaborationSection profile={profile} />
            ) : null}
          </div>
        ) : null}
      </main>
      {mode === "lobby" && profile.isOpen ? (
        <button
          type="button"
          className={styles.mobileStartCta}
          onClick={() => startChat(input.trim() || "See if we’re a fit")}
        >
          <MessageCircleMore size={17} aria-hidden="true" />
          Talk to {agentDisplayName(profile)}
        </button>
      ) : null}
      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <BrandMark className="h-6 w-6" />
          PartnerBird
        </div>
        <p>Making partnerships easier, smarter, and more human.</p>
        <div className={styles.footerLinks}>
          <Link href="/">Demo home</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </footer>
    </div>
  );
}

function normalizeVisitorInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[\w-]+(?:\.[\w-]+)+(?:[/?#]\S*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function agentDisplayName(profile: PublicProfile) {
  return profile.agentName.trim().toLowerCase() === "partnerbird"
    ? `${profile.displayName}’s PartnerBird`
    : profile.agentName;
}

function completeActiveStages(
  stages: ChatTurn["stages"],
): ChatTurn["stages"] {
  return Object.fromEntries(
    Object.entries(stages).map(([stage, state]) => [
      stage,
      state === "active" ? "done" : state,
    ]),
  ) as ChatTurn["stages"];
}
