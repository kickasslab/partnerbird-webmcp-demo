import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";

import { getEntitlements, type PlanKey } from "@/lib/billing/plans";
import {
  getCalendarUsageWindow,
  getRemainingUsage,
  type UsageLimitCode,
  type UsageScope,
} from "@/lib/billing/usage-policy";
import { db, neonSql } from "@/server/db/client";
import {
  analyticsEvents,
  usagePeriods,
  usageReservations,
} from "@/server/db/schema";

export type UsageReservationResult =
  | {
      allowed: true;
      reservationId: string;
      startsConversation: boolean;
      monthlyAiConversations: number;
      dailyAiConversations: number;
      conversationAiReplies: number;
      monthlyWebsiteAnalyses: number;
      conversationWebsiteAnalyses: number;
    }
  | { allowed: false; code: UsageLimitCode };

export async function reservePublicUsage({
  profileId,
  conversationId,
  idempotencyKey,
  plan,
  includesWebsiteAnalysis,
  at = new Date(),
}: {
  profileId: string;
  conversationId: string;
  idempotencyKey: string;
  plan: PlanKey;
  includesWebsiteAnalysis: boolean;
  at?: Date;
}): Promise<UsageReservationResult> {
  await releaseStaleUsageReservations(profileId, at);
  const limits = getEntitlements(plan);
  const monthly = getCalendarUsageWindow("monthly", at);
  const daily = getCalendarUsageWindow("daily", at);

  const [result] = (await neonSql`
    SELECT * FROM partnerbird_reserve_usage(
      ${profileId}::uuid,
      ${conversationId}::uuid,
      ${idempotencyKey}::varchar,
      ${monthly.start}::timestamptz,
      ${monthly.end}::timestamptz,
      ${daily.start}::timestamptz,
      ${daily.end}::timestamptz,
      ${includesWebsiteAnalysis}::boolean,
      ${limits.aiConversationsPerMonth}::integer,
      ${limits.newAiConversationsPerDay}::integer,
      ${limits.aiRepliesPerConversation}::integer,
      ${limits.websiteAnalysesPerMonth}::integer,
      ${limits.websiteAnalysesPerConversation}::integer,
      ${at}::timestamptz
    )
  `) as Array<{
    limitCode: UsageLimitCode | null;
    reservationId: string | null;
    startsConversation: boolean;
    monthlyAiConversations: number;
    dailyAiConversations: number;
    conversationAiReplies: number;
    monthlyWebsiteAnalyses: number;
    conversationWebsiteAnalyses: number;
  }>;

  if (!result || result.limitCode) {
    return {
      allowed: false,
      code: result?.limitCode ?? "conversation_ai_replies",
    };
  }
  if (!result.reservationId) {
    throw new Error("USAGE_RESERVATION_CONFLICT");
  }
  return {
    allowed: true,
    reservationId: result.reservationId,
    startsConversation: result.startsConversation,
    monthlyAiConversations: Number(result.monthlyAiConversations),
    dailyAiConversations: Number(result.dailyAiConversations),
    conversationAiReplies: Number(result.conversationAiReplies),
    monthlyWebsiteAnalyses: Number(result.monthlyWebsiteAnalyses),
    conversationWebsiteAnalyses: Number(result.conversationWebsiteAnalyses),
  };
}

export async function completeUsageReservation(reservationId: string) {
  await db
    .update(usageReservations)
    .set({ status: "completed", updatedAt: new Date() })
    .where(
      and(
        eq(usageReservations.id, reservationId),
        eq(usageReservations.status, "reserved"),
      ),
    );
}

export async function releaseUsageReservation(
  reservationId: string,
  at = new Date(),
) {
  await neonSql`
    WITH account_lock AS (
      SELECT pg_advisory_xact_lock(hashtextextended(profile_id::text, 0))
      FROM usage_reservations
      WHERE id=${reservationId}
    ), released AS (
      UPDATE usage_reservations AS reservation
      SET status='released', updated_at=${at}
      FROM account_lock
      WHERE reservation.id=${reservationId} AND reservation.status='reserved'
      RETURNING reservation.profile_id, reservation.conversation_id,
                reservation.scope, reservation.monthly_period_start,
                reservation.daily_period_start, reservation.counted_conversation,
                reservation.counted_reply, reservation.counted_website_analysis
    ),
    monthly_update AS (
      UPDATE usage_periods
      SET ai_conversations=GREATEST(0, usage_periods.ai_conversations - CASE WHEN released.counted_conversation THEN 1 ELSE 0 END),
          ai_replies=GREATEST(0, usage_periods.ai_replies - CASE WHEN released.counted_reply THEN 1 ELSE 0 END),
          website_analyses=GREATEST(0, usage_periods.website_analyses - CASE WHEN released.counted_website_analysis THEN 1 ELSE 0 END),
          updated_at=${at}
      FROM released
      WHERE usage_periods.profile_id=released.profile_id
        AND usage_periods.scope=released.scope
        AND usage_periods.period_type='monthly'
        AND usage_periods.period_start=released.monthly_period_start
    ),
    daily_update AS (
      UPDATE usage_periods
      SET ai_conversations=GREATEST(0, usage_periods.ai_conversations - CASE WHEN released.counted_conversation THEN 1 ELSE 0 END),
          updated_at=${at}
      FROM released
      WHERE usage_periods.profile_id=released.profile_id
        AND usage_periods.scope=released.scope
        AND usage_periods.period_type='daily'
        AND usage_periods.period_start=released.daily_period_start
    )
    UPDATE conversation_usage
    SET conversation_counted=CASE WHEN released.counted_conversation THEN false ELSE conversation_usage.conversation_counted END,
        ai_reply_count=GREATEST(0, conversation_usage.ai_reply_count - CASE WHEN released.counted_reply THEN 1 ELSE 0 END),
        website_analysis_count=GREATEST(0, conversation_usage.website_analysis_count - CASE WHEN released.counted_website_analysis THEN 1 ELSE 0 END),
        updated_at=${at}
    FROM released
    WHERE conversation_usage.conversation_id=released.conversation_id
  `;
}

export async function recordIsolatedUsage({
  profileId,
  scope,
  includesWebsiteAnalysis,
  at = new Date(),
}: {
  profileId: string;
  scope: Exclude<UsageScope, "public">;
  includesWebsiteAnalysis: boolean;
  at?: Date;
}) {
  const monthly = getCalendarUsageWindow("monthly", at);
  await db
    .insert(usagePeriods)
    .values({
      profileId,
      scope,
      periodType: "monthly",
      periodStart: monthly.start,
      periodEnd: monthly.end,
      aiConversations: 1,
      aiReplies: 1,
      websiteAnalyses: includesWebsiteAnalysis ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [
        usagePeriods.profileId,
        usagePeriods.scope,
        usagePeriods.periodType,
        usagePeriods.periodStart,
      ],
      set: {
        aiConversations: sql`${usagePeriods.aiConversations} + 1`,
        aiReplies: sql`${usagePeriods.aiReplies} + 1`,
        websiteAnalyses: includesWebsiteAnalysis
          ? sql`${usagePeriods.websiteAnalyses} + 1`
          : sql`${usagePeriods.websiteAnalyses}`,
        periodEnd: monthly.end,
        updatedAt: at,
      },
    });
}

export async function getUsageSummary(
  profileId: string,
  plan: PlanKey,
  at = new Date(),
) {
  const monthly = getCalendarUsageWindow("monthly", at);
  const [period] = await db
    .select({
      aiConversations: usagePeriods.aiConversations,
      websiteAnalyses: usagePeriods.websiteAnalyses,
    })
    .from(usagePeriods)
    .where(
      and(
        eq(usagePeriods.profileId, profileId),
        eq(usagePeriods.scope, "public"),
        eq(usagePeriods.periodType, "monthly"),
        eq(usagePeriods.periodStart, monthly.start),
      ),
    )
    .limit(1);
  const counts = {
    monthlyAiConversations: period?.aiConversations ?? 0,
    dailyAiConversations: 0,
    conversationAiReplies: 0,
    monthlyWebsiteAnalyses: period?.websiteAnalyses ?? 0,
    conversationWebsiteAnalyses: 0,
  };
  const limits = getEntitlements(plan);
  return {
    periodStart: monthly.start,
    periodEnd: monthly.end,
    aiConversations: {
      used: counts.monthlyAiConversations,
      limit: limits.aiConversationsPerMonth,
      remaining: getRemainingUsage(plan, counts).aiConversations,
    },
    websiteAnalyses: {
      used: counts.monthlyWebsiteAnalyses,
      limit: limits.websiteAnalysesPerMonth,
      remaining: getRemainingUsage(plan, counts).websiteAnalyses,
    },
  };
}

export async function recordUsageEvent({
  profileId,
  eventType,
  idempotencyKey,
  metadata,
}: {
  profileId: string;
  eventType: "usage_limit_approaching" | "usage_limit_reached";
  idempotencyKey: string;
  metadata: Record<string, string | number | boolean>;
}) {
  await db
    .insert(analyticsEvents)
    .values({ profileId, eventType, idempotencyKey, metadata })
    .onConflictDoNothing();
}

async function releaseStaleUsageReservations(profileId: string, at: Date) {
  const stale = await db
    .select({ id: usageReservations.id })
    .from(usageReservations)
    .where(
      and(
        eq(usageReservations.profileId, profileId),
        eq(usageReservations.status, "reserved"),
        lt(usageReservations.createdAt, new Date(at.getTime() - 5 * 60_000)),
      ),
    )
    .limit(20);
  for (const reservation of stale) {
    await releaseUsageReservation(reservation.id, at);
  }
}
