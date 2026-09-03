import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, limitMock } = vi.hoisted(() => ({ getSessionMock: vi.fn(), limitMock: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: { getSession: getSessionMock } }));
vi.mock("@/server/db/client", () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: limitMock })) })) })),
  },
}));

import { requireWebMCPActor } from "./auth";

const user = { id: "auth-user", email: "owner@example.com", emailVerified: true, banned: false };
const profile = { id: "11111111-1111-4111-8111-111111111111", ownerUserId: user.id, onboardingComplete: true };

describe("WebMCP authenticated boundary", () => {
  beforeEach(() => { getSessionMock.mockReset(); limitMock.mockReset(); });

  it("bypasses cookie cache and rejects suspended accounts before data access", async () => {
    getSessionMock.mockResolvedValue({ data: { user: { ...user, banned: true } }, error: null });
    await expect(requireWebMCPActor()).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED" });
    expect(getSessionMock).toHaveBeenCalledWith({ query: { disableCookieCache: "true" } });
    expect(limitMock).not.toHaveBeenCalled();
  });

  it("rejects authenticated functionality when the user's master switch is off", async () => {
    getSessionMock.mockResolvedValue({ data: { user }, error: null });
    limitMock.mockResolvedValueOnce([profile]).mockResolvedValueOnce([]);
    await expect(requireWebMCPActor()).rejects.toMatchObject({ code: "WEBMCP_DISABLED" });
  });
});
