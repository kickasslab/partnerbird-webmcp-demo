import { beforeEach, describe, expect, it, vi } from "vitest";

const { activateMock } = vi.hoisted(() => ({ activateMock: vi.fn() }));
vi.mock("@/server/webmcp/agent-handoffs", () => ({ activateAgentHandoff: activateMock }));

import { POST } from "./route";

function request(origin = "https://partnerbird.example") {
  return new Request(`https://partnerbird.example/api/agent/handoffs/${"a".repeat(43)}/activate`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "Sec-Fetch-Site": origin === "https://partnerbird.example" ? "same-origin" : "cross-site",
    },
    body: "{}",
  });
}

describe("WebMCP handoff activation route", () => {
  beforeEach(() => activateMock.mockReset());

  it("rejects cross-origin activation before reading the handoff", async () => {
    const response = await POST(request("https://evil.example"), {
      params: Promise.resolve({ token: "a".repeat(43) }),
    });
    expect(response.status).toBe(403);
    expect(activateMock).not.toHaveBeenCalled();
  });

  it("preserves authentication failures from the server boundary", async () => {
    activateMock.mockResolvedValue({
      ok: false,
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Sign in to continue this handoff.",
    });
    const response = await POST(request(), {
      params: Promise.resolve({ token: "a".repeat(43) }),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: "AUTH_REQUIRED", message: "Sign in to continue this handoff." },
    });
  });

  it("returns no private identifiers after activation", async () => {
    activateMock.mockResolvedValue({
      ok: true,
      conversationId: "00000000-0000-4000-8000-000000000001",
      profileHandle: "darren",
      profileIsDemo: true,
      alreadyActivated: false,
    });
    const response = await POST(request(), {
      params: Promise.resolve({ token: "a".repeat(43) }),
    });
    expect(response.status).toBe(200);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain("conversationReady");
    expect(serialized).not.toMatch(/conversationId|profileHandle|userId|tokenHash|email/i);
  });
});
