import { describe, expect, it } from "vitest";

import { webmcpInputSchemas } from "./schemas";

describe("WebMCP input validation", () => {
  it.each(["submit_request", "withdraw_request", "respond_to_request"] as const)("keeps human confirmation credentials out of the agent input for %s", (name) => {
    const common = { requestId: "11111111-1111-4111-8111-111111111111", idempotencyKey: "stable-key-123" };
    const input = name === "respond_to_request" ? { ...common, response: "accept" } : common;
    expect(webmcpInputSchemas[name].safeParse(input).success).toBe(true);
    expect(webmcpInputSchemas[name].safeParse({ ...input, confirmed: true }).success).toBe(false);
  });

  it("requires stable bounded idempotency keys", () => {
    expect(webmcpInputSchemas.submit_request.safeParse({ requestId: "11111111-1111-4111-8111-111111111111", idempotencyKey: "short" }).success).toBe(false);
  });
});
