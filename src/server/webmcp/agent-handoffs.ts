import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, ne } from "drizzle-orm";

import { auth } from "@/lib/auth/server";
import type { WebMCPInputMap } from "@/lib/webmcp/schemas";
import { db, neonSql } from "@/server/db/client";
import {
  profiles,
  webmcpAgentHandoffs,
  webmcpSettings,
} from "@/server/db/schema";
import { consumeRateLimit } from "@/server/security/rate-limit";
import {
  getOrCreateVisitorSession,
  getRequestIp,
  hashVisitorIp,
} from "@/server/security/visitor-session";

const HANDOFF_TTL_MS = 30 * 60 * 1000;
const handoffTokenPattern = /^[A-Za-z0-9_-]{43}$/;

type HandoffInput = WebMCPInputMap["prepare_agent_handoff"];

export type AgentHandoffRecord = {
  tokenHash: string;
  creatorProfileId: string;
  targetProfileId: string;
  targetHandle: string;
  targetDisplayName: string;
  targetIsDemo: boolean;
  status: "pending" | "activated";
  personName: string;
  companyName: string;
  companyDescription: string;
  partnershipGoal: string;
  contextSummary: string | null;
  conversationId: string | null;
  activatedByUserId: string | null;
  expiresAt: Date;
};

export async function createPendingAgentHandoff(input: {
  creatorProfileId: string;
  targetProfileId: string;
  targetHandle: string;
  targetDisplayName: string;
  handoff: HandoffInput;
  requestUrl: string;
}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS);
  await db.insert(webmcpAgentHandoffs).values({
    tokenHash: hashAgentHandoffToken(token),
    creatorProfileId: input.creatorProfileId,
    targetProfileId: input.targetProfileId,
    personName: input.handoff.personName,
    companyName: input.handoff.companyName,
    companyDescription: input.handoff.companyDescription,
    partnershipGoal: input.handoff.partnershipGoal,
    contextSummary: input.handoff.contextSummary ?? null,
    expiresAt,
  });

  const handoffPath = `/agent/handoff/${token}`;
  return {
    status: "pending" as const,
    handoffUrl: new URL(handoffPath, input.requestUrl).toString(),
    handoffPath,
    expiresAt: expiresAt.toISOString(),
    recipient: {
      username: input.targetHandle,
      displayName: input.targetDisplayName,
    },
    aiCreditsUsed: 0,
    ownerContacted: false,
    nextStep: "Open the handoff URL. PartnerBird will validate it and require an explicit Evaluate with PartnerBird Agent action before any AI usage begins.",
  };
}

export async function readAgentHandoff(token: string): Promise<AgentHandoffRecord | null> {
  if (!handoffTokenPattern.test(token)) return null;
  const [row] = await db
    .select({
      tokenHash: webmcpAgentHandoffs.tokenHash,
      creatorProfileId: webmcpAgentHandoffs.creatorProfileId,
      targetProfileId: webmcpAgentHandoffs.targetProfileId,
      targetHandle: profiles.handle,
      targetDisplayName: profiles.displayName,
      targetIsDemo: profiles.isDemo,
      status: webmcpAgentHandoffs.status,
      personName: webmcpAgentHandoffs.personName,
      companyName: webmcpAgentHandoffs.companyName,
      companyDescription: webmcpAgentHandoffs.companyDescription,
      partnershipGoal: webmcpAgentHandoffs.partnershipGoal,
      contextSummary: webmcpAgentHandoffs.contextSummary,
      conversationId: webmcpAgentHandoffs.conversationId,
      activatedByUserId: webmcpAgentHandoffs.activatedByUserId,
      expiresAt: webmcpAgentHandoffs.expiresAt,
    })
    .from(webmcpAgentHandoffs)
    .innerJoin(profiles, eq(profiles.id, webmcpAgentHandoffs.targetProfileId))
    .innerJoin(webmcpSettings, eq(webmcpSettings.profileId, profiles.id))
    .where(and(
      eq(webmcpAgentHandoffs.tokenHash, hashAgentHandoffToken(token)),
      gt(webmcpAgentHandoffs.expiresAt, new Date()),
      eq(profiles.isPublished, true),
      eq(profiles.isOpen, true),
      ne(profiles.partnershipStatus, "unavailable"),
      eq(webmcpSettings.enabled, true),
      eq(webmcpSettings.allowMatching, true),
    ))
    .limit(1);

  if (!row || (row.status !== "pending" && row.status !== "activated")) return null;
  return { ...row, status: row.status };
}

export async function readAgentHandoffNormalFallback(token: string) {
  if (!handoffTokenPattern.test(token)) return null;
  const [row] = await db
    .select({ targetHandle: profiles.handle })
    .from(webmcpAgentHandoffs)
    .innerJoin(profiles, eq(profiles.id, webmcpAgentHandoffs.targetProfileId))
    .where(and(
      eq(webmcpAgentHandoffs.tokenHash, hashAgentHandoffToken(token)),
      eq(profiles.isPublished, true),
    ))
    .limit(1);
  return row?.targetHandle ?? null;
}

export async function activateAgentHandoff(token: string, request: Request) {
  const { data: authSession } = await auth.getSession({
    query: { disableCookieCache: "true" },
  });
  const user = authSession?.user;
  if (!user?.id || !user.email) {
    return { ok: false as const, status: 401, code: "AUTH_REQUIRED", message: "Sign in to continue this handoff." };
  }
  if (user.emailVerified !== true) {
    return { ok: false as const, status: 403, code: "VERIFIED_EMAIL_REQUIRED", message: "Verify your email before evaluating this handoff." };
  }

  const handoff = await readAgentHandoff(token);
  if (!handoff) {
    return { ok: false as const, status: 404, code: "HANDOFF_NOT_FOUND", message: "This handoff is invalid or has expired." };
  }
  if (handoff.status === "activated") {
    if (handoff.activatedByUserId !== user.id || !handoff.conversationId) {
      return { ok: false as const, status: 404, code: "HANDOFF_NOT_FOUND", message: "This handoff is not available for this account." };
    }
    return {
      ok: true as const,
      conversationId: handoff.conversationId,
      profileHandle: handoff.targetHandle,
      profileIsDemo: handoff.targetIsDemo,
      alreadyActivated: true,
    };
  }

  const [accountLimit, ipLimit] = await Promise.all([
    consumeRateLimit({
      keyHash: createHash("sha256").update(`handoff:${user.id}`).digest("hex"),
      action: "webmcp_handoff_activate",
      limit: 10,
      windowMs: 60 * 60 * 1000,
    }),
    consumeRateLimit({
      keyHash: hashVisitorIp(getRequestIp(request)),
      action: "webmcp_handoff_activate_ip",
      limit: 30,
      windowMs: 60 * 60 * 1000,
    }),
  ]);
  if (!accountLimit.allowed || !ipLimit.allowed) {
    return { ok: false as const, status: 429, code: "RATE_LIMITED", message: "Please wait before activating another handoff." };
  }

  const visitorSession = await getOrCreateVisitorSession(request);
  const now = new Date();
  const resumeTokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
  const resumeTokenExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const mode = handoff.targetIsDemo ? "demo" : "live";
  const initialIntent = composeHandoffInitialIntent(handoff);

  const rows = (await neonSql`
    WITH claimed AS (
      UPDATE webmcp_agent_handoffs
      SET status='activated', activated_by_user_id=${user.id}, activated_at=${now},
          updated_at=${now}
      WHERE token_hash=${handoff.tokenHash} AND status='pending' AND expires_at>${now}
      RETURNING id, target_profile_id
    ), created_conversation AS (
      INSERT INTO conversations (
        profile_id, visitor_session_id, state, mode, inbox_status, control_mode,
        visitor_message_count, prompt_version, provider, last_message_at,
        created_at, updated_at
      )
      SELECT target_profile_id, ${visitorSession.id}, 'DISCOVERY', ${mode}, 'new',
             'agent', 0, 'v1', 'mock', ${now}, ${now}, ${now}
      FROM claimed
      RETURNING id
    ), created_lead AS (
      INSERT INTO conversation_leads (
        conversation_id, person_name, company_name, company_description,
        initial_intent, intake_completed_at, created_at, updated_at
      )
      SELECT id, ${handoff.personName}, ${handoff.companyName},
             ${handoff.companyDescription}, ${initialIntent}, ${now}, ${now}, ${now}
      FROM created_conversation
    ), created_contact AS (
      INSERT INTO conversation_contacts (
        conversation_id, visitor_name, visitor_email, email_verified_at,
        auth_user_id, resume_token_hash, resume_token_expires_at,
        notifications_enabled, created_at, updated_at
      )
      SELECT id, ${handoff.personName}, ${user.email.toLowerCase()}, ${now},
             ${user.id}, ${resumeTokenHash}, ${resumeTokenExpiresAt}, true, ${now}, ${now}
      FROM created_conversation
    ), created_business AS (
      INSERT INTO visitor_businesses (
        conversation_id, name, summary, analysis_status, created_at, updated_at
      )
      SELECT id, ${handoff.companyName}, ${handoff.companyDescription},
             'complete', ${now}, ${now}
      FROM created_conversation
    ), completed AS (
      UPDATE webmcp_agent_handoffs AS handoff
      SET conversation_id=created_conversation.id, updated_at=${now}
      FROM created_conversation, claimed
      WHERE handoff.id=claimed.id
      RETURNING created_conversation.id AS "conversationId"
    )
    SELECT "conversationId" FROM completed
  `) as Array<{ conversationId: string }>;

  const conversationId = rows[0]?.conversationId;
  if (!conversationId) {
    const current = await readAgentHandoff(token);
    if (current?.status === "activated" && current.activatedByUserId === user.id && current.conversationId) {
      return {
        ok: true as const,
        conversationId: current.conversationId,
        profileHandle: current.targetHandle,
        profileIsDemo: current.targetIsDemo,
        alreadyActivated: true,
      };
    }
    return { ok: false as const, status: 409, code: "HANDOFF_ALREADY_USED", message: "This handoff has already been activated." };
  }

  return {
    ok: true as const,
    conversationId,
    profileHandle: handoff.targetHandle,
    profileIsDemo: handoff.targetIsDemo,
    alreadyActivated: false,
  };
}

export function hashAgentHandoffToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function composeHandoffInitialIntent(handoff: AgentHandoffRecord) {
  return [
    `Partnership goal: ${handoff.partnershipGoal}`,
    handoff.contextSummary ? `Context prepared before handoff: ${handoff.contextSummary}` : null,
  ].filter(Boolean).join("\n").slice(0, 1400);
}
