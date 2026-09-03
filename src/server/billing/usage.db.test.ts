import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { describe, expect, it } from "vitest";

const runDatabaseTests = process.env.PARTNERBIRD_RUN_DB_TESTS === "1";

describe.runIf(runDatabaseTests)("atomic usage reservations against Neon development", () => {
  it("serializes simultaneous first turns at the Free daily/monthly boundary and isolates test/demo usage", async () => {
    config({ path: ".env.local", quiet: true });
    const [{ neonSql }, usage, policy] = await Promise.all([
      import("@/server/db/client"),
      import("./usage"),
      import("@/lib/billing/usage-policy"),
    ]);
    const suffix = randomUUID().replaceAll("-", "");
    const handle = `usage-qa-${suffix.slice(0, 16)}`;
    const tokenA = `usage-qa-a-${suffix}`;
    const tokenB = `usage-qa-b-${suffix}`;
    let profileId = "";

    try {
      const [profile] = (await neonSql`
        INSERT INTO profiles (handle, display_name, headline, bio)
        VALUES (${handle}, 'Usage QA', 'Atomic usage QA', 'Temporary automated billing test profile.')
        RETURNING id
      `) as Array<{ id: string }>;
      profileId = profile.id;
      const sessions = (await neonSql`
        INSERT INTO visitor_sessions (token_hash, expires_at)
        VALUES (${tokenA}, ${new Date(Date.now() + 60_000)}), (${tokenB}, ${new Date(Date.now() + 60_000)})
        RETURNING id
      `) as Array<{ id: string }>;
      const conversations = (await neonSql`
        INSERT INTO conversations (profile_id, visitor_session_id, mode)
        VALUES (${profileId}, ${sessions[0].id}, 'live'), (${profileId}, ${sessions[1].id}, 'live')
        RETURNING id
      `) as Array<{ id: string }>;

      const now = new Date();
      const monthly = policy.getCalendarUsageWindow("monthly", now);
      const daily = policy.getCalendarUsageWindow("daily", now);
      await neonSql`
        INSERT INTO usage_periods (profile_id, scope, period_type, period_start, period_end, ai_conversations)
        VALUES
          (${profileId}, 'public', 'monthly', ${monthly.start}, ${monthly.end}, 19),
          (${profileId}, 'public', 'daily', ${daily.start}, ${daily.end}, 4)
      `;

      const results = await Promise.all([
        usage.reservePublicUsage({ profileId, conversationId: conversations[0].id, idempotencyKey: `qa-a-${suffix}`, plan: "free", includesWebsiteAnalysis: true, at: now }),
        usage.reservePublicUsage({ profileId, conversationId: conversations[1].id, idempotencyKey: `qa-b-${suffix}`, plan: "free", includesWebsiteAnalysis: true, at: now }),
      ]);
      expect(results.filter((result) => result.allowed)).toHaveLength(1);
      expect(results.filter((result) => !result.allowed)).toHaveLength(1);

      await usage.recordIsolatedUsage({ profileId, scope: "test", includesWebsiteAnalysis: false, at: now });
      await usage.recordIsolatedUsage({ profileId, scope: "demo", includesWebsiteAnalysis: true, at: now });
      const rows = (await neonSql`
        SELECT scope, ai_conversations, website_analyses
        FROM usage_periods
        WHERE profile_id=${profileId} AND period_type='monthly' AND period_start=${monthly.start}
        ORDER BY scope
      `) as Array<{ scope: string; ai_conversations: number; website_analyses: number }>;
      expect(rows).toEqual([
        { scope: "demo", ai_conversations: 1, website_analyses: 1 },
        { scope: "public", ai_conversations: 20, website_analyses: 1 },
        { scope: "test", ai_conversations: 1, website_analyses: 0 },
      ]);
    } finally {
      if (profileId) await neonSql`DELETE FROM profiles WHERE id=${profileId}`;
      await neonSql`DELETE FROM visitor_sessions WHERE token_hash IN (${tokenA}, ${tokenB})`;
    }
  }, 30_000);
});
