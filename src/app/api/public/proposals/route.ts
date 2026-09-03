import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth/server";
import { issueConversationResumeEmail } from "@/server/conversations/resume";
import { db, neonSql } from "@/server/db/client";
import {
  conversations,
  conversationContacts,
  partnershipIdeas,
  profiles,
  proposals,
} from "@/server/db/schema";
import { consumeRateLimit } from "@/server/security/rate-limit";
import {
  getExistingVisitorSession,
  getRequestIp,
  hashVisitorIp,
} from "@/server/security/visitor-session";

export const runtime = "nodejs";

const contactFields = {
  conversationId: z.string().uuid(),
  visitorName: z.string().trim().min(2).max(120),
  visitorEmail: z.string().trim().email().max(255),
};
const proposalSchema = z.discriminatedUnion("kind", [
  z.object({
    ...contactFields,
    kind: z.literal("idea"),
    ideaId: z.string().uuid(),
  }),
  z.object({
    ...contactFields,
    kind: z.literal("manual"),
    title: z.string().trim().min(5).max(220),
    concept: z.string().trim().min(20).max(2400),
    possibleActivation: z.string().trim().max(600).default(""),
  }),
]);

export async function POST(request: Request) {
  const session = await getExistingVisitorSession();
  if (!session) {
    return Response.json({ error: "Conversation session not found." }, { status: 401 });
  }

  const [sessionLimit, ipLimit] = await Promise.all([
    consumeRateLimit({
      keyHash: session.tokenHash,
      action: "proposal",
      limit: 5,
      windowMs: 24 * 60 * 60 * 1000,
    }),
    consumeRateLimit({
      keyHash: hashVisitorIp(getRequestIp(request)),
      action: "proposal_ip",
      limit: 20,
      windowMs: 24 * 60 * 60 * 1000,
    }),
  ]);
  if (!sessionLimit.allowed || !ipLimit.allowed) {
    return Response.json(
      { error: "Proposal submissions are temporarily limited. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(sessionLimit.retryAfterSeconds, ipLimit.retryAfterSeconds),
          ),
        },
      },
    );
  }

  let input: z.infer<typeof proposalSchema>;
  try {
    input = proposalSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Add your name and a valid email address." }, { status: 400 });
  }

  const [conversation] = await db
    .select({
      id: conversations.id,
      profileId: conversations.profileId,
      state: conversations.state,
      mode: conversations.mode,
      profileIsOpen: profiles.isOpen,
      profileName: profiles.displayName,
    })
    .from(conversations)
    .innerJoin(profiles, eq(profiles.id, conversations.profileId))
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.visitorSessionId, session.id),
      ),
    )
    .limit(1);
  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }
  if (!conversation.profileIsOpen) {
    return Response.json(
      { error: "This PartnerBird is not accepting proposals right now." },
      { status: 409 },
    );
  }
  if (conversation.mode !== "live" && conversation.mode !== "demo") {
    return Response.json(
      { error: "Test conversations cannot create real proposals." },
      { status: 409 },
    );
  }

  const [verifiedContact] = await db
    .select({
      visitorName: conversationContacts.visitorName,
      visitorEmail: conversationContacts.visitorEmail,
      authUserId: conversationContacts.authUserId,
    })
    .from(conversationContacts)
    .where(
      and(
        eq(conversationContacts.conversationId, conversation.id),
        isNotNull(conversationContacts.emailVerifiedAt),
      ),
    )
    .limit(1);
  if (!verifiedContact) {
    return Response.json(
      { error: "Verify your email for this conversation before submitting." },
      { status: 403 },
    );
  }

  if (conversation.mode === "demo") {
    const { data: authSession } = await auth.getSession({
      query: { disableCookieCache: "true" },
    });
    if (!authSession?.user?.id || authSession.user.emailVerified !== true) {
      return Response.json(
        { code: "sign_in_required", error: "Sign in to submit this partnership request." },
        { status: 401 },
      );
    }
    if (!verifiedContact || verifiedContact.authUserId !== authSession.user.id) {
      return Response.json(
        { error: "Verify the signed-in email for this conversation before submitting." },
        { status: 403 },
      );
    }
  }
  input = {
    ...input,
    visitorName: verifiedContact.visitorName,
    visitorEmail: verifiedContact.visitorEmail,
  };
  if (input.kind === "manual") {
    return createManualProposal(input, conversation);
  }
  if (
    conversation.state !== "IDEA_GENERATION" &&
    conversation.state !== "QUALIFICATION" &&
    conversation.state !== "PROPOSAL_READY"
  ) {
    return Response.json(
      { error: "Complete the partnership assessment before sending a proposal." },
      { status: 409 },
    );
  }

  const [idea] = await db
    .select()
    .from(partnershipIdeas)
    .where(
      and(
        eq(partnershipIdeas.id, input.ideaId),
        eq(partnershipIdeas.conversationId, conversation.id),
      ),
    )
    .limit(1);
  if (!idea) {
    return Response.json({ error: "Partnership idea not found." }, { status: 404 });
  }


  const [existingProposal] = await db
    .select({ id: proposals.id, status: proposals.status })
    .from(proposals)
    .where(
      and(
        eq(proposals.conversationId, conversation.id),
        eq(proposals.ideaId, idea.id),
      ),
    )
    .limit(1);
  if (existingProposal) {
    return Response.json(
      { proposalId: existingProposal.id, status: existingProposal.status },
      { status: 200 },
    );
  }

  const now = new Date();
  const [createdRows] = await neonSql.transaction((transaction) => [
    transaction`
      INSERT INTO proposals (
        profile_id, conversation_id, idea_id, title, concept,
        possible_activation, owner_contribution, visitor_contribution,
        assessment, visitor_name, visitor_email, status, submitted_at,
        created_at, updated_at
      ) VALUES (
        ${conversation.profileId}, ${conversation.id}, ${idea.id}, ${idea.title},
        ${idea.description}, ${idea.activation}, ${idea.ownerContribution},
        ${idea.visitorContribution}, ${idea.whyItWorks}, ${input.visitorName},
        ${input.visitorEmail}, 'submitted', ${now}, ${now}, ${now}
      )
      ON CONFLICT (conversation_id, idea_id)
      DO UPDATE SET updated_at = proposals.updated_at
      RETURNING id
    `,
    transaction`
      UPDATE partnership_ideas
      SET status = 'proposed', updated_at = ${now}
      WHERE id = ${idea.id}
    `,
    transaction`
      UPDATE conversations
      SET state = 'PROPOSAL_SENT', inbox_status = 'qualified', updated_at = ${now}
      WHERE id = ${conversation.id}
    `,
    transaction`
      INSERT INTO opportunities (
        profile_id, conversation_id, primary_idea_id, title, fit_label,
        partnership_type, status, potential_activation, last_activity_at,
        created_at, updated_at
      ) VALUES (
        ${conversation.profileId}, ${conversation.id}, ${idea.id}, ${idea.title},
        ${idea.fitLabel}, ${idea.type}, 'new', ${idea.activation}, ${now}, ${now}, ${now}
      )
      ON CONFLICT (conversation_id)
      DO UPDATE SET
        primary_idea_id = EXCLUDED.primary_idea_id,
        title = EXCLUDED.title,
        fit_label = EXCLUDED.fit_label,
        partnership_type = EXCLUDED.partnership_type,
        potential_activation = EXCLUDED.potential_activation,
        last_activity_at = EXCLUDED.last_activity_at,
        updated_at = EXCLUDED.updated_at
    `,
  ]);
  const [proposal] = createdRows as Array<{ id: string }>;

  const resumeEmailSent = await issueConversationResumeEmail({
    conversationId: conversation.id,
    visitorName: input.visitorName,
    visitorEmail: input.visitorEmail,
    profileName: conversation.profileName,
  })
    .then((result) => result.sent)
    .catch(() => false);

  return Response.json(
    { proposalId: proposal.id, status: "submitted", resumeEmailSent },
    { status: 201 },
  );
}

async function createManualProposal(
  input: Extract<z.infer<typeof proposalSchema>, { kind: "manual" }>,
  conversation: {
    id: string;
    profileId: string;
    profileName: string;
  },
) {
  const [existingProposal] = await db
    .select({ id: proposals.id, status: proposals.status })
    .from(proposals)
    .where(
      and(
        eq(proposals.conversationId, conversation.id),
        isNull(proposals.ideaId),
      ),
    )
    .limit(1);
  if (existingProposal) {
    return Response.json(
      { proposalId: existingProposal.id, status: existingProposal.status },
      { status: 200 },
    );
  }

  const now = new Date();
  const activation = input.possibleActivation || "To be shaped with the owner";
  const [createdRows] = await neonSql.transaction((transaction) => [
    transaction`
      INSERT INTO proposals (
        profile_id, conversation_id, idea_id, title, concept,
        possible_activation, owner_contribution, visitor_contribution,
        assessment, visitor_name, visitor_email, status, submitted_at,
        created_at, updated_at
      ) VALUES (
        ${conversation.profileId}, ${conversation.id}, NULL, ${input.title},
        ${input.concept}, ${activation}, 'To discuss with the owner',
        ${input.concept}, 'Submitted directly while AI assistance was unavailable.',
        ${input.visitorName}, ${input.visitorEmail}, 'submitted', ${now},
        ${now}, ${now}
      )
      RETURNING id
    `,
    transaction`
      UPDATE conversations
      SET state='PROPOSAL_SENT', inbox_status='qualified', updated_at=${now}
      WHERE id=${conversation.id}
    `,
    transaction`
      INSERT INTO opportunities (
        profile_id, conversation_id, primary_idea_id, title, fit_label,
        partnership_type, status, potential_activation, last_activity_at,
        created_at, updated_at
      ) VALUES (
        ${conversation.profileId}, ${conversation.id}, NULL, ${input.title},
        'Worth Exploring', 'Direct proposal', 'new', ${activation}, ${now},
        ${now}, ${now}
      )
      ON CONFLICT (conversation_id)
      DO UPDATE SET
        title=EXCLUDED.title,
        fit_label=EXCLUDED.fit_label,
        partnership_type=EXCLUDED.partnership_type,
        potential_activation=EXCLUDED.potential_activation,
        last_activity_at=EXCLUDED.last_activity_at,
        updated_at=EXCLUDED.updated_at
    `,
  ]);
  const [proposal] = createdRows as Array<{ id: string }>;
  const resumeEmailSent = await issueConversationResumeEmail({
    conversationId: conversation.id,
    visitorName: input.visitorName,
    visitorEmail: input.visitorEmail,
    profileName: conversation.profileName,
  })
    .then((result) => result.sent)
    .catch(() => false);
  return Response.json(
    { proposalId: proposal.id, status: "submitted", resumeEmailSent },
    { status: 201 },
  );
}
