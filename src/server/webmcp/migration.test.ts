import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("WebMCP database safeguards", () => {
  it("creates idempotency and one-active-request constraints", () => {
    const migrations = ["drizzle/0012_large_taskmaster.sql", "drizzle/0013_clammy_rhodey.sql", "drizzle/0014_flaky_spyke.sql", "drizzle/0016_bright_celestials.sql", "drizzle/0018_enable-darren-webmcp-demo.sql", "drizzle/0019_webmcp_agent_handoffs.sql"]
      .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
      .join("\n");
    expect(migrations).toContain("webmcp_requests_active_pair_unique");
    expect(migrations).toContain("webmcp_requests_sender_submit_key_unique");
    expect(migrations).toContain("webmcp_requests_recipient_response_key_unique");
    expect(migrations).toContain("webmcp_requests_sender_withdraw_key_unique");
    expect(migrations).toContain("webmcp_action_confirmations");
    expect(migrations).toContain("webmcp_confirmations_profile_expiry_idx");
    expect(migrations).toMatch(/WHERE .*\"status\" = 'submitted'/);
    expect(migrations).toContain("webmcp_agent_handoffs_token_hash_unique");
    expect(migrations).toContain("webmcp_agent_handoffs_status_check");
    expect(migrations).toContain('"expires_at" timestamp with time zone NOT NULL');
    expect(migrations).not.toMatch(/\"handoff_token\"|\"raw_token\"/);
  });

  it("opts in only the named Darren demo account during migration", () => {
    const originalMigration = readFileSync(resolve(process.cwd(), "drizzle/0012_large_taskmaster.sql"), "utf8");
    const demoMigration = readFileSync(resolve(process.cwd(), "drizzle/0018_enable-darren-webmcp-demo.sql"), "utf8");
    expect(originalMigration).toContain("WHERE \"handle\" = 'darren'");
    expect(originalMigration).toContain('"enabled" boolean DEFAULT false NOT NULL');
    expect(demoMigration).toContain("lower(\"handle\") = 'darren'");
    expect(demoMigration).toContain('"is_demo" = true');
    expect(demoMigration).toContain('"allow_public_profile_read" = true');
    expect(demoMigration).toContain('"allow_discovery" = true');
    expect(demoMigration).toContain('"allow_matching" = true');
    expect(demoMigration).not.toMatch(/UPDATE\s+"webmcp_settings"\s+SET(?![\s\S]*WHERE)/i);
  });

  it("keeps the seed repair idempotent and scoped to Darren", () => {
    const seed = readFileSync(resolve(process.cwd(), "scripts/seed.ts"), "utf8");
    expect(seed).toContain('eq(profiles.handle, "darren")');
    expect(seed).toContain("onConflictDoUpdate");
    expect(seed).toContain("allowPublicProfileRead: true");
    expect(seed).toContain("allowDiscovery: true");
    expect(seed).toContain("allowMatching: true");
  });
});
