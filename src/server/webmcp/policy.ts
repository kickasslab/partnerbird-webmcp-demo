import type { WebMCPErrorCode, WebMCPSettings } from "@/lib/webmcp/types";

export function isProfileDiscoverable(input: {
  published: boolean;
  open: boolean;
  partnershipStatus: string;
  settings: WebMCPSettings;
  forMatching?: boolean;
}) {
  return input.published && input.open && input.partnershipStatus !== "unavailable" &&
    input.settings.enabled && input.settings.allowDiscovery &&
    (!input.forMatching || input.settings.allowMatching);
}

export function submissionPolicyFailure(input: {
  senderEmailVerified: boolean;
  senderProfileComplete: boolean;
  senderSuspended: boolean;
  blocked: boolean;
  duplicateActiveRequest: boolean;
  recipientPublished: boolean;
  recipientOpen: boolean;
  recipientSettings: WebMCPSettings;
  sharedInterestCount: number;
}): WebMCPErrorCode | null {
  if (input.senderSuspended) return "ACCOUNT_SUSPENDED";
  if (input.blocked) return "BLOCKED";
  if (input.duplicateActiveRequest) return "DUPLICATE_REQUEST";
  if (!input.recipientSettings.enabled || !input.recipientSettings.allowIncomingRequests || !input.recipientPublished || !input.recipientOpen) {
    return "RECIPIENT_NOT_ACCEPTING_AGENT_REQUESTS";
  }
  if (input.recipientSettings.requireVerifiedEmail && !input.senderEmailVerified) return "VERIFIED_EMAIL_REQUIRED";
  if (input.recipientSettings.requireCompleteProfile && !input.senderProfileComplete) return "PROFILE_REQUIREMENTS_NOT_MET";
  if (input.recipientSettings.interestMatchMode === "require" && input.sharedInterestCount === 0) return "PROFILE_REQUIREMENTS_NOT_MET";
  return null;
}

export function canViewPartnershipRequest(
  viewerProfileId: string,
  request: { senderProfileId: string; recipientProfileId: string; status?: string },
) {
  if (request.senderProfileId === viewerProfileId) return true;
  return request.status !== "draft" && request.recipientProfileId === viewerProfileId;
}

export function requestContentFailure(title: string, body: string): WebMCPErrorCode | null {
  const combined = `${title}\n${body}`;
  const urls = combined.match(/https?:\/\//gi)?.length ?? 0;
  const hasControlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(combined);
  const words = combined.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const frequency = new Map<string, number>();
  for (const word of words) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  return urls > 5 || hasControlCharacters || [...frequency.values()].some((count) => count > 25)
    ? "INVALID_REQUEST"
    : null;
}
