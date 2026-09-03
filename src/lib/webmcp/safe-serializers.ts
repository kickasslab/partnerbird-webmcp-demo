import type { PublicProfile } from "@/lib/profile-data";

export type WebMCPPublicProfile = ReturnType<typeof toWebMCPPublicProfile>;

export function toWebMCPPublicProfile(profile: PublicProfile, baseUrl = "") {
  return {
    username: profile.handle,
    displayName: profile.displayName,
    profileUrl: `${baseUrl}/@${profile.handle}`,
    avatarUrl: profile.avatarUrl,
    headline: profile.headline,
    bio: profile.bio,
    websiteUrl: profile.websiteUrl ?? null,
    socialLinks: { ...profile.socialLinks },
    acceptingPartnerships: profile.isOpen,
    partnershipInterests: [...profile.interests],
    capabilities: profile.capabilities.map(({ label, detail }) => ({ label, detail })),
    projects: profile.projects.map(({ name, description, fit }) => ({ name, description, fit })),
    activationOptions: profile.activations.map(({ label, note }) => ({ label, note })),
  };
}

export function toWebMCPSearchResult(profile: PublicProfile, baseUrl = "") {
  return {
    username: profile.handle,
    displayName: profile.displayName,
    headline: profile.headline,
    profileUrl: `${baseUrl}/@${profile.handle}`,
    avatarUrl: profile.avatarUrl,
    partnershipInterests: [...profile.interests],
    acceptingPartnerships: profile.isOpen,
  };
}

/** Counts only the overlap between caller-owned interests and interests already present in a public DTO. */
export function countSharedPublicInterests(callerInterests: string[], publicTargetInterests: string[]) {
  const callerSet = new Set(callerInterests.map(normalizeInterest).filter(Boolean));
  const targetSet = new Set(publicTargetInterests.map(normalizeInterest).filter(Boolean));
  return [...targetSet].filter((interest) => callerSet.has(interest)).length;
}

export type WebMCPRequestRecord = {
  id: string;
  senderProfileId: string;
  recipientProfileId: string;
  title: string;
  body: string;
  status: string;
  submittedAt: Date | null;
  respondedAt: Date | null;
  withdrawnAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toWebMCPPartnershipRequest(
  request: WebMCPRequestRecord,
  viewerProfileId: string,
  counterparty: { handle: string; displayName: string },
) {
  return {
    requestId: request.id,
    direction: request.senderProfileId === viewerProfileId ? "outgoing" : "incoming",
    counterparty: {
      username: counterparty.handle,
      displayName: counterparty.displayName,
      profileUrl: `/@${counterparty.handle}`,
    },
    title: request.title,
    body: request.body,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    submittedAt: request.submittedAt?.toISOString() ?? null,
    respondedAt: request.respondedAt?.toISOString() ?? null,
    withdrawnAt: request.withdrawnAt?.toISOString() ?? null,
  };
}

function normalizeInterest(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}
