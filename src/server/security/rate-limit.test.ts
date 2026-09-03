import { beforeEach, describe, expect, it, vi } from "vitest";

const { returningMock } = vi.hoisted(() => ({ returningMock: vi.fn() }));
vi.mock("@/server/db/client", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({ returning: returningMock })),
      })),
    })),
  },
}));

import { consumeRateLimit } from "./rate-limit";

describe("database rate limiter", () => {
  beforeEach(() => returningMock.mockReset());

  it("allows counts through the limit and denies later attempts", async () => {
    returningMock.mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([{ count: 2 }]);
    const input = { keyHash: "a".repeat(64), action: "webmcp_outreach_hour", limit: 1, windowMs: 60_000 };
    await expect(consumeRateLimit(input)).resolves.toMatchObject({ allowed: true });
    await expect(consumeRateLimit(input)).resolves.toMatchObject({ allowed: false });
  });
});
