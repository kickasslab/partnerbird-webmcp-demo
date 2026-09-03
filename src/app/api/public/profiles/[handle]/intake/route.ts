import { createHash, randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getAuthErrorMessage } from "@/lib/auth/errors";
import { auth } from "@/lib/auth/server";
import { db, neonSql } from "@/server/db/client";
import {
  conversationContacts,
  conversationLeads,
  conversations,
  profiles,
  visitorBusinesses,
} from "@/server/db/schema";
import { consumeRateLimit } from "@/server/security/rate-limit";
import {
  getOrCreateVisitorSession,
  getRequestIp,
  hashVisitorIp,
} from "@/server/security/visitor-session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ handle: string }> };

const intakeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save_profile"),
    conversationId: z.string().uuid().optional(),
    personName: z.string().trim().min(2).max(120),
    companyName: z.string().trim().min(2).max(180),
    companyDescription: z.string().trim().min(10).max(600),
    initialIntent: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal("save_step"),
    conversationId: z.string().uuid().optional(),
    step: z.enum(["person_name", "company_name", "company_description"]),
    value: z.string().trim().min(2).max(600),
    initialIntent: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal("request_verification"),
    conversationId: z.string().uuid(),
    email: z.string().trim().toLowerCase().email().max(255),
    password: z.string().min(8).max(128),
  }),
  z.object({
    action: z.literal("verify_code"),
    conversationId: z.string().uuid(),
    email: z.string().trim().toLowerCase().email().max(255),
    code: z.string().trim().regex(/^\d{6}$/),
  }),
  z.object({
    action: z.literal("resend_verification"),
    conversationId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("approve_member_email"),
    conversationId: z.string().uuid(),
  }),
]);

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

export async function POST(request: Request, { params }: RouteContext) {
  const parsed = intakeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Check that answer and try again." },
      { status: 400, headers: privateHeaders },
    );
  }

  const { handle } = await params;
  const [profile] = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      isDemo: profiles.isDemo,
    })
    .from(profiles)
    .where(
      and(
        eq(profiles.handle, decodeURIComponent(handle).toLowerCase()),
        eq(profiles.isPublished, true),
        eq(profiles.isOpen, true),
      ),
    )
    .limit(1);
  if (!profile) {
    return Response.json(
      { error: "This PartnerBird is not accepting conversations." },
      { status: 404, headers: privateHeaders },
    );
  }

  const session = await getOrCreateVisitorSession(request);
  const limit = await consumeRateLimit({
    keyHash: session.tokenHash,
    action: `conversation_intake_${parsed.data.action}`,
    limit: parsed.data.action === "save_step" ? 40 : 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return Response.json(
      { error: "Please wait a moment before trying again." },
      {
        status: 429,
        headers: { ...privateHeaders, "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  if (parsed.data.action === "save_profile") {
    return saveProfile({
      profileId: profile.id,
      sessionId: session.id,
      mode: profile.isDemo ? "demo" : "live",
      body: parsed.data,
    });
  }

  if (parsed.data.action === "save_step") {
    return saveStep({
      profileId: profile.id,
      sessionId: session.id,
      mode: profile.isDemo ? "demo" : "live",
      body: parsed.data,
    });
  }

  const conversation = await getOwnedConversation(
    parsed.data.conversationId,
    profile.id,
    session.id,
    profile.isDemo ? "demo" : "live",
  );
  if (!conversation) {
    return Response.json(
      { error: "Conversation not found." },
      { status: 404, headers: privateHeaders },
    );
  }
  const lead = await getCompleteLead(conversation.id);
  if (!lead) {
    return Response.json(
      { error: "Complete the three introduction questions first." },
      { status: 409, headers: privateHeaders },
    );
  }
  const personName = lead.personName!;

  if (parsed.data.action === "approve_member_email") {
    const { data: authSession } = await auth.getSession({
      query: { disableCookieCache: "true" },
    });
    if (!authSession?.user?.email || authSession.user.emailVerified !== true) {
      return Response.json(
        { error: "Your signed-in email is not verified." },
        { status: 401, headers: privateHeaders },
      );
    }
    await storeVerifiedContact({
      conversationId: conversation.id,
      personName,
      email: authSession.user.email,
      authUserId: authSession.user.id,
      verified: true,
    });
    return Response.json(
      { verified: true, email: authSession.user.email },
      { headers: privateHeaders },
    );
  }

  if (parsed.data.action === "request_verification") {
    const ipLimit = await consumeEmailOtpIpLimit(request);
    if (!ipLimit.allowed) {
      return Response.json(
        { error: "Too many codes were requested. Please try again later." },
        { status: 429, headers: privateHeaders },
      );
    }
    try {
      if (await emailIsRegistered(parsed.data.email)) {
        return Response.json(
          {
            code: "account_exists",
            error: "A PartnerBird account already uses this email. Sign in to continue this conversation.",
          },
          { status: 409, headers: privateHeaders },
        );
      }
      const { data, error } = await auth.signUp.email({
        name: personName,
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (error) {
        return Response.json(
          { error: getAuthErrorMessage(error, "verify-email") },
          { status: 400, headers: privateHeaders },
        );
      }
      await storeVerifiedContact({
        conversationId: conversation.id,
        personName,
        email: parsed.data.email,
        authUserId: data?.user?.id,
        verified: data?.user?.emailVerified === true,
      });
      return Response.json(
        {
          sent: data?.user?.emailVerified !== true,
          verified: data?.user?.emailVerified === true,
          email: data?.user?.emailVerified === true
            ? parsed.data.email
            : maskEmail(parsed.data.email),
        },
        { status: data?.user?.emailVerified === true ? 200 : 202, headers: privateHeaders },
      );
    } catch (error) {
      return Response.json(
        { error: getAuthErrorMessage(error, "verify-email") },
        { status: 502, headers: privateHeaders },
      );
    }
  }

  if (parsed.data.action === "resend_verification") {
    const [contact] = await db
      .select({
        email: conversationContacts.visitorEmail,
        verifiedAt: conversationContacts.emailVerifiedAt,
        authUserId: conversationContacts.authUserId,
      })
      .from(conversationContacts)
      .where(eq(conversationContacts.conversationId, conversation.id))
      .limit(1);

    if (!contact || contact.verifiedAt) {
      return Response.json(
        {
          error: contact
            ? "This email is already verified."
            : "Enter your email and create a password first.",
        },
        { status: 409, headers: privateHeaders },
      );
    }
    if (!contact.authUserId) {
      return Response.json(
        {
          code: "account_setup_required",
          error: "Enter your email and create a password first so we can send a verification code.",
        },
        { status: 409, headers: privateHeaders },
      );
    }

    const ipLimit = await consumeEmailOtpIpLimit(request);
    if (!ipLimit.allowed) {
      return Response.json(
        { error: "Too many codes were requested. Please try again later." },
        {
          status: 429,
          headers: { ...privateHeaders, "Retry-After": String(ipLimit.retryAfterSeconds) },
        },
      );
    }

    try {
      const { error } = await auth.emailOtp.sendVerificationOtp({
        email: contact.email,
        type: "email-verification",
      });
      if (error) {
        return Response.json(
          { error: getAuthErrorMessage(error, "verify-email") },
          { status: 400, headers: privateHeaders },
        );
      }
      return Response.json(
        { sent: true, email: maskEmail(contact.email) },
        { headers: privateHeaders },
      );
    } catch (error) {
      return Response.json(
        { error: getAuthErrorMessage(error, "verify-email") },
        { status: 502, headers: privateHeaders },
      );
    }
  }

  try {
    const { data, error } = await auth.emailOtp.verifyEmail({
      email: parsed.data.email,
      otp: parsed.data.code,
    });
    if (error || !data?.user?.id || data.user.emailVerified !== true) {
      return Response.json(
        { error: error ? getAuthErrorMessage(error, "verify-email") : "That code could not be verified." },
        { status: 400, headers: privateHeaders },
      );
    }
    await storeVerifiedContact({
      conversationId: conversation.id,
      personName,
      email: data.user.email,
      authUserId: data.user.id,
      verified: true,
    });
    return Response.json(
      { verified: true, email: data.user.email },
      { headers: privateHeaders },
    );
  } catch (error) {
    return Response.json(
      { error: getAuthErrorMessage(error, "verify-email") },
      { status: 400, headers: privateHeaders },
    );
  }
}

function consumeEmailOtpIpLimit(request: Request) {
  return consumeRateLimit({
    keyHash: hashVisitorIp(getRequestIp(request)),
    action: "conversation_email_otp_ip",
    limit: 25,
    windowMs: 60 * 60 * 1000,
  });
}

async function emailIsRegistered(email: string): Promise<boolean> {
  const [row] = await neonSql`
    SELECT EXISTS (
      SELECT 1
      FROM neon_auth."user"
      WHERE lower(email) = ${email}
    ) AS "registered"
  `;
  return row?.registered === true;
}

async function saveProfile({
  profileId,
  sessionId,
  mode,
  body,
}: {
  profileId: string;
  sessionId: string;
  mode: "live" | "demo";
  body: Extract<z.infer<typeof intakeSchema>, { action: "save_profile" }>;
}) {
  let conversation = body.conversationId
    ? await getOwnedConversation(body.conversationId, profileId, sessionId, mode)
    : null;
  if (!conversation) {
    [conversation] = await db
      .insert(conversations)
      .values({ profileId, visitorSessionId: sessionId, state: "DISCOVERY", mode })
      .returning({ id: conversations.id });
  }

  const existing = await getLead(conversation.id);
  const now = new Date();
  const values = {
    conversationId: conversation.id,
    personName: body.personName,
    companyName: body.companyName,
    companyDescription: body.companyDescription,
    initialIntent: existing?.initialIntent ?? body.initialIntent,
    intakeCompletedAt: now,
    updatedAt: now,
  };
  await db
    .insert(conversationLeads)
    .values(values)
    .onConflictDoUpdate({ target: conversationLeads.conversationId, set: values });
  await db
    .insert(visitorBusinesses)
    .values({
      conversationId: conversation.id,
      name: body.companyName,
      summary: body.companyDescription,
      analysisStatus: "complete",
    })
    .onConflictDoUpdate({
      target: visitorBusinesses.conversationId,
      set: {
        name: body.companyName,
        summary: body.companyDescription,
        analysisStatus: "complete",
        analysisError: null,
        updatedAt: now,
      },
    });
  await db
    .update(conversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(conversations.id, conversation.id));

  return Response.json(
    { conversationId: conversation.id, lead: await getLead(conversation.id) },
    { headers: privateHeaders },
  );
}

async function saveStep({
  profileId,
  sessionId,
  mode,
  body,
}: {
  profileId: string;
  sessionId: string;
  mode: "live" | "demo";
  body: Extract<z.infer<typeof intakeSchema>, { action: "save_step" }>;
}) {
  let conversation = body.conversationId
    ? await getOwnedConversation(body.conversationId, profileId, sessionId, mode)
    : null;
  if (!conversation) {
    [conversation] = await db
      .insert(conversations)
      .values({ profileId, visitorSessionId: sessionId, state: "DISCOVERY", mode })
      .returning({ id: conversations.id });
  }

  const existing = await getLead(conversation.id);
  if (body.step !== "person_name" && !existing?.personName) {
    return Response.json(
      { error: "Tell us your name first." },
      { status: 409, headers: privateHeaders },
    );
  }
  if (body.step === "company_description" && !existing?.companyName) {
    return Response.json(
      { error: "Tell us your company name first." },
      { status: 409, headers: privateHeaders },
    );
  }

  const now = new Date();
  const values = {
    conversationId: conversation.id,
    personName: body.step === "person_name" ? body.value : existing?.personName,
    companyName: body.step === "company_name" ? body.value : existing?.companyName,
    companyDescription:
      body.step === "company_description" ? body.value : existing?.companyDescription,
    initialIntent: existing?.initialIntent ?? body.initialIntent,
    intakeCompletedAt: body.step === "company_description" ? now : existing?.intakeCompletedAt,
    updatedAt: now,
  };
  await db
    .insert(conversationLeads)
    .values(values)
    .onConflictDoUpdate({
      target: conversationLeads.conversationId,
      set: values,
    });
  if (body.step === "company_description") {
    await db
      .insert(visitorBusinesses)
      .values({
        conversationId: conversation.id,
        name: existing?.companyName,
        summary: body.value,
        analysisStatus: "complete",
      })
      .onConflictDoUpdate({
        target: visitorBusinesses.conversationId,
        set: {
          name: existing?.companyName,
          summary: body.value,
          analysisStatus: "complete",
          analysisError: null,
          updatedAt: now,
        },
      });
  }
  await db
    .update(conversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(conversations.id, conversation.id));

  const lead = await getLead(conversation.id);
  return Response.json(
    { conversationId: conversation.id, lead },
    { headers: privateHeaders },
  );
}

async function getOwnedConversation(
  id: string,
  profileId: string,
  sessionId: string,
  mode: "live" | "demo",
) {
  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.profileId, profileId),
        eq(conversations.visitorSessionId, sessionId),
        eq(conversations.mode, mode),
      ),
    )
    .limit(1);
  return conversation ?? null;
}

async function getLead(conversationId: string) {
  const [lead] = await db
    .select()
    .from(conversationLeads)
    .where(eq(conversationLeads.conversationId, conversationId))
    .limit(1);
  return lead ?? null;
}

async function getCompleteLead(conversationId: string) {
  const lead = await getLead(conversationId);
  return lead?.personName && lead.companyName && lead.companyDescription && lead.intakeCompletedAt
    ? lead
    : null;
}

async function storeVerifiedContact({
  conversationId,
  personName,
  email,
  authUserId,
  verified,
}: {
  conversationId: string;
  personName: string;
  email: string;
  authUserId?: string;
  verified: boolean;
}) {
  const now = new Date();
  const normalizedEmail = email.trim().toLowerCase();
  const tokenHash = createHash("sha256")
    .update(randomBytes(32))
    .digest("hex");
  const tokenExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await neonSql`
    INSERT INTO conversation_contacts (
      conversation_id, visitor_name, visitor_email, email_verified_at,
      auth_user_id, resume_token_hash, resume_token_expires_at,
      notifications_enabled, created_at, updated_at
    ) VALUES (
      ${conversationId}, ${personName}, ${normalizedEmail},
      ${verified ? now : null}, ${authUserId ?? null}, ${tokenHash}, ${tokenExpiry},
      true, ${now}, ${now}
    )
    ON CONFLICT (conversation_id) DO UPDATE SET
      visitor_name = EXCLUDED.visitor_name,
      visitor_email = EXCLUDED.visitor_email,
      email_verified_at = CASE
        WHEN ${verified} THEN ${now}
        WHEN conversation_contacts.visitor_email = EXCLUDED.visitor_email
          THEN conversation_contacts.email_verified_at
        ELSE NULL
      END,
      auth_user_id = CASE
        WHEN conversation_contacts.visitor_email = EXCLUDED.visitor_email
          THEN COALESCE(EXCLUDED.auth_user_id, conversation_contacts.auth_user_id)
        ELSE EXCLUDED.auth_user_id
      END,
      resume_token_hash = EXCLUDED.resume_token_hash,
      resume_token_expires_at = EXCLUDED.resume_token_expires_at,
      notifications_enabled = true,
      updated_at = EXCLUDED.updated_at
  `;
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(2, Math.min(6, local.length - visible.length)))}@${domain}`;
}
