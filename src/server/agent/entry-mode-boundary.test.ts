import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Agent Chat entry-mode regression boundary", () => {
  it("keeps the ordinary profile route explicitly NORMAL and handoff-free", () => {
    const profilePage = source("src/app/[handle]/page.tsx");
    expect(profilePage).toContain('entryMode="NORMAL"');
    expect(profilePage).not.toContain("WEBMCP_HANDOFF");
    expect(profilePage).not.toMatch(/handoffId|handoffToken|searchParams.*handoff/);
  });

  it("allows WEBMCP_HANDOFF only behind the server-validated handoff route", () => {
    const handoffPage = source("src/app/agent/handoff/[token]/page.tsx");
    const validation = handoffPage.indexOf("readAgentHandoff(token)");
    const mode = handoffPage.indexOf('entryMode="WEBMCP_HANDOFF"');
    expect(validation).toBeGreaterThan(-1);
    expect(mode).toBeGreaterThan(validation);
    expect(handoffPage).toContain("handoff.activatedByUserId !== user?.id");
    expect(handoffPage).toContain("redirect(`/@${handoff.targetHandle}`)");
    expect(handoffPage).toContain("readAgentHandoffNormalFallback(token)");
  });

  it("does not add WebMCP instructions to normal prompts or turn handlers", () => {
    for (const path of [
      "src/server/agent/prompt.ts",
      "src/server/agent/context.ts",
      "src/app/api/demo/turns/route.ts",
      "src/app/api/public/profiles/[handle]/turns/route.ts",
    ]) {
      expect(source(path)).not.toMatch(/WEBMCP_HANDOFF|prepare_agent_handoff|agent handoff/i);
    }
  });

  it("continues to use generic safe returnTo preservation in the existing auth actions", () => {
    const authActions = source("src/app/(auth)/auth-actions.ts");
    expect(authActions).toContain("safeInternalReturnTo");
    expect(authActions).not.toMatch(/WEBMCP_HANDOFF|handoffToken/);
  });
});
