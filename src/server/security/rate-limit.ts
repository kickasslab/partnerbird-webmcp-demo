import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { rateLimitBuckets } from "@/server/db/schema";

export async function consumeRateLimit({
  keyHash,
  action,
  limit,
  windowMs,
}: {
  keyHash: string;
  action: string;
  limit: number;
  windowMs: number;
}) {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs * 2);
  const [bucket] = await db
    .insert(rateLimitBuckets)
    .values({ keyHash, action, windowStart, expiresAt })
    .onConflictDoUpdate({
      target: [
        rateLimitBuckets.keyHash,
        rateLimitBuckets.action,
        rateLimitBuckets.windowStart,
      ],
      set: {
        count: sql`${rateLimitBuckets.count} + 1`,
        expiresAt,
      },
    })
    .returning({ count: rateLimitBuckets.count });

  return {
    allowed: bucket.count <= limit,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((windowStart.getTime() + windowMs - now) / 1000),
    ),
  };
}
