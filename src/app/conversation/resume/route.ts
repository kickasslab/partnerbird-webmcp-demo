import { NextResponse } from "next/server";
import { z } from "zod";

import { consumeConversationResumeToken } from "@/server/conversations/resume";
import { consumeRateLimit } from "@/server/security/rate-limit";
import {
  getOrCreateVisitorSession,
  getRequestIp,
  hashVisitorIp,
} from "@/server/security/visitor-session";

export const runtime = "nodejs";

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{40,100}$/);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = tokenSchema.safeParse(url.searchParams.get("token"));
  if (!token.success) return invalidResumeRedirect(url);

  const limit = await consumeRateLimit({
    keyHash: hashVisitorIp(getRequestIp(request)),
    action: "conversation_resume",
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) return invalidResumeRedirect(url, "limited");

  const session = await getOrCreateVisitorSession(request);
  const resumed = await consumeConversationResumeToken(token.data, session.id);
  if (!resumed) return invalidResumeRedirect(url);

  const destination = new URL(`/@${resumed.handle}`, url.origin);
  destination.searchParams.set("chat", "1");
  destination.searchParams.set("conversation", resumed.conversationId);
  destination.searchParams.set("resumed", "1");
  return NextResponse.redirect(destination, 303);
}

function invalidResumeRedirect(url: URL, reason = "invalid") {
  const destination = new URL("/", url.origin);
  destination.searchParams.set("conversation", reason);
  return NextResponse.redirect(destination, 303);
}
