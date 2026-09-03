import { describe, expect, it } from "vitest";

import type { PublicProfile } from "@/lib/profile-data";
import {
  countSharedPublicInterests,
  toWebMCPPublicProfile,
  toWebMCPPartnershipRequest,
  toWebMCPSearchResult,
} from "./safe-serializers";

const publicProfile: PublicProfile = {
  handle: "jane",
  displayName: "Jane Doe",
  headline: "AI newsletter creator",
  bio: ["Public biography"],
  avatarUrl: "/jane.png",
  websiteUrl: "https://jane.example",
  socialLinks: { linkedin: "https://linkedin.com/in/jane" },
  isOpen: true,
  isDemo: false,
  agentName: "PartnerBird",
  agentGreeting: "Hello",
  agentIntroduction: "Internal agent copy",
  interests: ["Newsletter swaps"],
  capabilities: [{ label: "Audience", detail: "Builders" }],
  projects: [{ name: "Signal", description: "A useful newsletter", fit: "Strong fit", tone: "emerald" }],
  guidelines: ["Private matching rule"],
  activations: [{ label: "Guest post", note: "Editorial review" }],
  metrics: [{ value: "10", label: "screened" }],
  collaborations: [],
};

describe("WebMCP safe serializers", () => {
  it("allowlists only intentional public profile fields", () => {
    const source = Object.assign({}, publicProfile, {
      email: "private@example.com",
      ownerUserId: "auth-user-id",
      stripeCustomerId: "cus_secret",
      privateEvaluationNotes: "secret",
      internalTrustScore: 43,
    });
    const serialized = toWebMCPPublicProfile(source);
    expect(serialized).toMatchObject({ username: "jane", partnershipInterests: ["Newsletter swaps"] });
    const output = JSON.stringify(serialized);
    for (const forbidden of ["private@example.com", "auth-user-id", "cus_secret", "secret", "TrustScore", "agentIntroduction", "guidelines", "metrics"]) {
      expect(output).not.toContain(forbidden);
    }
  });

  it("returns opaque request IDs and only party-facing request data", () => {
    const result = toWebMCPPartnershipRequest({
      id: "11111111-1111-4111-8111-111111111111",
      senderProfileId: "sender-private-id",
      recipientProfileId: "recipient-private-id",
      title: "Newsletter collaboration",
      body: "A detailed proposal suitable for both audiences.",
      status: "draft",
      submittedAt: null,
      respondedAt: null,
      withdrawnAt: null,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      updatedAt: new Date("2026-09-01T00:00:00Z"),
    }, "sender-private-id", { handle: "jane", displayName: "Jane" });
    expect(result.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(result)).not.toContain("private-id");
  });

  it("derives shared-interest counts only from caller-owned and already-public interest labels", () => {
    const publicResult = toWebMCPSearchResult(publicProfile);
    const count = countSharedPublicInterests(
      ["newsletter swaps", "Private caller preference"],
      publicResult.partnershipInterests,
    );

    expect(count).toBe(1);
    expect(publicResult.partnershipInterests).toEqual(["Newsletter swaps"]);
    expect(JSON.stringify(publicResult)).not.toContain("Private matching rule");
    expect(countSharedPublicInterests(["AI"], ["ai", "AI", "Podcasts"])).toBe(1);
  });
});
