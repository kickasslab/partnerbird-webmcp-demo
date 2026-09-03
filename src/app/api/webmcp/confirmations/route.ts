import { isHighRiskWebMCPTool, webmcpToolNames, type WebMCPToolName } from "@/lib/webmcp/types";
import {
  issueWebMCPConfirmation,
  webmcpConfirmationCookie,
} from "@/server/webmcp/confirmation";
import { webmcpErrorResult } from "@/server/webmcp/errors";
import { assertSameOriginWebMCPRequest } from "@/server/webmcp/request-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOriginWebMCPRequest(request);
    const body = await request.json() as { tool?: unknown; input?: unknown };
    if (typeof body.tool !== "string" || !webmcpToolNames.includes(body.tool as WebMCPToolName)) {
      return json({ ok: false, error: { code: "INVALID_REQUEST", message: "Unknown PartnerBird WebMCP tool." } }, 400);
    }
    const toolName = body.tool as WebMCPToolName;
    if (!isHighRiskWebMCPTool(toolName)) {
      return json({ ok: false, error: { code: "INVALID_REQUEST", message: "This action does not use human confirmation." } }, 400);
    }
    const confirmationId = await issueWebMCPConfirmation(toolName, body.input);
    return json({ ok: true }, 200, webmcpConfirmationCookie(confirmationId, request.url));
  } catch (error) {
    const result = webmcpErrorResult(error);
    return json(result.body, result.status);
  }
}

function json(body: unknown, status: number, cookie?: string) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
}
