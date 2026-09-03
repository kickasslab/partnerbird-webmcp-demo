import { describe, expect, it } from "vitest";

import { canUseFeature, getEntitlements } from "./plans";
import {
  checkPlanUsageLimit,
  getCalendarUsageWindow,
  getRemainingUsage,
  type UsageCounts,
} from "./usage-policy";

const zeroUsage = {
  monthlyAiConversations: 0,
  dailyAiConversations: 0,
  conversationAiReplies: 0,
  monthlyWebsiteAnalyses: 0,
  conversationWebsiteAnalyses: 0,
} satisfies UsageCounts;

describe("PartnerBird plan entitlements", () => {
  it("uses the launch conversation allowances", () => {
    expect(getEntitlements("free").aiConversationsPerMonth).toBe(20);
    expect(getEntitlements("pro").aiConversationsPerMonth).toBe(150);
    expect(getEntitlements("business").aiConversationsPerMonth).toBe(500);
  });

  it("allows 20 Free monthly conversations and rejects the 21st", () => {
    expect(
      checkPlanUsageLimit(
        "free",
        { ...zeroUsage, monthlyAiConversations: 19 },
        { startsConversation: true, includesWebsiteAnalysis: false },
      ).allowed,
    ).toBe(true);
    expect(
      checkPlanUsageLimit(
        "free",
        { ...zeroUsage, monthlyAiConversations: 20 },
        { startsConversation: true, includesWebsiteAnalysis: false },
      ),
    ).toEqual({ allowed: false, code: "monthly_ai_conversations" });
  });

  it("allows 5 Free daily conversations and rejects the 6th", () => {
    expect(
      checkPlanUsageLimit(
        "free",
        { ...zeroUsage, dailyAiConversations: 4 },
        { startsConversation: true, includesWebsiteAnalysis: false },
      ).allowed,
    ).toBe(true);
    expect(
      checkPlanUsageLimit(
        "free",
        { ...zeroUsage, dailyAiConversations: 5 },
        { startsConversation: true, includesWebsiteAnalysis: false },
      ),
    ).toEqual({ allowed: false, code: "daily_ai_conversations" });
  });

  it("uses the 8, 12, and 16 response guardrails", () => {
    for (const [plan, limit] of [
      ["free", 8],
      ["pro", 12],
      ["business", 16],
    ] as const) {
      expect(
        checkPlanUsageLimit(
          plan,
          { ...zeroUsage, conversationAiReplies: limit - 1 },
          { startsConversation: false, includesWebsiteAnalysis: false },
        ).allowed,
      ).toBe(true);
      expect(
        checkPlanUsageLimit(
          plan,
          { ...zeroUsage, conversationAiReplies: limit },
          { startsConversation: false, includesWebsiteAnalysis: false },
        ),
      ).toEqual({ allowed: false, code: "conversation_ai_replies" });
    }
  });

  it("enforces website-analysis limits per conversation and month", () => {
    expect(
      checkPlanUsageLimit(
        "free",
        { ...zeroUsage, conversationWebsiteAnalyses: 1 },
        { startsConversation: false, includesWebsiteAnalysis: true },
      ),
    ).toEqual({ allowed: false, code: "conversation_website_analyses" });
    expect(
      checkPlanUsageLimit(
        "pro",
        { ...zeroUsage, monthlyWebsiteAnalyses: 100 },
        { startsConversation: false, includesWebsiteAnalysis: true },
      ),
    ).toEqual({ allowed: false, code: "monthly_website_analyses" });
  });

  it("resets daily and monthly windows at UTC boundaries", () => {
    const at = new Date("2026-09-18T17:25:00.000Z");
    expect(getCalendarUsageWindow("daily", at)).toEqual({
      start: new Date("2026-09-18T00:00:00.000Z"),
      end: new Date("2026-09-19T00:00:00.000Z"),
    });
    expect(getCalendarUsageWindow("monthly", at)).toEqual({
      start: new Date("2026-09-01T00:00:00.000Z"),
      end: new Date("2026-10-01T00:00:00.000Z"),
    });
  });

  it("preserves consumed usage across upgrades and clamps downgrades", () => {
    const used = { ...zeroUsage, monthlyAiConversations: 20 };
    expect(getRemainingUsage("pro", used).aiConversations).toBe(130);
    expect(
      getRemainingUsage("free", {
        ...zeroUsage,
        monthlyAiConversations: 100,
      }).aiConversations,
    ).toBe(0);
  });

  it("returns feature entitlements without Stripe knowledge", () => {
    expect(canUseFeature("free", "public_profile")).toBe(true);
    expect(canUseFeature("free", "opportunity_notes")).toBe(false);
    expect(canUseFeature("pro", "opportunity_notes")).toBe(true);
    expect(canUseFeature("business", "data_export")).toBe(true);
    expect(canUseFeature("business", "team_collaboration")).toBe(false);
  });
});
