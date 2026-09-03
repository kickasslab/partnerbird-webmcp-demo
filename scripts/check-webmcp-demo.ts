import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL_UNPOOLED) {
  throw new Error("DATABASE_URL_UNPOOLED is required to check the WebMCP demo policy.");
}

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED!);
  const darrenRows = await sql`
    SELECT
      p.handle,
      p.is_published AS "isPublished",
      p.is_demo AS "isDemo",
      w.enabled,
      w.allow_public_profile_read AS "allowPublicProfileRead",
      w.allow_discovery AS "allowDiscovery",
      w.allow_matching AS "allowMatching"
    FROM profiles p
    LEFT JOIN webmcp_settings w ON w.profile_id = p.id
    WHERE lower(p.handle) = 'darren'
    LIMIT 1
  ` as Array<{
    handle: string;
    isPublished: boolean;
    isDemo: boolean;
    enabled: boolean | null;
    allowPublicProfileRead: boolean | null;
    allowDiscovery: boolean | null;
    allowMatching: boolean | null;
  }>;
  const [darren] = darrenRows;
  const countRows = await sql`
    SELECT
      count(*)::int AS profiles,
      count(*) FILTER (WHERE w.enabled)::int AS "webmcpEnabled",
      count(*) FILTER (WHERE w.enabled AND NOT p.is_demo)::int AS "enabledNonDemoProfiles"
    FROM profiles p
    LEFT JOIN webmcp_settings w ON w.profile_id = p.id
  ` as Array<{ profiles: number; webmcpEnabled: number; enabledNonDemoProfiles: number }>;
  const [counts] = countRows;
  const migrationRows = await sql`
    SELECT count(*)::int AS count, max(created_at)::text AS "latestCreatedAt"
    FROM drizzle.__drizzle_migrations
  ` as Array<{ count: number; latestCreatedAt: string | null }>;
  const [migrations] = migrationRows;

  console.log(JSON.stringify({ darren: darren ?? null, counts, migrations }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "WebMCP demo check failed.");
  process.exitCode = 1;
});
