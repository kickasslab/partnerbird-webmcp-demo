import { beforeEach, describe, expect, it, vi } from "vitest";

const { returningMock, updateMock } = vi.hoisted(() => {
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  return { returningMock: returning, updateMock: vi.fn(() => ({ set })) };
});

vi.mock("@/server/db/client", () => ({ db: { update: updateMock } }));
vi.mock("./auth", () => ({ requireWebMCPActor: vi.fn() }));

import type { WebMCPActor } from "./auth";
import {
  consumeWebMCPConfirmation,
  hashWebMCPConfirmationInput,
  webmcpConfirmationCookie,
} from "./confirmation";

const input = {
  requestId: "11111111-1111-4111-8111-111111111111",
  idempotencyKey: "stable-submit-key",
};

const actor = { profile: { id: "22222222-2222-4222-8222-222222222222" } } as WebMCPActor;

describe("WebMCP human confirmation", () => {
  beforeEach(() => {
    updateMock.mockClear();
    returningMock.mockReset();
  });

  it("binds confirmation hashes to the exact tool and payload", () => {
    const original = hashWebMCPConfirmationInput("submit_request", input);
    const differentKey = hashWebMCPConfirmationInput("submit_request", { ...input, idempotencyKey: "different-key" });
    const differentAction = hashWebMCPConfirmationInput("withdraw_request", input);
    expect(original).toHaveLength(64);
    expect(original).not.toBe(differentKey);
    expect(original).not.toBe(differentAction);
  });

  it("stores the opaque ticket in a scoped HttpOnly SameSite cookie", () => {
    const cookie = webmcpConfirmationCookie("ticket-id", "https://partnerbird.example/api/webmcp/confirmations");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api/webmcp/tools");
    expect(cookie).toContain("Secure");
  });

  it("atomically consumes an unexpired matching ticket and rejects reuse", async () => {
    const request = new Request("https://partnerbird.example/api/webmcp/tools/submit_request", {
      headers: { cookie: "partnerbird_webmcp_confirmation=33333333-3333-4333-8333-333333333333" },
    });
    returningMock.mockResolvedValueOnce([{ id: "33333333-3333-4333-8333-333333333333" }]);
    await expect(consumeWebMCPConfirmation(actor, "submit_request", input, request)).resolves.toBeUndefined();

    returningMock.mockResolvedValueOnce([]);
    await expect(consumeWebMCPConfirmation(actor, "submit_request", input, request)).rejects.toMatchObject({
      code: "CONFIRMATION_REQUIRED",
    });
    expect(updateMock).toHaveBeenCalledTimes(2);
  });
});
