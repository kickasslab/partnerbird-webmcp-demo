import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeMock, auditMock } = vi.hoisted(() => ({ executeMock: vi.fn(), auditMock: vi.fn() }));
vi.mock("@/server/webmcp/service", () => ({ executeWebMCPTool: executeMock }));
vi.mock("@/server/webmcp/audit", () => ({ recordWebMCPFailure: auditMock }));
vi.mock("@/server/webmcp/confirmation", () => ({
  clearWebMCPConfirmationCookie: () => "partnerbird_webmcp_confirmation=; Max-Age=0",
}));

import { POST } from "./route";

function request(origin = "https://partnerbird.example") {
  return new Request("https://partnerbird.example/api/webmcp/tools/get_profile", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
    body: JSON.stringify({ username: "darren" }),
  });
}

describe("WebMCP tool route", () => {
  beforeEach(() => { executeMock.mockReset(); auditMock.mockReset(); });

  it("dispatches a validated same-origin execution and returns no-store JSON", async () => {
    executeMock.mockResolvedValue({ username: "darren" });
    const response = await POST(request(), { params: Promise.resolve({ tool: "get_profile" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ ok: true, data: { username: "darren" } });
    expect(executeMock).toHaveBeenCalledWith("get_profile", { username: "darren" }, expect.any(Request));
  });

  it("rejects cross-origin state access before dispatch", async () => {
    const response = await POST(request("https://evil.example"), { params: Promise.resolve({ tool: "get_profile" }) });
    expect(response.status).toBe(403);
    expect(executeMock).not.toHaveBeenCalled();
  });
});
