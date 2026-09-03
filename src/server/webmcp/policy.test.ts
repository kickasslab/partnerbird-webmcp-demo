import { describe, expect, it } from "vitest";

import { defaultWebMCPSettings } from "@/lib/webmcp/types";
import {
  canViewPartnershipRequest,
  isProfileDiscoverable,
  requestContentFailure,
  submissionPolicyFailure,
} from "./policy";

const accepting = {
  ...defaultWebMCPSettings,
  enabled: true,
  allowDiscovery: true,
  allowMatching: true,
  allowIncomingRequests: true,
};

const eligible = {
  senderEmailVerified: true,
  senderProfileComplete: true,
  senderSuspended: false,
  blocked: false,
  duplicateActiveRequest: false,
  recipientPublished: true,
  recipientOpen: true,
  recipientSettings: accepting,
  sharedInterestCount: 1,
};

describe("WebMCP policy", () => {
  it("includes only explicitly opted-in discoverable matching profiles", () => {
    expect(isProfileDiscoverable({ published: true, open: true, partnershipStatus: "open", settings: accepting, forMatching: true })).toBe(true);
    expect(isProfileDiscoverable({ published: true, open: true, partnershipStatus: "open", settings: { ...accepting, enabled: false }, forMatching: true })).toBe(false);
    expect(isProfileDiscoverable({ published: true, open: true, partnershipStatus: "open", settings: { ...accepting, allowDiscovery: false }, forMatching: true })).toBe(false);
  });

  it.each([
    [{ blocked: true }, "BLOCKED"],
    [{ duplicateActiveRequest: true }, "DUPLICATE_REQUEST"],
    [{ senderSuspended: true }, "ACCOUNT_SUSPENDED"],
    [{ senderEmailVerified: false }, "VERIFIED_EMAIL_REQUIRED"],
    [{ senderProfileComplete: false }, "PROFILE_REQUIREMENTS_NOT_MET"],
    [{ recipientSettings: { ...accepting, allowIncomingRequests: false } }, "RECIPIENT_NOT_ACCEPTING_AGENT_REQUESTS"],
    [{ recipientOpen: false }, "RECIPIENT_NOT_ACCEPTING_AGENT_REQUESTS"],
    [{ recipientSettings: { ...accepting, interestMatchMode: "require" }, sharedInterestCount: 0 }, "PROFILE_REQUIREMENTS_NOT_MET"],
  ])("enforces request protection %j", (overrides, expected) => {
    expect(submissionPolicyFailure({ ...eligible, ...overrides } as typeof eligible)).toBe(expected);
  });

  it("allows only request parties to read private requests", () => {
    const request = { senderProfileId: "sender", recipientProfileId: "recipient", status: "submitted" };
    expect(canViewPartnershipRequest("sender", request)).toBe(true);
    expect(canViewPartnershipRequest("recipient", request)).toBe(true);
    expect(canViewPartnershipRequest("stranger", request)).toBe(false);
    expect(canViewPartnershipRequest("recipient", { ...request, status: "draft" })).toBe(false);
  });

  it("rejects obvious abusive request payloads without exposing thresholds", () => {
    expect(requestContentFailure("Hello", "A thoughtful collaboration proposal.")).toBeNull();
    expect(requestContentFailure("Spam", Array.from({ length: 30 }, () => "repeat").join(" "))).toBe("INVALID_REQUEST");
  });
});
