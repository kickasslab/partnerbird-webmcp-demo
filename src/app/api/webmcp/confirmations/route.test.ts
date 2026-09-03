import { beforeEach, describe, expect, it, vi } from "vitest";

const { issueMock } = vi.hoisted(() => ({ issueMock: vi.fn() }));
vi.mock("@/server/webmcp/confirmation", () => ({
  issueWebMCPConfirmation: issueMock,
  webmcpConfirmationCookie: (value: string) => `partnerbird_webmcp_confirmation=${value}; Path=/api/webmcp/tools; HttpOnly; SameSite=Strict; Max-Age=120`,
}));

import { POST } from "./route";

const input = {
  requestId: "11111111-1111-4111-8111-111111111111",
  idempotencyKey: "stable-submit-key",
};

function request(origin = "https://partnerbird.example") {
  return new Request("https://partnerbird.example/api/webmcp/confirmations", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
    body: JSON.stringify({ tool: "submit_request", input }),
  });
}

describe("WebMCP human confirmation route", () => {
  beforeEach(() => issueMock.mockReset());

  it("places an opaque approval in an HttpOnly cookie without exposing it to the agent", async () => {
    issueMock.mockResolvedValue("22222222-2222-4222-8222-222222222222");
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect(await response.json()).toEqual({ ok: true });
    expect(issueMock).toHaveBeenCalledWith("submit_request", input);
  });

  it("rejects cross-origin approval attempts", async () => {
    const response = await POST(request("https://evil.example"));
    expect(response.status).toBe(403);
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("does not issue confirmations for low-risk tools", async () => {
    const lowRiskRequest = new Request("https://partnerbird.example/api/webmcp/confirmations", {
      method: "POST",
      headers: { Origin: "https://partnerbird.example", "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "get_profile", input: { username: "darren" } }),
    });
    const response = await POST(lowRiskRequest);
    expect(response.status).toBe(400);
    expect(issueMock).not.toHaveBeenCalled();
  });
});
