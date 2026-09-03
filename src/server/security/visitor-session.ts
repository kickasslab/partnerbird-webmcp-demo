import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/server/db/client";
import { visitorSessions } from "@/server/db/schema";

const sessionCookie = "partnerbird_session";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashVisitorIp(ip: string) {
  const secret = process.env.RATE_LIMIT_HMAC_SECRET;
  if (!secret) throw new Error("RATE_LIMIT_HMAC_SECRET is not configured.");
  return createHmac("sha256", secret).update(ip || "unknown").digest("hex");
}

export function getRequestIp(request: Request) {
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function getOrCreateVisitorSession(request: Request) {
  const cookieStore = await cookies();
  let token = cookieStore.get(sessionCookie)?.value;
  let tokenHash = token ? sha256(token) : "";
  let [session] = tokenHash
    ? await db
        .select()
        .from(visitorSessions)
        .where(eq(visitorSessions.tokenHash, tokenHash))
        .limit(1)
    : [];

  if (!session || session.expiresAt <= new Date()) {
    token = randomBytes(32).toString("base64url");
    tokenHash = sha256(token);
    [session] = await db
      .insert(visitorSessions)
      .values({
        tokenHash,
        ipHash: hashVisitorIp(getRequestIp(request)),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .returning();
  } else {
    const nextExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db
      .update(visitorSessions)
      .set({
        expiresAt: nextExpiry,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(visitorSessions.id, session.id));
    session = { ...session, expiresAt: nextExpiry };
  }

  cookieStore.set(sessionCookie, token!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  return session;
}

export async function getExistingVisitorSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;
  if (!token) return null;
  const [session] = await db
    .select()
    .from(visitorSessions)
    .where(eq(visitorSessions.tokenHash, sha256(token)))
    .limit(1);
  if (!session || session.expiresAt <= new Date()) {
    cookieStore.delete(sessionCookie);
    return null;
  }
  return session;
}
