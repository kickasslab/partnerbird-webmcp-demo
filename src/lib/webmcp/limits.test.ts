import { describe, expect, it } from "vitest";

import { webmcpInboundLimits, webmcpPlanLimits } from "./limits";

describe("WebMCP outreach limits", () => {
  it("keeps paid tiers useful without granting bulk-outreach volume", () => {
    expect(webmcpPlanLimits.free.outreachPerDay).toBe(10);
    expect(webmcpPlanLimits.pro.outreachPerDay).toBe(20);
    expect(webmcpPlanLimits.business.outreachPerDay).toBe(25);
    expect(webmcpPlanLimits.business.outreachPerHour).toBe(12);
    expect(webmcpPlanLimits.business.outreachPerDay).toBeLessThanOrEqual(25);
  });

  it("keeps recipient-selected limits stricter than sender capacity", () => {
    expect(webmcpInboundLimits).toEqual({ standard: 20, strict: 8, very_strict: 3 });
  });
});
