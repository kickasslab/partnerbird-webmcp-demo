import { expect, test } from "@playwright/test";

test("registers and executes the opted-in Darren public tools end to end", async ({ page, request }) => {
  await page.addInitScript(() => {
    const tools: Array<Record<string, unknown>> = [];
    Object.defineProperty(window, "__webmcpTestTools", { value: tools, configurable: true });
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool: async (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => {
          tools.push(tool);
          options?.signal?.addEventListener("abort", () => {
            const index = tools.indexOf(tool);
            if (index >= 0) tools.splice(index, 1);
          }, { once: true });
        },
        getTools: async () => tools,
      },
    });
  });

  await page.goto("/@darren");
  await expect(page.getByText("AI · Safety · SaaS · Creator", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __webmcpTestTools: unknown[] }).__webmcpTestTools.length)).toBe(2);

  const registered = await page.evaluate(() => (window as unknown as { __webmcpTestTools: Array<{ name: string; annotations: unknown }> }).__webmcpTestTools.map(({ name, annotations }) => ({ name, annotations })));
  expect(registered).toEqual([
    { name: "get_profile", annotations: { readOnlyHint: true, untrustedContentHint: true } },
    { name: "get_partnership_interests", annotations: { readOnlyHint: true, untrustedContentHint: true } },
  ]);

  const result = await page.evaluate(async () => {
    const tools = (window as unknown as { __webmcpTestTools: Array<{ name: string; execute: (input: unknown, options: { signal: AbortSignal }) => Promise<unknown> }> }).__webmcpTestTools;
    const selected = tools.find((tool) => tool.name === "get_profile");
    return selected!.execute({ username: "darren" }, { signal: new AbortController().signal });
  });
  expect(result).toMatchObject({ ok: true, data: { username: "darren", displayName: "Darren", acceptingPartnerships: true } });
  const serialized = JSON.stringify(result);
  expect(serialized).not.toMatch(/email|ownerUserId|stripe|privateEvaluation|openrouter|agentIntroduction/i);

  await page.waitForTimeout(500);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __webmcpTestTools: unknown[] }).__webmcpTestTools.length)).toBe(2);

  const crossOrigin = await request.post("/api/webmcp/tools/get_profile", {
    headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
    data: { username: "darren" },
  });
  expect(crossOrigin.status()).toBe(403);
  await page.screenshot({ path: "artifacts/qa/webmcp-public-darren.png", fullPage: true });

  await page.goto("/privacy");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __webmcpTestTools: unknown[] }).__webmcpTestTools.length)).toBe(0);
});

test("continues normally without WebMCP browser support", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/@darren");
  await expect(page.getByText("AI · Safety · SaaS · Creator", { exact: true })).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});
