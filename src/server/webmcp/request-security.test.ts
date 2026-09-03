import { describe, expect, it } from "vitest";

import { WebMCPServiceError } from "./errors";
import { assertSameOriginWebMCPRequest } from "./request-security";

describe("WebMCP same-origin request protection", () => {
  it("accepts same-origin JSON requests", () => {
    expect(() => assertSameOriginWebMCPRequest(new Request("https://partnerbird.example/api/webmcp/tools/get_profile", {
      method: "POST",
      headers: { origin: "https://partnerbird.example", "content-type": "application/json", "sec-fetch-site": "same-origin" },
    }))).not.toThrow();
  });

  it.each(["https://evil.example", "null"])("rejects an untrusted origin: %s", (origin) => {
    expect(() => assertSameOriginWebMCPRequest(new Request("https://partnerbird.example/api/webmcp/tools/get_profile", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
    }))).toThrowError(expect.objectContaining<Partial<WebMCPServiceError>>({ code: "ORIGIN_NOT_ALLOWED" }));
  });
});
