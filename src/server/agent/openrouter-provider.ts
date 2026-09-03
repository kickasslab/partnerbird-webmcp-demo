import "server-only";

import { z } from "zod";

import { isConcreteOpenRouterModelId } from "@/lib/agent-models";

import { agentResultSchema, type AgentTurnInput, type PartnerBirdProvider } from "./types";
import { buildPartnerBirdMessages } from "./prompt";

const agentResultJsonSchema = z.toJSONSchema(agentResultSchema, {
  target: "draft-7",
});
delete agentResultJsonSchema.$schema;

type OpenRouterErrorCode =
  | "OPENROUTER_AUTH_FAILED"
  | "OPENROUTER_EMPTY_RESPONSE"
  | "OPENROUTER_INVALID_REQUEST"
  | "OPENROUTER_INVALID_RESPONSE"
  | "OPENROUTER_MODEL_UNAVAILABLE"
  | "OPENROUTER_PAYMENT_REQUIRED"
  | "OPENROUTER_RATE_LIMITED"
  | "OPENROUTER_TIMEOUT"
  | "OPENROUTER_UNAVAILABLE";

class OpenRouterProviderError extends Error {
  constructor(
    code: OpenRouterErrorCode,
    readonly model: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = "OpenRouterProviderError";
  }
}

export class OpenRouterPartnerBirdProvider implements PartnerBirdProvider {
  readonly name = "openrouter";
  model: string;
  private readonly models: string[];

  constructor(
    private readonly apiKey: string,
    model = process.env.OPENROUTER_MODEL ?? "minimax/minimax-m3:free",
    fallbackModels: string[] = [],
  ) {
    this.models = [model, ...fallbackModels].filter(
      (candidate, index, values) => values.indexOf(candidate) === index,
    );
    if (this.models.some((candidate) => !isConcreteOpenRouterModelId(candidate))) {
      throw new Error(
        "PartnerBird requires concrete OpenRouter model IDs in provider/model format.",
      );
    }
    this.model = model;
  }

  async runTurn(input: AgentTurnInput, signal: AbortSignal) {
    let lastError: unknown;
    for (const [index, model] of this.models.entries()) {
      this.model = model;
      try {
        return await this.runModel(input, signal, model);
      } catch (error) {
        const failure = normalizeProviderError(error, model);
        lastError = failure;
        console.warn("[agent/openrouter] model attempt failed", {
          attempt: index + 1,
          attemptsAvailable: this.models.length,
          code: failure instanceof Error ? failure.message : "UNKNOWN",
          model,
          status:
            failure instanceof OpenRouterProviderError
              ? failure.status
              : undefined,
        });
        if (signal.aborted || !isRetryableProviderError(failure)) throw failure;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("OPENROUTER_UNAVAILABLE");
  }

  private async runModel(input: AgentTurnInput, signal: AbortSignal, model: string) {
    const prompt = buildPartnerBirdMessages(input);
    const timeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS ?? 20000);
    const timeoutSignal = AbortSignal.timeout(
      Number.isFinite(timeoutMs) ? timeoutMs : 20000,
    );
    const combinedSignal = AbortSignal.any([signal, timeoutSignal]);

    const useStrictSchema = !model.endsWith(":free");
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_NAME ?? "PartnerBird",
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.25,
        max_tokens: 1600,
        response_format: useStrictSchema
          ? {
              type: "json_schema",
              json_schema: {
                name: "partnerbird_turn",
                strict: true,
                schema: agentResultJsonSchema,
              },
            }
          : { type: "json_object" },
        plugins: [{ id: "response-healing" }],
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
      signal: combinedSignal,
    });

    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: number | string; message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    } | null;
    if (!response.ok || payload?.error) {
      throw new OpenRouterProviderError(
        errorCodeForStatus(response.status),
        model,
        response.status,
      );
    }

    const content = payload?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      throw new OpenRouterProviderError("OPENROUTER_EMPTY_RESPONSE", model);
    }
    const cleaned = content
      .replace(/^\s*```(?:json)?/i, "")
      .replace(/```\s*$/, "")
      .trim();
    return agentResultSchema.parse(JSON.parse(cleaned));
  }
}

function errorCodeForStatus(status: number): OpenRouterErrorCode {
  if (status === 401 || status === 403) return "OPENROUTER_AUTH_FAILED";
  if (status === 402) return "OPENROUTER_PAYMENT_REQUIRED";
  if (status === 408 || status === 524) return "OPENROUTER_TIMEOUT";
  if (status === 429) return "OPENROUTER_RATE_LIMITED";
  if (status === 400 || status === 422) return "OPENROUTER_INVALID_REQUEST";
  if (status === 404) return "OPENROUTER_MODEL_UNAVAILABLE";
  return "OPENROUTER_UNAVAILABLE";
}

function normalizeProviderError(error: unknown, model: string): unknown {
  if (error instanceof OpenRouterProviderError) return error;
  if (error instanceof SyntaxError || error instanceof z.ZodError) {
    return new OpenRouterProviderError("OPENROUTER_INVALID_RESPONSE", model);
  }
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return new OpenRouterProviderError("OPENROUTER_TIMEOUT", model);
  }
  return error;
}

function isRetryableProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return [
    "OPENROUTER_EMPTY_RESPONSE",
    "OPENROUTER_INVALID_REQUEST",
    "OPENROUTER_INVALID_RESPONSE",
    "OPENROUTER_MODEL_UNAVAILABLE",
    "OPENROUTER_PAYMENT_REQUIRED",
    "OPENROUTER_RATE_LIMITED",
    "OPENROUTER_TIMEOUT",
    "OPENROUTER_UNAVAILABLE",
  ].includes(message);
}
