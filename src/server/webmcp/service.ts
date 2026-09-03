import "server-only";

import { createHash } from "node:crypto";

import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  ne,
  or,
  type SQL,
} from "drizzle-orm";

import {
  countSharedPublicInterests,
  toWebMCPPartnershipRequest,
  toWebMCPPublicProfile,
  toWebMCPSearchResult,
} from "@/lib/webmcp/safe-serializers";
import { webmcpInboundLimits, webmcpPlanLimits } from "@/lib/webmcp/limits";
import { webmcpInputSchemas, type WebMCPInputMap } from "@/lib/webmcp/schemas";
import type { WebMCPSettings, WebMCPToolName } from "@/lib/webmcp/types";
import { getCurrentPlan } from "@/server/billing/entitlements";
import { db } from "@/server/db/client";
import {
  activationCapabilities,
  profileItems,
  profileProjects,
  profiles,
  webmcpActivityEvents,
  webmcpBlocks,
  webmcpPartnershipRequests,
  webmcpSavedPartners,
  webmcpSettings,
} from "@/server/db/schema";
import { getPublicProfileByHandle } from "@/server/profiles/repository";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { getRequestIp, hashVisitorIp } from "@/server/security/visitor-session";
import {
  getOptionalWebMCPActor,
  loadWebMCPSettings,
  normalizeWebMCPSettings,
  requireWebMCPActor,
  type WebMCPActor,
} from "./auth";
import { consumeWebMCPConfirmation } from "./confirmation";
import { createPendingAgentHandoff } from "./agent-handoffs";
import { WebMCPServiceError } from "./errors";
import {
  canViewPartnershipRequest,
  isProfileDiscoverable,
  requestContentFailure,
  submissionPolicyFailure,
} from "./policy";

type EligibleTarget = {
  profile: typeof profiles.$inferSelect;
  settings: WebMCPSettings;
};

type RequestRow = typeof webmcpPartnershipRequests.$inferSelect;

export async function executeWebMCPTool(
  toolName: WebMCPToolName,
  untrustedInput: unknown,
  request: Request,
) {
  const schema = webmcpInputSchemas[toolName];
  const parsed = schema.safeParse(untrustedInput);
  if (!parsed.success) {
    throw new WebMCPServiceError(
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "Review the tool input.",
      400,
    );
  }

  switch (toolName) {
    case "get_profile":
      return getProfile(parsed.data as WebMCPInputMap["get_profile"], request);
    case "get_partnership_interests":
      return getPartnershipInterests(parsed.data as WebMCPInputMap["get_partnership_interests"], request);
    case "prepare_agent_handoff":
      return prepareAgentHandoff(parsed.data as WebMCPInputMap["prepare_agent_handoff"], request);
    case "search_partners":
      return searchPartners(parsed.data as WebMCPInputMap["search_partners"], request);
    case "get_my_profile":
      return getMyProfile(request);
    case "get_my_preferences":
      return getMyPreferences(request);
    case "save_partner":
      return savePartner(parsed.data as WebMCPInputMap["save_partner"], request);
    case "list_saved_partners":
      return listSavedPartners(parsed.data as WebMCPInputMap["list_saved_partners"], request);
    case "create_request_draft":
      return createRequestDraft(parsed.data as WebMCPInputMap["create_request_draft"], request);
    case "update_request_draft":
      return updateRequestDraft(parsed.data as WebMCPInputMap["update_request_draft"], request);
    case "list_my_requests":
      return listMyRequests(parsed.data as WebMCPInputMap["list_my_requests"], request);
    case "get_request":
      return getRequest(parsed.data as WebMCPInputMap["get_request"], request);
    case "submit_request":
      return submitRequest(parsed.data as WebMCPInputMap["submit_request"], request);
    case "withdraw_request":
      return withdrawRequest(parsed.data as WebMCPInputMap["withdraw_request"], request);
    case "respond_to_request":
      return respondToRequest(parsed.data as WebMCPInputMap["respond_to_request"], request);
  }
}

async function getProfile(input: WebMCPInputMap["get_profile"], request: Request) {
  const actor = await getOptionalWebMCPActor();
  await rateLimitRead(actor, request);
  const target = await getEligibleTarget(input.username, { publicRead: true });
  if (actor) await assertNotBlocked(actor.profile.id, target.profile.id);
  const profile = await getPublicProfileByHandle(target.profile.handle);
  if (!profile) throw profileUnavailable();
  await logActivity({ actorProfileId: actor?.profile.id, subjectProfileId: target.profile.id, action: "profile_accessed", outcome: "success" });
  return toWebMCPPublicProfile(profile);
}

async function getPartnershipInterests(
  input: WebMCPInputMap["get_partnership_interests"],
  request: Request,
) {
  const actor = await getOptionalWebMCPActor();
  await rateLimitRead(actor, request);
  const target = await getEligibleTarget(input.username, { publicRead: true });
  if (actor) await assertNotBlocked(actor.profile.id, target.profile.id);
  const profile = await getPublicProfileByHandle(target.profile.handle);
  if (!profile) throw profileUnavailable();
  return {
    username: profile.handle,
    partnershipInterests: [...profile.interests],
    capabilities: profile.capabilities.map(({ label, detail }) => ({ label, detail })),
    activationOptions: profile.activations.map(({ label, note }) => ({ label, note })),
  };
}

async function prepareAgentHandoff(
  input: WebMCPInputMap["prepare_agent_handoff"],
  request: Request,
) {
  const actor = await requireWebMCPActor();
  requireSetting(actor.settings.allowMatching);
  await rateLimitWrite(actor, request);
  const target = await getEligibleTarget(input.recipientUsername, {
    discovery: true,
    matching: true,
  });
  assertNotSelf(actor.profile.id, target.profile.id);
  await assertNotBlocked(actor.profile.id, target.profile.id);
  assertSafeRequestContent(
    `${input.personName} ${input.companyName}`,
    [input.companyDescription, input.partnershipGoal, input.contextSummary]
      .filter(Boolean)
      .join("\n"),
  );

  const result = await createPendingAgentHandoff({
    creatorProfileId: actor.profile.id,
    targetProfileId: target.profile.id,
    targetHandle: target.profile.handle,
    targetDisplayName: target.profile.displayName,
    handoff: input,
    requestUrl: request.url,
  });
  await logActivity({
    actorProfileId: actor.profile.id,
    subjectProfileId: target.profile.id,
    action: "agent_handoff_prepared",
    outcome: "success",
  });
  return result;
}

async function searchPartners(input: WebMCPInputMap["search_partners"], request: Request) {
  const actor = await requireWebMCPActor();
  const plan = await getCurrentPlan(actor.profile.id);
  throwIfLimited(await Promise.all([
    consumeRateLimit({
      keyHash: hashAccount(actor.profile.id),
      action: "webmcp_search",
      limit: webmcpPlanLimits[plan].searchPer10Minutes,
      windowMs: 10 * 60 * 1000,
    }),
    consumeRateLimit({
      keyHash: hashVisitorIp(getRequestIp(request)),
      action: "webmcp_search_ip",
      limit: 180,
      windowMs: 10 * 60 * 1000,
    }),
  ]));

  const filters: SQL[] = [
    eq(profiles.isPublished, true),
    eq(profiles.isOpen, true),
    ne(profiles.partnershipStatus, "unavailable"),
    ne(profiles.id, actor.profile.id),
    eq(webmcpSettings.enabled, true),
    eq(webmcpSettings.allowDiscovery, true),
    eq(webmcpSettings.allowMatching, true),
  ];
  if (input.cursor) filters.push(gt(profiles.handle, input.cursor));
  if (input.query) {
    const query = `%${escapeLike(input.query)}%`;
    filters.push(or(
      ilike(profiles.handle, query),
      ilike(profiles.displayName, query),
      ilike(profiles.headline, query),
      ilike(profiles.bio, query),
    )!);
  }

  const candidates = await db
    .select({ handle: profiles.handle, id: profiles.id })
    .from(profiles)
    .innerJoin(webmcpSettings, eq(webmcpSettings.profileId, profiles.id))
    .where(and(...filters))
    .orderBy(asc(profiles.handle))
    .limit(Math.min(30, input.limit * 3 + 1));
  const blockedIds = await getBlockedProfileIds(actor.profile.id);
  const visibleCandidates = candidates.filter((candidate) => !blockedIds.has(candidate.id));
  const publicProfiles = (await Promise.all(
    visibleCandidates.map(({ handle }) => getPublicProfileByHandle(handle)),
  )).filter((profile): profile is NonNullable<typeof profile> => Boolean(profile));
  const actorInterests = await loadPublicInterests(actor.profile.id);
  const ranked = publicProfiles
    .map((profile) => ({
      profile,
      matchCount: countSharedPublicInterests(actorInterests, profile.interests),
    }))
    .sort((a, b) => b.matchCount - a.matchCount || a.profile.handle.localeCompare(b.profile.handle));
  const page = ranked.slice(0, input.limit);
  const hasMore = ranked.length > input.limit || candidates.length > visibleCandidates.length;

  await logActivity({ actorProfileId: actor.profile.id, action: "partner_search_performed", outcome: "success", metadata: { resultCount: page.length } });
  return {
    results: page.map(({ profile, matchCount }) => ({
      ...toWebMCPSearchResult(profile),
      sharedPublicInterestCount: matchCount,
    })),
    nextCursor: hasMore ? page.at(-1)?.profile.handle ?? null : null,
    resultLimit: input.limit,
  };
}

async function getMyProfile(request: Request) {
  const actor = await requireWebMCPActor();
  await rateLimitRead(actor, request);
  const [items, projects, activations] = await Promise.all([
    db.select().from(profileItems).where(and(eq(profileItems.profileId, actor.profile.id), eq(profileItems.isEnabled, true))).orderBy(asc(profileItems.sortOrder)),
    db.select().from(profileProjects).where(and(eq(profileProjects.profileId, actor.profile.id), eq(profileProjects.isEnabled, true))).orderBy(asc(profileProjects.sortOrder)),
    db.select().from(activationCapabilities).where(and(eq(activationCapabilities.profileId, actor.profile.id), eq(activationCapabilities.isAvailable, true))).orderBy(asc(activationCapabilities.sortOrder)),
  ]);
  return {
    username: actor.profile.handle,
    displayName: actor.profile.displayName,
    profileUrl: `/@${actor.profile.handle}`,
    avatarUrl: actor.profile.avatarUrl,
    headline: actor.profile.headline,
    bio: actor.profile.bio.split(/\n\s*\n/).filter(Boolean),
    websiteUrl: actor.profile.websiteUrl,
    socialLinks: { ...actor.profile.socialLinks },
    isPublished: actor.profile.isPublished,
    partnershipStatus: actor.profile.partnershipStatus,
    partnershipInterests: items.filter((item) => item.kind === "interest").map((item) => item.label),
    capabilities: items.filter((item) => item.kind === "capability").map((item) => ({ label: item.label, detail: item.detail })),
    projects: projects.map((project) => ({ name: project.name, description: project.description })),
    activationOptions: activations.map((activation) => ({ label: activation.label, note: activation.note })),
  };
}

async function getMyPreferences(request: Request) {
  const actor = await requireWebMCPActor();
  await rateLimitRead(actor, request);
  const plan = await getCurrentPlan(actor.profile.id);
  return {
    ...actor.settings,
    plan,
    effectiveLimitClass: plan === "business" ? "business" : plan === "pro" ? "pro" : "standard",
    mandatoryPlatformSafetyControls: true,
  };
}

async function savePartner(input: WebMCPInputMap["save_partner"], request: Request) {
  const actor = await requireWebMCPActor();
  requireSetting(actor.settings.allowSavePartners);
  await rateLimitWrite(actor, request);
  const target = await getEligibleTarget(input.username, { discovery: true });
  assertNotSelf(actor.profile.id, target.profile.id);
  await assertNotBlocked(actor.profile.id, target.profile.id);
  const [created] = await db
    .insert(webmcpSavedPartners)
    .values({ profileId: actor.profile.id, partnerProfileId: target.profile.id })
    .onConflictDoNothing()
    .returning();
  const profile = await getPublicProfileByHandle(target.profile.handle);
  if (!profile) throw profileUnavailable();
  await logActivity({ actorProfileId: actor.profile.id, subjectProfileId: target.profile.id, action: "partner_saved", outcome: "success", resourceRef: created?.id });
  return { saved: true, alreadySaved: !created, partner: toWebMCPSearchResult(profile) };
}

async function listSavedPartners(
  input: WebMCPInputMap["list_saved_partners"],
  request: Request,
) {
  const actor = await requireWebMCPActor();
  await rateLimitRead(actor, request);
  const rows = await db
    .select({ handle: profiles.handle, savedAt: webmcpSavedPartners.createdAt })
    .from(webmcpSavedPartners)
    .innerJoin(profiles, eq(profiles.id, webmcpSavedPartners.partnerProfileId))
    .innerJoin(webmcpSettings, eq(webmcpSettings.profileId, profiles.id))
    .where(and(
      eq(webmcpSavedPartners.profileId, actor.profile.id),
      eq(webmcpSettings.enabled, true),
      eq(webmcpSettings.allowPublicProfileRead, true),
      eq(profiles.isPublished, true),
    ))
    .orderBy(desc(webmcpSavedPartners.createdAt))
    .limit(input.limit);
  const results = await Promise.all(rows.map(async (row) => {
    const profile = await getPublicProfileByHandle(row.handle);
    return profile ? { ...toWebMCPSearchResult(profile), savedAt: row.savedAt.toISOString() } : null;
  }));
  return { savedPartners: results.filter(Boolean), resultLimit: input.limit };
}

async function createRequestDraft(
  input: WebMCPInputMap["create_request_draft"],
  request: Request,
) {
  const actor = await requireWebMCPActor();
  requireSetting(actor.settings.allowCreateDrafts);
  assertSafeRequestContent(input.title, input.body);
  await rateLimitWrite(actor, request);
  const target = await getEligibleTarget(input.recipientUsername, { publicRead: true });
  assertNotSelf(actor.profile.id, target.profile.id);
  await assertNotBlocked(actor.profile.id, target.profile.id);
  const [draft] = await db.insert(webmcpPartnershipRequests).values({
    senderProfileId: actor.profile.id,
    recipientProfileId: target.profile.id,
    title: input.title,
    body: input.body,
    status: "draft",
  }).returning();
  await logActivity({ actorProfileId: actor.profile.id, action: "request_draft_created", outcome: "success", resourceRef: draft.id });
  return toWebMCPPartnershipRequest(draft, actor.profile.id, target.profile);
}

async function updateRequestDraft(
  input: WebMCPInputMap["update_request_draft"],
  request: Request,
) {
  const actor = await requireWebMCPActor();
  requireSetting(actor.settings.allowCreateDrafts);
  await rateLimitWrite(actor, request);
  const existing = await loadRequest(input.requestId);
  if (!existing) throw requestNotFound();
  if (existing.senderProfileId !== actor.profile.id || existing.status !== "draft") {
    throw new WebMCPServiceError("NOT_AUTHORIZED", "Only an owned draft can be updated.", 403);
  }
  assertSafeRequestContent(input.title ?? existing.title, input.body ?? existing.body);
  const [updated] = await db.update(webmcpPartnershipRequests).set({
    ...(input.title ? { title: input.title } : {}),
    ...(input.body ? { body: input.body } : {}),
    updatedAt: new Date(),
  }).where(and(eq(webmcpPartnershipRequests.id, existing.id), eq(webmcpPartnershipRequests.senderProfileId, actor.profile.id), eq(webmcpPartnershipRequests.status, "draft"))).returning();
  if (!updated) throw requestNotFound();
  const counterparty = await loadProfileSummary(updated.recipientProfileId);
  await logActivity({ actorProfileId: actor.profile.id, action: "request_draft_updated", outcome: "success", resourceRef: updated.id });
  return toWebMCPPartnershipRequest(updated, actor.profile.id, counterparty);
}

async function listMyRequests(input: WebMCPInputMap["list_my_requests"], request: Request) {
  const actor = await requireWebMCPActor();
  await rateLimitRead(actor, request);
  const directionFilter = input.direction === "incoming"
    ? and(eq(webmcpPartnershipRequests.recipientProfileId, actor.profile.id), ne(webmcpPartnershipRequests.status, "draft"))!
    : input.direction === "outgoing"
      ? eq(webmcpPartnershipRequests.senderProfileId, actor.profile.id)
      : or(
          eq(webmcpPartnershipRequests.senderProfileId, actor.profile.id),
          and(eq(webmcpPartnershipRequests.recipientProfileId, actor.profile.id), ne(webmcpPartnershipRequests.status, "draft")),
        )!;
  const rows = await db.select().from(webmcpPartnershipRequests).where(and(
    directionFilter,
    ...(input.status === "all" ? [] : [eq(webmcpPartnershipRequests.status, input.status)]),
  )).orderBy(desc(webmcpPartnershipRequests.updatedAt)).limit(input.limit);
  return {
    requests: await Promise.all(rows.map(async (row) => toWebMCPPartnershipRequest(
      row,
      actor.profile.id,
      await loadProfileSummary(row.senderProfileId === actor.profile.id ? row.recipientProfileId : row.senderProfileId),
    ))),
    resultLimit: input.limit,
  };
}

async function getRequest(input: WebMCPInputMap["get_request"], request: Request) {
  const actor = await requireWebMCPActor();
  await rateLimitRead(actor, request);
  const row = await loadRequest(input.requestId);
  if (!row) throw requestNotFound();
  assertRequestParty(row, actor.profile.id);
  const counterpartyId = row.senderProfileId === actor.profile.id ? row.recipientProfileId : row.senderProfileId;
  return toWebMCPPartnershipRequest(row, actor.profile.id, await loadProfileSummary(counterpartyId));
}

async function submitRequest(input: WebMCPInputMap["submit_request"], request: Request) {
  const actor = await requireWebMCPActor();
  requireSetting(actor.settings.allowSubmitRequests);
  const existing = await loadRequest(input.requestId);
  if (!existing) throw requestNotFound();
  if (existing.senderProfileId !== actor.profile.id) {
    throw new WebMCPServiceError("NOT_AUTHORIZED", "Only the sender can submit this request.", 403);
  }
  if (existing.status === "submitted" && existing.submitIdempotencyKey === input.idempotencyKey) {
    return toWebMCPPartnershipRequest(existing, actor.profile.id, await loadProfileSummary(existing.recipientProfileId));
  }
  if (existing.status !== "draft") {
    throw new WebMCPServiceError("DUPLICATE_REQUEST", "This request cannot be submitted again.", 409);
  }
  assertSafeRequestContent(existing.title, existing.body);
  const recipient = await getEligibleTargetById(existing.recipientProfileId);
  await assertSubmissionEligibility(actor, recipient);
  const [recentPairRequest] = await db.select({ id: webmcpPartnershipRequests.id }).from(webmcpPartnershipRequests).where(and(
    eq(webmcpPartnershipRequests.senderProfileId, actor.profile.id),
    eq(webmcpPartnershipRequests.recipientProfileId, recipient.profile.id),
    ne(webmcpPartnershipRequests.id, existing.id),
    ne(webmcpPartnershipRequests.status, "draft"),
    gt(webmcpPartnershipRequests.submittedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
  )).limit(1);
  if (recentPairRequest) {
    throw new WebMCPServiceError(
      "RATE_LIMITED",
      "Request cannot currently be sent because PartnerBird's outreach protections were triggered.",
      429,
    );
  }
  await consumeWebMCPConfirmation(actor, "submit_request", input, request);
  await rateLimitOutreach(actor, recipient, request);

  const duplicate = await db.select({ id: webmcpPartnershipRequests.id }).from(webmcpPartnershipRequests).where(and(
    eq(webmcpPartnershipRequests.senderProfileId, actor.profile.id),
    eq(webmcpPartnershipRequests.recipientProfileId, recipient.profile.id),
    eq(webmcpPartnershipRequests.status, "submitted"),
    ne(webmcpPartnershipRequests.id, existing.id),
  )).limit(1);
  if (duplicate.length) throw duplicateRequest();

  try {
    const now = new Date();
    const [submitted] = await db.update(webmcpPartnershipRequests).set({
      status: "submitted",
      submitIdempotencyKey: input.idempotencyKey,
      submittedAt: now,
      updatedAt: now,
    }).where(and(
      eq(webmcpPartnershipRequests.id, existing.id),
      eq(webmcpPartnershipRequests.senderProfileId, actor.profile.id),
      eq(webmcpPartnershipRequests.status, "draft"),
    )).returning();
    if (!submitted) throw duplicateRequest();
    await logActivity({ actorProfileId: actor.profile.id, subjectProfileId: recipient.profile.id, action: "request_submitted", outcome: "success", resourceRef: submitted.id, idempotencyRef: input.idempotencyKey });
    return toWebMCPPartnershipRequest(submitted, actor.profile.id, recipient.profile);
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateRequest();
    throw error;
  }
}

async function withdrawRequest(input: WebMCPInputMap["withdraw_request"], request: Request) {
  const actor = await requireWebMCPActor();
  requireSetting(actor.settings.allowSubmitRequests);
  const existing = await loadRequest(input.requestId);
  if (!existing) throw requestNotFound();
  if (existing.senderProfileId !== actor.profile.id) throw new WebMCPServiceError("NOT_AUTHORIZED", "Only the sender can withdraw this request.", 403);
  if (existing.status === "withdrawn" && existing.withdrawIdempotencyKey === input.idempotencyKey) {
    return toWebMCPPartnershipRequest(existing, actor.profile.id, await loadProfileSummary(existing.recipientProfileId));
  }
  if (existing.status !== "submitted") throw new WebMCPServiceError("INVALID_REQUEST", "Only a submitted request can be withdrawn.", 409);
  await consumeWebMCPConfirmation(actor, "withdraw_request", input, request);
  await rateLimitWrite(actor, request);
  const now = new Date();
  const [withdrawn] = await db.update(webmcpPartnershipRequests).set({ status: "withdrawn", withdrawIdempotencyKey: input.idempotencyKey, withdrawnAt: now, updatedAt: now }).where(and(eq(webmcpPartnershipRequests.id, existing.id), eq(webmcpPartnershipRequests.senderProfileId, actor.profile.id), eq(webmcpPartnershipRequests.status, "submitted"))).returning();
  if (!withdrawn) throw new WebMCPServiceError("INVALID_REQUEST", "This request is no longer eligible for withdrawal.", 409);
  await logActivity({ actorProfileId: actor.profile.id, subjectProfileId: withdrawn.recipientProfileId, action: "request_withdrawn", outcome: "success", resourceRef: withdrawn.id, idempotencyRef: input.idempotencyKey });
  return toWebMCPPartnershipRequest(withdrawn, actor.profile.id, await loadProfileSummary(withdrawn.recipientProfileId));
}

async function respondToRequest(input: WebMCPInputMap["respond_to_request"], request: Request) {
  const actor = await requireWebMCPActor();
  const existing = await loadRequest(input.requestId);
  if (!existing) throw requestNotFound();
  if (existing.recipientProfileId !== actor.profile.id) throw new WebMCPServiceError("NOT_AUTHORIZED", "Only the recipient can respond to this request.", 403);
  const requestedStatus = input.response === "accept" ? "accepted" : "declined";
  if (existing.status === requestedStatus && existing.responseIdempotencyKey === input.idempotencyKey) {
    return toWebMCPPartnershipRequest(existing, actor.profile.id, await loadProfileSummary(existing.senderProfileId));
  }
  if (existing.status !== "submitted") throw new WebMCPServiceError("INVALID_REQUEST", "This request is no longer awaiting a response.", 409);
  await assertNotBlocked(existing.senderProfileId, actor.profile.id);
  await consumeWebMCPConfirmation(actor, "respond_to_request", input, request);
  await rateLimitWrite(actor, request);
  const now = new Date();
  const [responded] = await db.update(webmcpPartnershipRequests).set({ status: requestedStatus, responseIdempotencyKey: input.idempotencyKey, respondedAt: now, updatedAt: now }).where(and(eq(webmcpPartnershipRequests.id, existing.id), eq(webmcpPartnershipRequests.recipientProfileId, actor.profile.id), eq(webmcpPartnershipRequests.status, "submitted"))).returning();
  if (!responded) throw new WebMCPServiceError("INVALID_REQUEST", "This request is no longer awaiting a response.", 409);
  await logActivity({ actorProfileId: actor.profile.id, subjectProfileId: responded.senderProfileId, action: `request_${requestedStatus}`, outcome: "success", resourceRef: responded.id, idempotencyRef: input.idempotencyKey });
  return toWebMCPPartnershipRequest(responded, actor.profile.id, await loadProfileSummary(responded.senderProfileId));
}

async function getEligibleTarget(
  username: string,
  requirement: { publicRead?: boolean; discovery?: boolean; matching?: boolean } = {},
): Promise<EligibleTarget> {
  const [row] = await db.select({ profile: profiles, settings: webmcpSettings }).from(profiles).leftJoin(webmcpSettings, eq(webmcpSettings.profileId, profiles.id)).where(and(eq(profiles.handle, username.toLowerCase()), eq(profiles.isPublished, true))).limit(1);
  if (!row) throw profileUnavailable();
  const settings = normalizeWebMCPSettings(row.settings);
  if (!settings.enabled || (requirement.publicRead && !settings.allowPublicProfileRead) || (requirement.discovery && !settings.allowDiscovery) || (requirement.matching && !settings.allowMatching)) {
    throw profileUnavailable();
  }
  if (requirement.discovery && !isProfileDiscoverable({
    published: row.profile.isPublished,
    open: row.profile.isOpen,
    partnershipStatus: row.profile.partnershipStatus,
    settings,
  })) throw profileUnavailable();
  return { profile: row.profile, settings };
}

async function getEligibleTargetById(profileId: string): Promise<EligibleTarget> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile) throw profileUnavailable();
  return { profile, settings: await loadWebMCPSettings(profile.id) };
}

async function assertSubmissionEligibility(actor: WebMCPActor, recipient: EligibleTarget) {
  const [blocked, sharedInterestCount] = await Promise.all([
    isBlocked(actor.profile.id, recipient.profile.id),
    recipient.settings.interestMatchMode === "require"
      ? Promise.all([loadPublicInterests(actor.profile.id), loadPublicInterests(recipient.profile.id)])
          .then(([sender, receiver]) => countSharedPublicInterests(sender, receiver))
      : Promise.resolve(0),
  ]);
  const failure = submissionPolicyFailure({
    senderEmailVerified: actor.emailVerified,
    senderProfileComplete: actor.profile.onboardingComplete,
    senderSuspended: false,
    blocked,
    duplicateActiveRequest: false,
    recipientPublished: recipient.profile.isPublished,
    recipientOpen: recipient.profile.isOpen && recipient.profile.partnershipStatus !== "unavailable",
    recipientSettings: recipient.settings,
    sharedInterestCount,
  });
  if (!failure) return;
  const message = failure === "BLOCKED"
    ? "This interaction is not available."
    : failure === "RECIPIENT_NOT_ACCEPTING_AGENT_REQUESTS"
      ? "The recipient is not accepting WebMCP requests."
      : "Recipient requirements are not met.";
  throw new WebMCPServiceError(failure, message, failure === "RECIPIENT_NOT_ACCEPTING_AGENT_REQUESTS" ? 409 : 403);
}

async function rateLimitRead(actor: WebMCPActor | null, request: Request) {
  await consumeOrThrow({
    keyHash: actor ? hashAccount(actor.profile.id) : hashVisitorIp(getRequestIp(request)),
    action: "webmcp_read",
    limit: 120,
    windowMs: 10 * 60 * 1000,
  });
}

async function rateLimitWrite(actor: WebMCPActor, request: Request) {
  const plan = await getCurrentPlan(actor.profile.id);
  const results = await Promise.all([
    consumeRateLimit({ keyHash: hashAccount(actor.profile.id), action: "webmcp_write", limit: webmcpPlanLimits[plan].writesPerHour, windowMs: 60 * 60 * 1000 }),
    consumeRateLimit({ keyHash: hashVisitorIp(getRequestIp(request)), action: "webmcp_write_ip", limit: 120, windowMs: 60 * 60 * 1000 }),
  ]);
  throwIfLimited(results);
}

async function rateLimitOutreach(actor: WebMCPActor, recipient: EligibleTarget, request: Request) {
  const plan = await getCurrentPlan(actor.profile.id);
  const results = await Promise.all([
    consumeRateLimit({ keyHash: hashAccount(actor.profile.id), action: "webmcp_outreach_hour", limit: webmcpPlanLimits[plan].outreachPerHour, windowMs: 60 * 60 * 1000 }),
    consumeRateLimit({ keyHash: hashAccount(actor.profile.id), action: "webmcp_outreach_day", limit: webmcpPlanLimits[plan].outreachPerDay, windowMs: 24 * 60 * 60 * 1000 }),
    consumeRateLimit({ keyHash: hashAccount(recipient.profile.id), action: "webmcp_inbound_day", limit: webmcpInboundLimits[recipient.settings.inboundStrictness], windowMs: 24 * 60 * 60 * 1000 }),
    consumeRateLimit({ keyHash: hashVisitorIp(getRequestIp(request)), action: "webmcp_outreach_ip", limit: 40, windowMs: 24 * 60 * 60 * 1000 }),
  ]);
  throwIfLimited(results, "Request cannot currently be sent because PartnerBird's outreach protections were triggered.");
}

async function consumeOrThrow(input: Parameters<typeof consumeRateLimit>[0]) {
  throwIfLimited([await consumeRateLimit(input)]);
}

function throwIfLimited(
  results: Array<{ allowed: boolean; retryAfterSeconds: number }>,
  message = "This WebMCP action is temporarily rate limited. Please try again later.",
) {
  const denied = results.filter((result) => !result.allowed);
  if (!denied.length) return;
  throw new WebMCPServiceError(
    "RATE_LIMITED",
    message,
    429,
    Math.max(...denied.map((result) => result.retryAfterSeconds)),
  );
}

async function assertNotBlocked(firstProfileId: string, secondProfileId: string) {
  if (await isBlocked(firstProfileId, secondProfileId)) throw new WebMCPServiceError("BLOCKED", "This interaction is not available.", 403);
}

async function isBlocked(firstProfileId: string, secondProfileId: string) {
  const [blocked] = await db.select({ blockerProfileId: webmcpBlocks.blockerProfileId }).from(webmcpBlocks).where(or(
    and(eq(webmcpBlocks.blockerProfileId, firstProfileId), eq(webmcpBlocks.blockedProfileId, secondProfileId)),
    and(eq(webmcpBlocks.blockerProfileId, secondProfileId), eq(webmcpBlocks.blockedProfileId, firstProfileId)),
  )).limit(1);
  return Boolean(blocked);
}

async function getBlockedProfileIds(profileId: string) {
  const rows = await db.select().from(webmcpBlocks).where(or(eq(webmcpBlocks.blockerProfileId, profileId), eq(webmcpBlocks.blockedProfileId, profileId)));
  return new Set(rows.map((row) => row.blockerProfileId === profileId ? row.blockedProfileId : row.blockerProfileId));
}

async function loadPublicInterests(profileId: string) {
  const rows = await db.select({ label: profileItems.label }).from(profileItems).where(and(eq(profileItems.profileId, profileId), eq(profileItems.kind, "interest"), eq(profileItems.isEnabled, true)));
  return rows.map((row) => row.label);
}

async function loadRequest(requestId: string): Promise<RequestRow | null> {
  const [row] = await db.select().from(webmcpPartnershipRequests).where(eq(webmcpPartnershipRequests.id, requestId)).limit(1);
  return row ?? null;
}

async function loadProfileSummary(profileId: string) {
  const [profile] = await db.select({ handle: profiles.handle, displayName: profiles.displayName }).from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile) throw requestNotFound();
  return profile;
}

function assertRequestParty(row: RequestRow, viewerProfileId: string) {
  if (!canViewPartnershipRequest(viewerProfileId, row)) {
    throw requestNotFound();
  }
}

function requireSetting(allowed: boolean) {
  if (!allowed) throw new WebMCPServiceError("NOT_AUTHORIZED", "This WebMCP capability is disabled in your settings.", 403);
}

function assertNotSelf(firstId: string, secondId: string) {
  if (firstId === secondId) throw new WebMCPServiceError("INVALID_REQUEST", "Choose a different PartnerBird profile.", 400);
}

function assertSafeRequestContent(title: string, body: string) {
  if (requestContentFailure(title, body)) {
    throw new WebMCPServiceError("INVALID_REQUEST", "Request content did not pass PartnerBird's safety checks.", 400);
  }
}

async function logActivity(input: {
  actorProfileId?: string;
  subjectProfileId?: string;
  action: string;
  outcome: "success" | "failed";
  failureCategory?: string;
  resourceRef?: string;
  idempotencyRef?: string;
  metadata?: Record<string, string | number | boolean>;
}) {
  await db.insert(webmcpActivityEvents).values({
    actorProfileId: input.actorProfileId,
    subjectProfileId: input.subjectProfileId,
    action: input.action,
    outcome: input.outcome,
    failureCategory: input.failureCategory,
    resourceRef: input.resourceRef,
    idempotencyRef: input.idempotencyRef,
    metadata: input.metadata ?? {},
  });
}

function hashAccount(profileId: string) {
  return createHash("sha256").update(`webmcp:${profileId}`).digest("hex");
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function profileUnavailable() {
  return new WebMCPServiceError("PROFILE_NOT_DISCOVERABLE", "This profile is not available through WebMCP.", 404);
}

function requestNotFound() {
  return new WebMCPServiceError("REQUEST_NOT_FOUND", "Partnership request not found.", 404);
}

function duplicateRequest() {
  return new WebMCPServiceError("DUPLICATE_REQUEST", "An active request already exists for this recipient.", 409);
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
