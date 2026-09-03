import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth/server";
import { getConversationContactStatus } from "@/server/conversations/resume";
import { db, neonSql } from "@/server/db/client";
import {
  conversations,
  conversationLeads,
  fitAssessments,
  messages,
  partnershipIdeas,
} from "@/server/db/schema";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { getExistingVisitorSession } from "@/server/security/visitor-session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const replySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  idempotencyKey: z.string().uuid(),
});

export async function GET(request: Request, { params }: RouteContext) {
  const id = z.string().uuid().safeParse((await params).id);
  const session = await getExistingVisitorSession();
  if (!id.success || !session) return notFound();

  const [conversation] = await db
    .select({
      id: conversations.id,
      controlMode: conversations.controlMode,
      state: conversations.state,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, id.data),
        eq(conversations.visitorSessionId, session.id),
        or(eq(conversations.mode, "live"), eq(conversations.mode, "demo")),
      ),
    )
    .limit(1);
  if (!conversation) return notFound();

  const includeHistory = new URL(request.url).searchParams.get("history") === "1";
  if (!includeHistory) {
    const [humanMessages, contact] = await Promise.all([
      db
        .select({
          id: messages.id,
          role: messages.role,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversation.id),
            or(
              eq(messages.role, "owner"),
              like(messages.clientIdempotencyKey, "owner-chat:%"),
            ),
          ),
        )
        .orderBy(asc(messages.createdAt), asc(messages.id)),
      getConversationContactStatus(conversation.id),
    ]);
    return Response.json(
      {
        controlMode: conversation.controlMode,
        state: conversation.state,
        messages: humanMessages,
        contact,
      },
      { headers: privateHeaders },
    );
  }

  const [rows, [fit], contact, [lead], { data: authSession }] = await Promise.all([
    db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        clientIdempotencyKey: messages.clientIdempotencyKey,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(asc(messages.createdAt), asc(messages.id)),
    db
      .select({
        id: fitAssessments.id,
        label: fitAssessments.label,
        rationale: fitAssessments.publicRationale,
        strengths: fitAssessments.strengths,
        concerns: fitAssessments.concerns,
      })
      .from(fitAssessments)
      .where(eq(fitAssessments.conversationId, conversation.id))
      .orderBy(desc(fitAssessments.createdAt))
      .limit(1),
    getConversationContactStatus(conversation.id),
    db
      .select({
        personName: conversationLeads.personName,
        companyName: conversationLeads.companyName,
        companyDescription: conversationLeads.companyDescription,
        initialIntent: conversationLeads.initialIntent,
        intakeCompletedAt: conversationLeads.intakeCompletedAt,
      })
      .from(conversationLeads)
      .where(eq(conversationLeads.conversationId, conversation.id))
      .limit(1),
    auth.getSession(),
  ]);
  const ideas = fit
    ? await db
        .select({
          id: partnershipIdeas.id,
          fitLabel: partnershipIdeas.fitLabel,
          type: partnershipIdeas.type,
          title: partnershipIdeas.title,
          description: partnershipIdeas.description,
          whyItWorks: partnershipIdeas.whyItWorks,
          ownerContribution: partnershipIdeas.ownerContribution,
          visitorContribution: partnershipIdeas.visitorContribution,
          mutualValue: partnershipIdeas.mutualValue,
          activation: partnershipIdeas.activation,
        })
        .from(partnershipIdeas)
        .where(eq(partnershipIdeas.assessmentId, fit.id))
        .orderBy(asc(partnershipIdeas.sortOrder))
    : [];

  const humanMessages = rows
    .filter(
      (message) =>
        message.role === "owner" ||
        (message.role === "visitor" &&
          message.clientIdempotencyKey?.startsWith("owner-chat:")),
    )
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    }));
  const agentMessages = rows
    .filter(
      (message) =>
        message.role === "assistant" ||
        (message.role === "visitor" &&
          !message.clientIdempotencyKey?.startsWith("owner-chat:")),
    )
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    }));

  return Response.json(
    {
      controlMode: conversation.controlMode,
      state: conversation.state,
      messages: humanMessages,
      agentMessages,
      fit: fit
        ? {
            label: fit.label,
            rationale: fit.rationale,
            strengths: fit.strengths,
            concerns: fit.concerns,
          }
        : null,
      ideas,
      contact,
      lead: lead ?? null,
      viewer:
        authSession?.user?.email && authSession.user.emailVerified
          ? { email: authSession.user.email, verified: true }
          : null,
    },
    { headers: privateHeaders },
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  const id = z.string().uuid().safeParse((await params).id);
  const session = await getExistingVisitorSession();
  if (!id.success || !session) return notFound();

  let body: z.infer<typeof replySchema>;
  try {
    body = replySchema.parse(await request.json());
  } catch {
    return Response.json(
      { error: "Write a shorter message before sending." },
      { status: 400, headers: privateHeaders },
    );
  }

  const limit = await consumeRateLimit({
    keyHash: session.tokenHash,
    action: "owner_chat_message",
    limit: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return Response.json(
      { error: "This conversation needs a short pause." },
      {
        status: 429,
        headers: { ...privateHeaders, "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const createdAt = new Date();
  const clientKey = `owner-chat:${body.idempotencyKey}`;
  try {
    const rows = (await neonSql`
      WITH owned AS (
        UPDATE conversations
        SET visitor_message_count=visitor_message_count + 1,
            last_message_at=${createdAt}, updated_at=${createdAt}
        WHERE id=${id.data} AND visitor_session_id=${session.id}
          AND mode='live' AND control_mode='owner'
          AND visitor_message_count < 100
        RETURNING id
      )
      INSERT INTO messages (
        conversation_id, role, content, status, client_idempotency_key, created_at
      )
      SELECT id, 'visitor', ${body.message}, 'complete', ${clientKey}, ${createdAt}
      FROM owned
      RETURNING id, role, content, created_at AS "createdAt"
    `) as Array<{ id: string; role: string; content: string; createdAt: Date }>;

    if (!rows.length) {
      return Response.json(
        { error: "The owner is not currently controlling this conversation." },
        { status: 409, headers: privateHeaders },
      );
    }
    return Response.json(rows[0], { status: 201, headers: privateHeaders });
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      const [existing] = await db
        .select({
          id: messages.id,
          role: messages.role,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, id.data),
            eq(messages.clientIdempotencyKey, clientKey),
          ),
        )
        .limit(1);
      if (existing) return Response.json(existing, { headers: privateHeaders });
    }
    throw error;
  }
}

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function notFound() {
  return Response.json(
    { error: "Conversation not found." },
    { status: 404, headers: privateHeaders },
  );
}

function databaseErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return "";
  return typeof error.code === "string" ? error.code : "";
}
