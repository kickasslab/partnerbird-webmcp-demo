import "server-only";

import { and, desc, eq, ne, or } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  profiles,
  webmcpActivityEvents,
  webmcpBlocks,
  webmcpPartnershipRequests,
  webmcpSavedPartners,
  webmcpSettings,
} from "@/server/db/schema";
import { getReadyOwnerProfile } from "@/server/profiles/owner";
import { loadWebMCPSettings } from "./auth";

export async function getPublicWebMCPPolicy(handle: string) {
  const [row] = await db.select({
    enabled: webmcpSettings.enabled,
    allowPublicProfileRead: webmcpSettings.allowPublicProfileRead,
    allowDiscovery: webmcpSettings.allowDiscovery,
    allowMatching: webmcpSettings.allowMatching,
  }).from(profiles).innerJoin(
    webmcpSettings,
    eq(webmcpSettings.profileId, profiles.id),
  ).where(and(
    eq(profiles.handle, handle.trim().toLowerCase()),
    eq(profiles.isPublished, true),
  )).limit(1);

  return {
    publicProfileAvailable: Boolean(row?.enabled && row.allowPublicProfileRead),
    discoveryEnabled: Boolean(row?.enabled && row.allowDiscovery),
    matchingEnabled: Boolean(row?.enabled && row.allowMatching),
  };
}

export async function getOwnerWebMCPPageData() {
  const profile = await getReadyOwnerProfile();
  const [settings, activity, savedPartners, requests, blockedProfiles] = await Promise.all([
    loadWebMCPSettings(profile.id),
    db.select({
      id: webmcpActivityEvents.id,
      action: webmcpActivityEvents.action,
      outcome: webmcpActivityEvents.outcome,
      failureCategory: webmcpActivityEvents.failureCategory,
      createdAt: webmcpActivityEvents.createdAt,
    }).from(webmcpActivityEvents).where(or(
      eq(webmcpActivityEvents.actorProfileId, profile.id),
      eq(webmcpActivityEvents.subjectProfileId, profile.id),
    )).orderBy(desc(webmcpActivityEvents.createdAt)).limit(30),
    db.select({
      id: webmcpSavedPartners.id,
      handle: profiles.handle,
      displayName: profiles.displayName,
      headline: profiles.headline,
      createdAt: webmcpSavedPartners.createdAt,
    }).from(webmcpSavedPartners).innerJoin(
      profiles,
      eq(profiles.id, webmcpSavedPartners.partnerProfileId),
    ).where(eq(webmcpSavedPartners.profileId, profile.id)).orderBy(desc(webmcpSavedPartners.createdAt)).limit(10),
    db.select().from(webmcpPartnershipRequests).where(or(
      eq(webmcpPartnershipRequests.senderProfileId, profile.id),
      and(eq(webmcpPartnershipRequests.recipientProfileId, profile.id), ne(webmcpPartnershipRequests.status, "draft")),
    )).orderBy(desc(webmcpPartnershipRequests.updatedAt)).limit(10),
    db.select({
      handle: profiles.handle,
      displayName: profiles.displayName,
      createdAt: webmcpBlocks.createdAt,
    }).from(webmcpBlocks).innerJoin(
      profiles,
      eq(profiles.id, webmcpBlocks.blockedProfileId),
    ).where(eq(webmcpBlocks.blockerProfileId, profile.id)).orderBy(desc(webmcpBlocks.createdAt)),
  ]);

  const counterpartIds = [...new Set(requests.map((request) =>
    request.senderProfileId === profile.id ? request.recipientProfileId : request.senderProfileId,
  ))];
  const counterpartRows = counterpartIds.length
    ? await Promise.all(counterpartIds.map(async (id) => {
        const [row] = await db.select({ id: profiles.id, handle: profiles.handle, displayName: profiles.displayName }).from(profiles).where(eq(profiles.id, id)).limit(1);
        return row;
      }))
    : [];
  const counterpartById = new Map(counterpartRows.filter(Boolean).map((row) => [row!.id, row!]));

  return {
    profile,
    settings,
    activity,
    savedPartners,
    blockedProfiles,
    requests: requests.map((request) => {
      const counterpartId = request.senderProfileId === profile.id ? request.recipientProfileId : request.senderProfileId;
      return {
        id: request.id,
        direction: request.senderProfileId === profile.id ? "Outgoing" : "Incoming",
        title: request.title,
        status: request.status,
        updatedAt: request.updatedAt,
        counterpart: counterpartById.get(counterpartId) ?? null,
      };
    }),
  };
}
