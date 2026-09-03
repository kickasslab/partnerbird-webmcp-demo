import "server-only";

import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth/server";
import { defaultWebMCPSettings, type WebMCPSettings } from "@/lib/webmcp/types";
import { db } from "@/server/db/client";
import { profiles, webmcpSettings } from "@/server/db/schema";
import { WebMCPServiceError } from "./errors";

type ManagedAuthUser = {
  id: string;
  email: string;
  emailVerified?: boolean | null;
  banned?: boolean | null;
};

export type WebMCPActor = {
  userId: string;
  email: string;
  emailVerified: boolean;
  profile: typeof profiles.$inferSelect;
  settings: WebMCPSettings;
};

export function normalizeWebMCPSettings(
  row: Partial<typeof webmcpSettings.$inferSelect> | null | undefined,
): WebMCPSettings {
  if (!row) return { ...defaultWebMCPSettings };
  return {
    enabled: row.enabled === true,
    allowPublicProfileRead: row.allowPublicProfileRead === true,
    allowDiscovery: row.allowDiscovery === true,
    allowMatching: row.allowMatching === true,
    allowSavePartners: row.allowSavePartners === true,
    allowCreateDrafts: row.allowCreateDrafts === true,
    allowSubmitRequests: row.allowSubmitRequests === true,
    allowIncomingRequests: row.allowIncomingRequests === true,
    requireVerifiedEmail: row.requireVerifiedEmail !== false,
    requireCompleteProfile: row.requireCompleteProfile !== false,
    interestMatchMode:
      row.interestMatchMode === "off" || row.interestMatchMode === "require"
        ? row.interestMatchMode
        : "prefer",
    inboundStrictness:
      row.inboundStrictness === "standard" || row.inboundStrictness === "very_strict"
        ? row.inboundStrictness
        : "strict",
  };
}

export async function loadWebMCPSettings(profileId: string) {
  const [row] = await db
    .select()
    .from(webmcpSettings)
    .where(eq(webmcpSettings.profileId, profileId))
    .limit(1);
  return normalizeWebMCPSettings(row);
}

export async function getOptionalWebMCPActor(): Promise<WebMCPActor | null> {
  // Bypass the five-minute signed cookie payload so suspension/session revocation
  // takes effect at the authorization boundary for every WebMCP execution.
  const { data: session, error } = await auth.getSession({
    query: { disableCookieCache: "true" },
  });
  if (error || !session?.user) return null;

  const sessionUser = session.user as ManagedAuthUser;
  if (sessionUser.banned === true) {
    throw new WebMCPServiceError("ACCOUNT_SUSPENDED", "This account cannot use WebMCP.", 403);
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.ownerUserId, sessionUser.id))
    .limit(1);
  if (!profile) return null;

  return {
    userId: sessionUser.id,
    email: sessionUser.email,
    emailVerified: sessionUser.emailVerified === true,
    profile,
    settings: await loadWebMCPSettings(profile.id),
  };
}

export async function requireWebMCPActor(): Promise<WebMCPActor> {
  const actor = await getOptionalWebMCPActor();
  if (!actor) throw new WebMCPServiceError("AUTH_REQUIRED", "Sign in to PartnerBird to use this tool.", 401);
  if (!actor.emailVerified) {
    throw new WebMCPServiceError("VERIFIED_EMAIL_REQUIRED", "Verify your PartnerBird email before using WebMCP.", 403);
  }
  if (!actor.profile.onboardingComplete) {
    throw new WebMCPServiceError("PROFILE_REQUIREMENTS_NOT_MET", "Complete your PartnerBird profile before using WebMCP.", 403);
  }
  if (!actor.settings.enabled) {
    throw new WebMCPServiceError("WEBMCP_DISABLED", "WebMCP is disabled for this PartnerBird account.", 403);
  }
  return actor;
}
