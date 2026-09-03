import {
  getEntitlements,
  type PlanEntitlements,
  type PlanKey,
} from "./plans";

export const usageScopes = ["public", "test", "demo"] as const;
export type UsageScope = (typeof usageScopes)[number];

export const usageLimitCodes = [
  "monthly_ai_conversations",
  "daily_ai_conversations",
  "conversation_ai_replies",
  "monthly_website_analyses",
  "conversation_website_analyses",
] as const;
export type UsageLimitCode = (typeof usageLimitCodes)[number];

export type UsageCounts = {
  monthlyAiConversations: number;
  dailyAiConversations: number;
  conversationAiReplies: number;
  monthlyWebsiteAnalyses: number;
  conversationWebsiteAnalyses: number;
};

export type UsageRequest = {
  startsConversation: boolean;
  includesWebsiteAnalysis: boolean;
};

export type UsageDecision =
  | { allowed: true; approaching: UsageLimitCode[] }
  | { allowed: false; code: UsageLimitCode };

export type UsageWindow = {
  start: Date;
  end: Date;
};

export function getCalendarUsageWindow(
  period: "daily" | "monthly",
  at = new Date(),
): UsageWindow {
  if (period === "daily") {
    const start = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
    );
    return { start, end: new Date(start.getTime() + 86_400_000) };
  }
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
  return { start, end };
}
export function checkUsageLimit(
  entitlements: PlanEntitlements,
  counts: UsageCounts,
  request: UsageRequest,
): UsageDecision {
  if (
    request.startsConversation &&
    counts.monthlyAiConversations >= entitlements.aiConversationsPerMonth
  ) {
    return { allowed: false, code: "monthly_ai_conversations" };
  }
  if (
    request.startsConversation &&
    counts.dailyAiConversations >= entitlements.newAiConversationsPerDay
  ) {
    return { allowed: false, code: "daily_ai_conversations" };
  }
  if (counts.conversationAiReplies >= entitlements.aiRepliesPerConversation) {
    return { allowed: false, code: "conversation_ai_replies" };
  }
  if (
    request.includesWebsiteAnalysis &&
    counts.monthlyWebsiteAnalyses >= entitlements.websiteAnalysesPerMonth
  ) {
    return { allowed: false, code: "monthly_website_analyses" };
  }
  if (
    request.includesWebsiteAnalysis &&
    counts.conversationWebsiteAnalyses >=
      entitlements.websiteAnalysesPerConversation
  ) {
    return { allowed: false, code: "conversation_website_analyses" };
  }

  const approaching: UsageLimitCode[] = [];
  if (
    request.startsConversation &&
    isApproaching(
      counts.monthlyAiConversations + 1,
      entitlements.aiConversationsPerMonth,
    )
  ) {
    approaching.push("monthly_ai_conversations");
  }
  if (
    isApproaching(
      counts.conversationAiReplies + 1,
      entitlements.aiRepliesPerConversation,
    )
  ) {
    approaching.push("conversation_ai_replies");
  }
  if (
    request.includesWebsiteAnalysis &&
    isApproaching(
      counts.monthlyWebsiteAnalyses + 1,
      entitlements.websiteAnalysesPerMonth,
    )
  ) {
    approaching.push("monthly_website_analyses");
  }
  return { allowed: true, approaching };
}

export function checkPlanUsageLimit(
  plan: PlanKey,
  counts: UsageCounts,
  request: UsageRequest,
) {
  return checkUsageLimit(getEntitlements(plan), counts, request);
}

export function getRemainingUsage(plan: PlanKey, counts: UsageCounts) {
  const limits = getEntitlements(plan);
  return {
    aiConversations: Math.max(
      0,
      limits.aiConversationsPerMonth - counts.monthlyAiConversations,
    ),
    websiteAnalyses: Math.max(
      0,
      limits.websiteAnalysesPerMonth - counts.monthlyWebsiteAnalyses,
    ),
  };
}

export function usagePercent(used: number, limit: number) {
  if (limit <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

function isApproaching(used: number, limit: number) {
  return used >= Math.max(1, Math.ceil(limit * 0.8));
}

