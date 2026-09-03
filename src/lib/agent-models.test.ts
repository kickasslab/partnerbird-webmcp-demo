import { afterEach, describe, expect, it } from "vitest";

import {
  agentModelConfigurationSchema,
  getEnvironmentAgentModelConfiguration,
} from "./agent-models";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("agent model configuration", () => {
  it("builds plan primaries and ordered fallbacks from environment defaults", () => {
    process.env.OPENROUTER_MODEL = "minimax/minimax-m3:free";
    process.env.OPENROUTER_MODEL_PRO = "google/gemma-3-27b-it:free";
    process.env.OPENROUTER_FREE_FALLBACK_MODELS =
      "qwen/qwen3-coder:free, google/gemma-3-12b-it:free";

    const configuration = getEnvironmentAgentModelConfiguration();

    expect(configuration.primaryModels.free.modelId).toBe(
      "minimax/minimax-m3:free",
    );
    expect(configuration.primaryModels.pro.modelId).toBe(
      "google/gemma-3-27b-it:free",
    );
    expect(configuration.fallbackModels.map((model) => model.modelId)).toEqual([
      "qwen/qwen3-coder:free",
      "google/gemma-3-12b-it:free",
    ]);
  });

  it("accepts concrete paid OpenRouter model IDs", () => {
    const base = getEnvironmentAgentModelConfiguration();
    const result = agentModelConfigurationSchema.safeParse({
      ...base,
      primaryModels: {
        ...base.primaryModels,
        free: {
          ...base.primaryModels.free,
          modelId: "openai/gpt-5.6-luna",
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects router-selected, malformed, and duplicate fallback models", () => {
    const base = getEnvironmentAgentModelConfiguration();
    const result = agentModelConfigurationSchema.safeParse({
      ...base,
      primaryModels: {
        ...base.primaryModels,
        free: { ...base.primaryModels.free, modelId: "openrouter/free" },
      },
      fallbackModels: [
        {
          modelId: "missing-provider-slash",
          name: "Malformed model",
          description: "",
          enabled: true,
        },
        {
          modelId: "qwen/qwen3-coder:free",
          name: "Qwen",
          description: "",
          enabled: true,
        },
        {
          modelId: "qwen/qwen3-coder:free",
          name: "Duplicate Qwen",
          description: "",
          enabled: true,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("provider/model"),
        "Each fallback model ID can only appear once.",
      ]),
    );
  });
});
