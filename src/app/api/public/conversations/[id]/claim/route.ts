import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { canSendConversationEmail, issueConversationResumeEmail } from "@/server/conversations/resume";
import { db } from "@/server/db/client";
import { conversations, profiles } from "@/server/db/schema";
import { consumeRateLimit } from "@/server/security/rate-limit";
import {
  getExistingVisitorSession,
  getRequestIp,
  hashVisitorIp,
} from "@/server/security/visitor-session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const claimSchema = z.object({
  visitorName: z.string().trim().min(2).max(120),
  visitorEmail: z.string().trim().email().max(255),
});

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
};

export async function POST(request: Request, { params }: RouteContext) {
  const [id, session] = await Promise.all([
    z.string().uuid().safeParse((await params).id),
    getExistingVisitorSession(),
  ]);
  if (!id.success || !session) {
    return Response.json(
      { error: "Conversation session not found." },
      { status: 401, headers: privateHeaders },
    );
  }
  if (!canSendConversationEmail()) {
    return Response.json(
      { error: "Email continuation is being configured. Please try again shortly." },
      { status: 503, headers: privateHeaders },
    );
  }

  const parsed = claimSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Add your name and a valid work email." },
      { status: 400, headers: privateHeaders },
    );
  }

  const [sessionLimit, ipLimit] = await Promise.all([
    consumeRateLimit({
      keyHash: session.tokenHash,
      action: "conversation_claim_email",
      limit: 4,
      windowMs: 60 * 60 * 1000,
    }),
    consumeRateLimit({
      keyHash: hashVisitorIp(getRequestIp(request)),
      action: "conversation_claim_email_ip",
      limit: 20,
      windowMs: 60 * 60 * 1000,
    }),
  ]);
  if (!sessionLimit.allowed || !ipLimit.allowed) {
    return Response.json(
      { error: "Please wait before requesting another email." },
      {
        status: 429,
        headers: {
          ...privateHeaders,
          "Retry-After": String(
            Math.max(sessionLimit.retryAfterSeconds, ipLimit.retryAfterSeconds),
          ),
        },
      },
    );
  }

  const [conversation] = await db
    .select({
      id: conversations.id,
      profileName: profiles.displayName,
    })
    .from(conversations)
    .innerJoin(profiles, eq(profiles.id, conversations.profileId))
    .where(
      and(
        eq(conversations.id, id.data),
        eq(conversations.visitorSessionId, session.id),
        eq(conversations.mode, "live"),
        eq(profiles.isPublished, true),
      ),
    )
    .limit(1);
  if (!conversation) {
    return Response.json(
      { error: "Conversation not found." },
      { status: 404, headers: privateHeaders },
    );
  }

  try {
    await issueConversationResumeEmail({
      conversationId: conversation.id,
      visitorName: parsed.data.visitorName,
      visitorEmail: parsed.data.visitorEmail,
      profileName: conversation.profileName,
    });
    return Response.json(
      { sent: true, email: maskEmail(parsed.data.visitorEmail) },
      { status: 202, headers: privateHeaders },
    );
  } catch {
    return Response.json(
      { error: "The email could not be delivered. Check the address and try again." },
      { status: 502, headers: privateHeaders },
    );
  }
}

function maskEmail(email: string) {
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return "your email";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(2, Math.min(6, local.length - visible.length)))}@${domain}`;
}
