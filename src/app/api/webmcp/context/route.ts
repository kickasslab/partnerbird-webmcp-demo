import { getOptionalWebMCPActor } from "@/server/webmcp/auth";
import { webmcpErrorResult } from "@/server/webmcp/errors";
import { getPublicWebMCPPolicy } from "@/server/webmcp/read-models";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await getOptionalWebMCPActor();
    const targetUsername = new URL(request.url).searchParams.get("targetUsername")?.toLowerCase() ?? null;
    const publicPolicy = targetUsername
      ? await getPublicWebMCPPolicy(targetUsername)
      : { publicProfileAvailable: false, discoveryEnabled: false, matchingEnabled: false };
    return Response.json({
      authenticated: Boolean(actor),
      authenticatedWebMCPEnabled: actor?.settings.enabled === true,
      permissions: actor?.settings.enabled ? {
        allowMatching: actor.settings.allowMatching,
        allowSavePartners: actor.settings.allowSavePartners,
        allowCreateDrafts: actor.settings.allowCreateDrafts,
      } : null,
      publicProfileAvailable: publicPolicy.publicProfileAvailable,
      targetMatchingEnabled: publicPolicy.matchingEnabled,
    }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const result = webmcpErrorResult(error);
    return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  }
}
