import "server-only";

import { Resend } from "resend";

import { ConversationResumeEmail } from "@/emails/conversation-resume-email";
import { OwnerReplyEmail } from "@/emails/owner-reply-email";

let resendClient: Resend | undefined;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  resendClient ??= new Resend(apiKey);
  return resendClient;
}

export function isEmailDeliveryConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
    process.env.PARTNERBIRD_EMAIL_FROM?.trim(),
  );
}

function getEmailFrom() {
  const from = process.env.PARTNERBIRD_EMAIL_FROM?.trim();
  if (!from) throw new Error("EMAIL_FROM_NOT_CONFIGURED");
  return from;
}

export function getPublicBaseUrl() {
  const configured = process.env.PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (configured) return new URL(configured).origin;

  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (vercelHost) return `https://${vercelHost.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;

  return "http://localhost:3000";
}

export async function sendConversationResumeEmail({
  to,
  visitorName,
  profileName,
  resumeUrl,
  tokenFingerprint,
}: {
  to: string;
  visitorName: string;
  profileName: string;
  resumeUrl: string;
  tokenFingerprint: string;
}) {
  const client = getResendClient();
  if (!client) throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");

  const { error } = await client.emails.send(
    {
      from: getEmailFrom(),
      to,
      subject: `Continue your conversation with ${profileName}`,
      react: (
        <ConversationResumeEmail
          visitorName={visitorName}
          profileName={profileName}
          resumeUrl={resumeUrl}
        />
      ),
    },
    { headers: { "Idempotency-Key": `conversation-resume-${tokenFingerprint}` } },
  );
  if (error) throw new Error(`EMAIL_DELIVERY_FAILED:${error.name}`);
}

export async function sendOwnerReplyEmail({
  to,
  visitorName,
  profileName,
  messagePreview,
  resumeUrl,
  messageId,
}: {
  to: string;
  visitorName: string;
  profileName: string;
  messagePreview: string;
  resumeUrl: string;
  messageId: string;
}) {
  const client = getResendClient();
  if (!client) throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");

  const { error } = await client.emails.send(
    {
      from: getEmailFrom(),
      to,
      subject: `${profileName} replied on PartnerBird`,
      react: (
        <OwnerReplyEmail
          visitorName={visitorName}
          profileName={profileName}
          messagePreview={messagePreview}
          resumeUrl={resumeUrl}
        />
      ),
    },
    { headers: { "Idempotency-Key": `owner-reply-${messageId}` } },
  );
  if (error) throw new Error(`EMAIL_DELIVERY_FAILED:${error.name}`);
}
