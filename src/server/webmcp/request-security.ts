import { WebMCPServiceError } from "./errors";

export function assertSameOriginWebMCPRequest(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new WebMCPServiceError("INVALID_REQUEST", "WebMCP requests must use JSON.", 415);
  }

  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin !== expectedOrigin || (fetchSite && fetchSite !== "same-origin")) {
    throw new WebMCPServiceError("ORIGIN_NOT_ALLOWED", "Cross-origin WebMCP requests are not allowed.", 403);
  }
}
