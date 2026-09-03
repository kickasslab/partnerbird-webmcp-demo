import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/agent/openrouter-provider", () => { throw new Error("OpenRouter must not load in WebMCP tests"); });
vi.mock("@/server/agent/provider", () => { throw new Error("Agent Chat must not load in WebMCP tests"); });

import { toWebMCPPublicProfile } from "@/lib/webmcp/safe-serializers";

const directory = dirname(fileURLToPath(import.meta.url));

describe("WebMCP AI cost boundary", () => {
  it("operates with PartnerBird AI providers mocked to throw", () => {
    expect(toWebMCPPublicProfile({
      handle: "safe", displayName: "Safe", headline: "Partner", bio: ["Bio"], avatarUrl: "/avatar.svg", socialLinks: {}, isOpen: true, isDemo: false,
      agentName: "PartnerBird", agentGreeting: "Hi", agentIntroduction: "Intro", interests: [], capabilities: [], projects: [], guidelines: [], activations: [], metrics: [], collaborations: [],
    }).username).toBe("safe");
  });

  it("contains no imports from Agent Chat or OpenRouter in production WebMCP modules", () => {
    const productionFiles = ["agent-handoffs.ts", "auth.ts", "audit.ts", "confirmation.ts", "errors.ts", "policy.ts", "read-models.ts", "request-security.ts", "service.ts"];
    for (const file of productionFiles) {
      const source = readFileSync(join(directory, file), "utf8");
      expect(source).not.toMatch(/from\s+["'][^"']*(?:server\/agent|openrouter)[^"']*["']/i);
      expect(source).not.toMatch(/OPENROUTER_API_KEY|reserve.*ai|agent.*turn/i);
    }
  });
});
