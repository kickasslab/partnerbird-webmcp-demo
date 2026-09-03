import { activateAgentHandoff } from "@/server/webmcp/agent-handoffs";
import { assertSameOriginWebMCPRequest } from "@/server/webmcp/request-security";
import { webmcpErrorResult } from "@/server/webmcp/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    assertSameOriginWebMCPRequest(request);
    const result = await activateAgentHandoff((await params).token, request);
    if (!result.ok) {
      return json({ ok: false, error: { code: result.code, message: result.message } }, result.status);
    }
    return json({
      ok: true,
      data: {
        conversationReady: true,
        alreadyActivated: result.alreadyActivated,
      },
    }, 200);
  } catch (error) {
    const result = webmcpErrorResult(error);
    return json(result.body, result.status);
  }
}

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie",
    },
  });
}
