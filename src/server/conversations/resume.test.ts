import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  neonSql: vi.fn(),
  sendConversationResumeEmail: vi.fn(),
  sendOwnerReplyEmail: vi.fn(),
  isEmailDeliveryConfigured: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  db: {},
  neonSql: mocks.neonSql,
}));

vi.mock("@/server/email/delivery", () => ({
  getPublicBaseUrl: () => "https://partnerbird.example",
  isEmailDeliveryConfigured: mocks.isEmailDeliveryConfigured,
  sendConversationResumeEmail: mocks.sendConversationResumeEmail,
  sendOwnerReplyEmail: mocks.sendOwnerReplyEmail,
}));

import {
  consumeConversationResumeToken,
  issueConversationResumeEmail,
} from "@/server/conversations/resume";

describe("conversation resume links", () => {
  beforeEach(() => {
    mocks.neonSql.mockReset();
    mocks.sendConversationResumeEmail.mockReset();
    mocks.sendOwnerReplyEmail.mockReset();
    mocks.isEmailDeliveryConfigured.mockReset();
  });

  it("does not create a claim when email delivery is unavailable", async () => {
    mocks.isEmailDeliveryConfigured.mockReturnValue(false);

    await expect(
      issueConversationResumeEmail({
        conversationId: "82de681c-18db-4cba-9f13-d3ca504cb6d5",
        visitorName: "Taylor",
        visitorEmail: "taylor@example.com",
        profileName: "Darren",
      }),
    ).resolves.toEqual({ sent: false, reason: "not_configured" });
    expect(mocks.neonSql).not.toHaveBeenCalled();
    expect(mocks.sendConversationResumeEmail).not.toHaveBeenCalled();
  });

  it("stores only a token hash and emails the private raw token", async () => {
    mocks.isEmailDeliveryConfigured.mockReturnValue(true);
    mocks.neonSql.mockResolvedValue([]);
    mocks.sendConversationResumeEmail.mockResolvedValue(undefined);

    const result = await issueConversationResumeEmail({
      conversationId: "82de681c-18db-4cba-9f13-d3ca504cb6d5",
      visitorName: "  Taylor  ",
      visitorEmail: "Taylor@Example.com",
      profileName: "Darren",
    });

    expect(result.sent).toBe(true);
    const emailCall = mocks.sendConversationResumeEmail.mock.calls[0][0] as {
      to: string;
      resumeUrl: string;
    };
    expect(emailCall.to).toBe("taylor@example.com");
    const token = new URL(emailCall.resumeUrl).searchParams.get("token");
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,100}$/);

    const sqlValues = mocks.neonSql.mock.calls[0].slice(1);
    const expectedHash = createHash("sha256").update(token!).digest("hex");
    expect(sqlValues).toContain(expectedHash);
    expect(sqlValues).not.toContain(token);
  });

  it("rejects malformed resume tokens before querying the database", async () => {
    await expect(
      consumeConversationResumeToken("not-a-valid-token", "26ed4df8-ac18-43f9-8916-5c633643d97d"),
    ).resolves.toBeNull();
    expect(mocks.neonSql).not.toHaveBeenCalled();
  });

  it("hashes a valid token before consuming it", async () => {
    const token = "a".repeat(43);
    mocks.neonSql.mockResolvedValue([
      {
        conversationId: "82de681c-18db-4cba-9f13-d3ca504cb6d5",
        handle: "darren",
      },
    ]);

    await expect(
      consumeConversationResumeToken(token, "26ed4df8-ac18-43f9-8916-5c633643d97d"),
    ).resolves.toEqual({
      conversationId: "82de681c-18db-4cba-9f13-d3ca504cb6d5",
      handle: "darren",
    });
    const sqlValues = mocks.neonSql.mock.calls[0].slice(1);
    expect(sqlValues).toContain(createHash("sha256").update(token).digest("hex"));
    expect(sqlValues).not.toContain(token);
  });
});
