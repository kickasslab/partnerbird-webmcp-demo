import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { OpenRouterPartnerBirdProvider } from "./openrouter-provider";
import type { AgentResult, AgentTurnInput } from "./types";

const input: AgentTurnInput = {
  message: "Explore the selected collaboration idea.",
  action: "explore_idea",
  actionContext: "Title: Reliability Roundtable",
  profileName: "Darren",
  ownerPublicContext: "AI safety and developer tools.",
  ownerPrivateContext: "Prefer useful collaborations.",
};

const validResult: AgentResult = {
  response: "Start with a short working session to agree on scope and responsibilities.",
  fit: {
    label: "Good Fit",
    rationale: "Both sides bring complementary expertise and can validate the idea cheaply.",
    strengths: ["Complementary expertise"],
    concerns: [],
  },
  ideas: [
    {
      fitLabel: "Good Fit",
      type: "Research collaboration",
      title: "A Practical Reliability Roundtable",
      description: "A focused discussion about reliable and safe production AI systems.",
      whyItWorks: "It combines practical operating experience with editorial and safety framing.",
      ownerContribution: "Editorial framing and audience context.",
      visitorContribution: "Operational examples and technical expertise.",
      mutualValue: "Both audiences receive useful implementation guidance.",
      activation: "Thirty-minute scoping call",
    },
  ],
  nextState: "PROPOSAL_READY",
};

function completion(content: string, status = 200) {
  return new Response(
    JSON.stringify(
      status === 200
        ? { choices: [{ message: { content } }] }
        : { error: { code: status, message: "Provider request failed." } },
    ),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OpenRouterPartnerBirdProvider", () => {
  it("falls back when the primary returns schema-invalid output", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(completion('{"response":"incomplete"}'))
      .mockResolvedValueOnce(completion(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const provider = new OpenRouterPartnerBirdProvider(
      "test-key",
      "openai/gpt-5.6-luna",
      ["minimax/minimax-m3:free"],
    );
    const result = await provider.runTurn(input, new AbortController().signal);

    expect(result).toEqual(validResult);
    expect(provider.model).toBe("minimax/minimax-m3:free");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const primaryBody = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body),
    );
    const fallbackBody = JSON.parse(
      String((fetchMock.mock.calls[1][1] as RequestInit).body),
    );
    expect(primaryBody).toMatchObject({
      model: "openai/gpt-5.6-luna",
      stream: false,
      response_format: {
        type: "json_schema",
        json_schema: { name: "partnerbird_turn", strict: true },
      },
      plugins: [{ id: "response-healing" }],
    });
    expect(primaryBody.response_format.json_schema.schema.$schema).toBeUndefined();
    expect(fallbackBody).toMatchObject({
      model: "minimax/minimax-m3:free",
      response_format: { type: "json_object" },
      plugins: [{ id: "response-healing" }],
    });
  });

  it("tries a free fallback when a paid primary requires credits", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(completion("", 402))
      .mockResolvedValueOnce(completion(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const provider = new OpenRouterPartnerBirdProvider(
      "test-key",
      "openai/gpt-5.6-luna",
      ["minimax/minimax-m3:free"],
    );

    await expect(
      provider.runTurn(input, new AbortController().signal),
    ).resolves.toEqual(validResult);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cycle through models when the shared API key is rejected", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(completion("", 401));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const provider = new OpenRouterPartnerBirdProvider(
      "bad-key",
      "openai/gpt-5.6-luna",
      ["minimax/minimax-m3:free"],
    );

    await expect(
      provider.runTurn(input, new AbortController().signal),
    ).rejects.toThrow("OPENROUTER_AUTH_FAILED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
