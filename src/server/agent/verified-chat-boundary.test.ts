import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const directory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFileSync(join(directory, relativePath), "utf8");

describe("verified public Agent Chat boundary", () => {
  it("keeps deterministic intake independent from AI and usage providers", () => {
    const intake = source("../../app/api/public/profiles/[handle]/intake/route.ts");

    expect(intake).not.toMatch(/getPartnerBirdProvider|openrouter-provider|reservePublicUsage/);
  });

  it.each([
    ["live", "../../app/api/public/profiles/[handle]/turns/route.ts"],
    ["demo", "../../app/api/demo/turns/route.ts"],
  ])("checks completed intake and verification before the %s provider call", (_mode, path) => {
    const turnRoute = source(path);
    const verificationGate = turnRoute.indexOf("if (!verifiedIntake)");
    const providerCall = turnRoute.indexOf("getPartnerBirdProvider(", verificationGate);

    expect(verificationGate).toBeGreaterThan(-1);
    expect(providerCall).toBeGreaterThan(verificationGate);
  });

  it("reserves live usage only after verification", () => {
    const liveTurn = source("../../app/api/public/profiles/[handle]/turns/route.ts");

    expect(liveTurn.indexOf("reservePublicUsage(")).toBeGreaterThan(
      liveTurn.indexOf("if (!verifiedIntake)"),
    );
  });
});
