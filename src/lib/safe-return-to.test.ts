import { describe, expect, it } from "vitest";

import { safeInternalReturnTo } from "./safe-return-to";

describe("safeInternalReturnTo", () => {
  it("preserves an internal handoff URL", () => {
    expect(safeInternalReturnTo("/agent/handoff/token-123?from=auth")).toBe(
      "/agent/handoff/token-123?from=auth",
    );
  });

  it("rejects external, protocol-relative, and backslash destinations", () => {
    expect(safeInternalReturnTo("https://evil.example", "/@darren")).toBe("/@darren");
    expect(safeInternalReturnTo("//evil.example", "/@darren")).toBe("/@darren");
    expect(safeInternalReturnTo("/agent\\evil", "/@darren")).toBe("/@darren");
  });
});
