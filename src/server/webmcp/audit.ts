import "server-only";

import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth/server";
import type { WebMCPErrorCode, WebMCPToolName } from "@/lib/webmcp/types";
import { db } from "@/server/db/client";
import { profiles, webmcpActivityEvents } from "@/server/db/schema";
import { WebMCPServiceError } from "./errors";

export async function recordWebMCPFailure(tool: WebMCPToolName, error: unknown) {
  const category: WebMCPErrorCode = error instanceof WebMCPServiceError
    ? error.code
    : "INVALID_REQUEST";
  let actorProfileId: string | undefined;
  try {
    const { data } = await auth.getSession();
    if (data?.user) {
      const [profile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.ownerUserId, data.user.id)).limit(1);
      actorProfileId = profile?.id;
    }
  } catch {
    // Failure auditing must never weaken or replace the primary tool response.
  }
  try {
    await db.insert(webmcpActivityEvents).values({
      actorProfileId,
      action: tool,
      outcome: "failed",
      failureCategory: category,
      metadata: {},
    });
  } catch {
    // Operational audit failures are reported by application monitoring separately.
  }
}
