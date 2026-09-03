import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", () => ({ db: {} }));

import { containsPrivateContextLeak } from "./context";

describe("containsPrivateContextLeak", () => {
  it("detects a full private fragment despite case and whitespace changes", () => {
    expect(
      containsPrivateContextLeak(
        "Our PRIORITY is strategic   enterprise partnerships with measurable value.",
        ["Strategic enterprise partnerships with measurable value"],
      ),
    ).toBe(true);
  });

  it("detects a leaked seven-word window from a longer private fragment", () => {
    expect(
      containsPrivateContextLeak(
        "We reject proposals involving gambling brands or affiliate payout arrangements.",
        [
          "Never accept proposals involving gambling brands or affiliate payout arrangements without review",
        ],
      ),
    ).toBe(true);
  });

  it("does not flag generic partial overlap or short fragments", () => {
    expect(
      containsPrivateContextLeak(
        "The proposal offers clear value and should stay educational.",
        ["Prefer clear value for technical audiences", "candid tone"],
      ),
    ).toBe(false);
  });
});
