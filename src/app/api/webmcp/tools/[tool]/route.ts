import { isHighRiskWebMCPTool, webmcpToolNames, type WebMCPToolName } from "@/lib/webmcp/types";
import { clearWebMCPConfirmationCookie } from "@/server/webmcp/confirmation";
import { executeWebMCPTool } from "@/server/webmcp/service";
import { webmcpErrorResult } from "@/server/webmcp/errors";
import { assertSameOriginWebMCPRequest } from "@/server/webmcp/request-security";
import { recordWebMCPFailure } from "@/server/webmcp/audit";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ tool: string }> }) {
  let selectedTool: WebMCPToolName | null = null;
  try {
    assertSameOriginWebMCPRequest(request);
    const { tool } = await context.params;
    if (!webmcpToolNames.includes(tool as WebMCPToolName)) {
      return json({ ok: false, error: { code: "INVALID_REQUEST", message: "Unknown PartnerBird WebMCP tool." } }, 404);
    }
    selectedTool = tool as WebMCPToolName;
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return json({ ok: false, error: { code: "INVALID_REQUEST", message: "The tool input must be valid JSON." } }, 400);
    }
    const data = await executeWebMCPTool(tool as WebMCPToolName, input, request);
    return json(
      { ok: true, data },
      200,
      isHighRiskWebMCPTool(selectedTool) ? clearWebMCPConfirmationCookie(request.url) : undefined,
    );
  } catch (error) {
    if (selectedTool) await recordWebMCPFailure(selectedTool, error);
    const result = webmcpErrorResult(error);
    return json(
      result.body,
      result.status,
      selectedTool && isHighRiskWebMCPTool(selectedTool)
        ? clearWebMCPConfirmationCookie(request.url)
        : undefined,
      result.retryAfterSeconds,
    );
  }
}

function json(body: unknown, status: number, cookie?: string, retryAfterSeconds?: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}),
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
}
