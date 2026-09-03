import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNotNull } from "drizzle-orm";

import { db, neonSql } from "@/server/db/client";
import { conversationContacts, conversations, profiles } from "@/server/db/schema";
import {
  getPublicBaseUrl,
  isEmailDeliveryConfigured,
  sendConversationResumeEmail,
  sendOwnerReplyEmail,
} from "@/server/email/delivery";

const resumeLifetimeMs = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function resumeUrl(token: string) {
  const url = new URL("/conversation/resume", getPublicBaseUrl());
  url.searchParams.set("token", token);
  return url.toString();
}

export function canSendConversationEmail() {
  return isEmailDeliveryConfigured();
}

export async function issueConversationResumeEmail({
  conversationId,
  visitorName,
  visitorEmail,
  profileName,
}: {
  conversationId: string;
  visitorName: string;
  visitorEmail: string;
  profileName: string;
}) {
  if (!isEmailDeliveryConfigured()) {
    return { sent: false as const, reason: "not_configured" as const };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + resumeLifetimeMs);
  const normalizedEmail = visitorEmail.trim().toLowerCase();
  const normalizedName = visitorName.trim();

  await neonSql`
    INSERT INTO conversation_contacts (
      conversation_id, visitor_name, visitor_email, resume_token_hash,
      resume_token_expires_at, notifications_enabled, last_resume_email_sent_at,
      created_at, updated_at
    ) VALUES (
      ${conversationId}, ${normalizedName}, ${normalizedEmail}, ${tokenHash},
      ${expiresAt}, true, ${now}, ${now}, ${now}
    )
    ON CONFLICT (conversation_id) DO UPDATE SET
      visitor_name = EXCLUDED.visitor_name,
      visitor_email = EXCLUDED.visitor_email,
      email_verified_at = CASE
        WHEN conversation_contacts.visitor_email = EXCLUDED.visitor_email
          THEN conversation_contacts.email_verified_at
        ELSE NULL
      END,
      resume_token_hash = EXCLUDED.resume_token_hash,
      resume_token_expires_at = EXCLUDED.resume_token_expires_at,
      notifications_enabled = true,
      last_resume_email_sent_at = EXCLUDED.last_resume_email_sent_at,
      updated_at = EXCLUDED.updated_at
  `;

  await sendConversationResumeEmail({
    to: normalizedEmail,
    visitorName: normalizedName,
    profileName,
    resumeUrl: resumeUrl(token),
    tokenFingerprint: tokenHash.slice(0, 24),
  });

  return { sent: true as const, expiresAt };
}

export async function getConversationContactStatus(conversationId: string) {
  const [contact] = await db
    .select({
      visitorEmail: conversationContacts.visitorEmail,
      emailVerifiedAt: conversationContacts.emailVerifiedAt,
      authUserId: conversationContacts.authUserId,
    })
    .from(conversationContacts)
    .where(eq(conversationContacts.conversationId, conversationId))
    .limit(1);

  return contact
    ? {
        email: contact.visitorEmail,
        verified: Boolean(contact.emailVerifiedAt),
        accountCreated: Boolean(contact.authUserId),
      }
    : null;
}

export async function consumeConversationResumeToken(token: string, visitorSessionId: string) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  const now = new Date();
  const rows = (await neonSql`
    WITH valid_contact AS (
      SELECT conversation_id
      FROM conversation_contacts
      WHERE resume_token_hash = ${hashToken(token)}
        AND resume_token_expires_at > ${now}
      FOR UPDATE
    ), resumed AS (
      UPDATE conversations AS conversation
      SET visitor_session_id = ${visitorSessionId}, updated_at = ${now}
      FROM valid_contact
      WHERE conversation.id = valid_contact.conversation_id
        AND conversation.mode = 'live'
      RETURNING conversation.id, conversation.profile_id
    ), verified AS (
      UPDATE conversation_contacts AS contact
      SET email_verified_at = COALESCE(contact.email_verified_at, ${now}),
          updated_at = ${now}
      FROM resumed
      WHERE contact.conversation_id = resumed.id
      RETURNING contact.conversation_id
    )
    SELECT resumed.id AS "conversationId", profile.handle
    FROM resumed
    JOIN profiles AS profile ON profile.id = resumed.profile_id
    JOIN verified ON verified.conversation_id = resumed.id
    WHERE profile.is_published = true
    LIMIT 1
  `) as Array<{ conversationId: string; handle: string }>;

  return rows[0] ?? null;
}

export async function notifyVisitorOfOwnerReply({
  conversationId,
  messageId,
  message,
}: {
  conversationId: string;
  messageId: string;
  message: string;
}) {
  if (!isEmailDeliveryConfigured()) return { sent: false as const };

  const [contact] = await db
    .select({
      visitorName: conversationContacts.visitorName,
      visitorEmail: conversationContacts.visitorEmail,
      resumeTokenHash: conversationContacts.resumeTokenHash,
      resumeTokenExpiresAt: conversationContacts.resumeTokenExpiresAt,
      profileName: profiles.displayName,
    })
    .from(conversationContacts)
    .innerJoin(conversations, eq(conversations.id, conversationContacts.conversationId))
    .innerJoin(profiles, eq(profiles.id, conversations.profileId))
    .where(
      and(
        eq(conversationContacts.conversationId, conversationId),
        eq(conversationContacts.notificationsEnabled, true),
        isNotNull(conversationContacts.emailVerifiedAt),
        gt(conversationContacts.resumeTokenExpiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!contact) return { sent: false as const };

  // A hash cannot recreate the private link. Rotate to a fresh token before every notification.
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + resumeLifetimeMs);
  await db
    .update(conversationContacts)
    .set({ resumeTokenHash: tokenHash, resumeTokenExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(conversationContacts.conversationId, conversationId));

  try {
    await sendOwnerReplyEmail({
      to: contact.visitorEmail,
      visitorName: contact.visitorName,
      profileName: contact.profileName,
      messagePreview: message.trim().slice(0, 900),
      resumeUrl: resumeUrl(token),
      messageId,
    });
  } catch (error) {
    await db
      .update(conversationContacts)
      .set({
        resumeTokenHash: contact.resumeTokenHash,
        resumeTokenExpiresAt: contact.resumeTokenExpiresAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(conversationContacts.conversationId, conversationId),
          eq(conversationContacts.resumeTokenHash, tokenHash),
        ),
      );
    throw error;
  }
  return { sent: true as const };
}
