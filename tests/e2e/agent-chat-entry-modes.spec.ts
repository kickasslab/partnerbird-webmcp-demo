import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";

import { neon } from "@neondatabase/serverless";
import { expect, test } from "@playwright/test";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

test("regular profile entry keeps the existing normal Agent Chat intake", async ({ page }) => {
  const handoffRequests: string[] = [];
  const aiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/agent/handoffs/")) handoffRequests.push(request.url());
    if (/\/api\/(demo\/turns|public\/profiles\/[^/]+\/turns)/.test(request.url())) aiRequests.push(request.url());
  });

  await page.goto("/@darren");
  await expect(page.getByRole("button", { name: "Start with PartnerBird" })).toBeVisible();
  await expect(page.getByTestId("webmcp-handoff-preview")).toHaveCount(0);

  await page.getByRole("button", { name: "Start with PartnerBird" }).click();
  await expect(page.getByTestId("agent-intake-form")).toBeVisible();
  await expect(page.getByText("Complete these three fields before starting Agent Chat. No AI credits are used.")).toBeVisible();
  await expect(page.getByTestId("webmcp-handoff-context")).toHaveCount(0);
  expect(handoffRequests).toEqual([]);
  expect(aiRequests).toEqual([]);
  await page.screenshot({ path: "artifacts/qa/agent-chat-normal.png", fullPage: true });
});

test("valid pending WebMCP handoff uses the separate auth-preserving route", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.baseURL?.toString().startsWith("http://localhost"), "Database fixture is local-only.");
  const databaseUrl = process.env.DATABASE_URL;
  test.skip(!databaseUrl, "DATABASE_URL is required for the local handoff fixture.");
  const sql = neon(databaseUrl!);
  const [target] = await sql`
    SELECT profile.id, profile.handle
    FROM profiles AS profile
    JOIN webmcp_settings AS settings ON settings.profile_id=profile.id
    WHERE profile.handle='darren' AND profile.is_demo=true AND profile.is_published=true
      AND settings.enabled=true AND settings.allow_matching=true
    LIMIT 1
  ` as Array<{ id: string; handle: string }>;
  const [creator] = await sql`
    SELECT id FROM profiles WHERE id<>${target?.id ?? "00000000-0000-0000-0000-000000000000"} LIMIT 1
  ` as Array<{ id: string }>;
  test.skip(!target || !creator, "The local database needs Darren and one separate creator profile.");

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await sql`
    INSERT INTO webmcp_agent_handoffs (
      token_hash, creator_profile_id, target_profile_id, status,
      person_name, company_name, company_description, partnership_goal,
      context_summary, expires_at
    ) VALUES (
      ${tokenHash}, ${creator!.id}, ${target!.id}, 'pending',
      'Avery', 'AcmeMonitor', 'Observability tooling for teams building AI applications.',
      'A practical newsletter collaboration.',
      'Both audiences care about dependable and safe AI systems.',
      ${new Date(Date.now() + 30 * 60 * 1000)}
    )
  `;

  const aiRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/(demo\/turns|public\/profiles\/[^/]+\/turns)/.test(request.url())) aiRequests.push(request.url());
  });
  try {
    await page.goto(`/agent/handoff/${token}`);
    await expect(page.getByTestId("webmcp-handoff-preview")).toBeVisible();
    await expect(page.getByTestId("webmcp-handoff-auth-gate")).toBeVisible();
    await expect(page.getByTestId("webmcp-handoff-context")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Evaluate with PartnerBird Agent" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Sign in to continue" })).toHaveAttribute(
      "href",
      expect.stringContaining(encodeURIComponent(`/agent/handoff/${token}`)),
    );
    expect(aiRequests).toEqual([]);
    await page.screenshot({ path: "artifacts/qa/agent-chat-webmcp-handoff.png", fullPage: true });
  } finally {
    await sql`DELETE FROM webmcp_agent_handoffs WHERE token_hash=${tokenHash}`;
  }
});

test("a known expired handoff falls back to the ordinary profile entry", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.baseURL?.toString().startsWith("http://localhost"), "Database fixture is local-only.");
  const databaseUrl = process.env.DATABASE_URL;
  test.skip(!databaseUrl, "DATABASE_URL is required for the local handoff fixture.");
  const sql = neon(databaseUrl!);
  const [target] = await sql`
    SELECT id FROM profiles WHERE handle='darren' AND is_demo=true AND is_published=true LIMIT 1
  ` as Array<{ id: string }>;
  const [creator] = await sql`
    SELECT id FROM profiles WHERE id<>${target?.id ?? "00000000-0000-0000-0000-000000000000"} LIMIT 1
  ` as Array<{ id: string }>;
  test.skip(!target || !creator, "The local database needs Darren and one separate creator profile.");

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await sql`
    INSERT INTO webmcp_agent_handoffs (
      token_hash, creator_profile_id, target_profile_id, status,
      person_name, company_name, company_description, partnership_goal,
      expires_at
    ) VALUES (
      ${tokenHash}, ${creator!.id}, ${target!.id}, 'pending',
      'Avery', 'AcmeMonitor', 'Observability tooling for teams building AI applications.',
      'A practical newsletter collaboration.',
      ${new Date(Date.now() - 60 * 1000)}
    )
  `;

  try {
    await page.goto(`/agent/handoff/${token}`);
    await expect(page).toHaveURL(/\/@darren$/);
    await expect(page.getByRole("button", { name: "Start with PartnerBird" })).toBeVisible();
    await expect(page.getByTestId("webmcp-handoff-preview")).toHaveCount(0);
  } finally {
    await sql`DELETE FROM webmcp_agent_handoffs WHERE token_hash=${tokenHash}`;
  }
});
