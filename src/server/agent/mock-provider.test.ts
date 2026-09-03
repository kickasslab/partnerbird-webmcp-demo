import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockPartnerBirdProvider } from "./mock-provider";
import type { AgentTurnInput } from "./types";

const baseInput: AgentTurnInput = {
  message: "We create educational resources for software teams.",
  profileName: "Avery",
  ownerPublicContext: "Avery writes for responsible AI builders.",
  ownerPrivateContext: "Prefer useful, balanced collaborations.",
};

async function runTurn(overrides: Partial<AgentTurnInput> = {}) {
  const provider = new MockPartnerBirdProvider();
  const pending = provider.runTurn(
    { ...baseInput, ...overrides },
    new AbortController().signal,
  );
  await vi.advanceTimersByTimeAsync(180);
  return pending;
}

describe("MockPartnerBirdProvider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns a strong-fit result for observability and agent reliability", async () => {
    const result = await runTurn({
      message:
        "AcmeMonitor helps engineering teams with observability and agent reliability.",
    });

    expect(result.fit.label).toBe("Strong Fit");
    expect(result.nextState).toBe("IDEA_GENERATION");
    expect(result.ideas).toHaveLength(2);
    expect(result.ideas.length).toBeLessThanOrEqual(3);
    expect(result.ideas.every((idea) => idea.fitLabel !== "Not a Fit")).toBe(true);
  });

  it("returns no ideas for a no-fit proposal", async () => {
    const result = await runTurn({
      message: "We want to promote a casino and gambling affiliate program.",
    });

    expect(result.fit.label).toBe("Not a Fit");
    expect(result.nextState).toBe("NO_FIT");
    expect(result.ideas).toEqual([]);
    expect(result.ideas.length).toBeLessThanOrEqual(3);
  });

  it("asks for qualification details when the fit is only worth exploring", async () => {
    const result = await runTurn();

    expect(result.fit.label).toBe("Worth Exploring");
    expect(result.nextState).toBe("QUALIFICATION");
    expect(result.ideas).toHaveLength(1);
    expect(result.ideas.length).toBeLessThanOrEqual(3);
  });

  it("refines the selected idea in explore mode without exceeding three ideas", async () => {
    const result = await runTurn({
      action: "explore_idea",
      actionContext:
        "Title: Reliability Roundtable\nFocus: monitoring production AI agents.",
    });

    expect(result.fit.label).toBe("Strong Fit");
    expect(result.nextState).toBe("PROPOSAL_READY");
    expect(result.ideas).toHaveLength(1);
    expect(result.ideas[0].title).toBe("Reliability Roundtable");
    expect(result.ideas.length).toBeLessThanOrEqual(3);
  });
});
