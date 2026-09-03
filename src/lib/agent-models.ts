import { z } from "zod";

import { planKeys, type PlanKey } from "@/lib/billing/plans";

export const MAX_AGENT_FALLBACK_MODELS = 10;

const openRouterModelIdSchema = z
  .string()
  .trim()
  .min(3, "Enter an OpenRouter model ID.")
  .max(200, "Model IDs must be 200 characters or fewer.")
  .refine(
    isConcreteOpenRouterModelId,
    "Use a concrete OpenRouter model ID in provider/model format.",
  );

export const agentModelDefinitionSchema = z.object({
  modelId: openRouterModelIdSchema,
  name: z.string().trim().min(1, "Add a model name.").max(120),
  description: z.string().trim().max(500),
});

export const agentFallbackModelSchema = agentModelDefinitionSchema.extend({
  enabled: z.boolean(),
});

export const agentModelConfigurationSchema = z
  .object({
    schemaVersion: z.literal(1),
    primaryModels: z.object({
      free: agentModelDefinitionSchema,
      pro: agentModelDefinitionSchema,
      business: agentModelDefinitionSchema,
    }),
    fallbackModels: z
      .array(agentFallbackModelSchema)
      .max(MAX_AGENT_FALLBACK_MODELS),
  })
  .superRefine((configuration, context) => {
    const seenFallbacks = new Set<string>();
    configuration.fallbackModels.forEach((model, index) => {
      if (seenFallbacks.has(model.modelId)) {
        context.addIssue({
          code: "custom",
          message: "Each fallback model ID can only appear once.",
          path: ["fallbackModels", index, "modelId"],
        });
      }
      seenFallbacks.add(model.modelId);
    });
  });

export type AgentModelDefinition = z.infer<typeof agentModelDefinitionSchema>;
export type AgentFallbackModel = z.infer<typeof agentFallbackModelSchema>;
export type AgentModelConfiguration = z.infer<
  typeof agentModelConfigurationSchema
>;

export function parseAgentModelConfiguration(
  value: unknown,
): AgentModelConfiguration | null {
  const result = agentModelConfigurationSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function isConcreteOpenRouterModelId(modelId: string): boolean {
  return /^[^/\s]+\/[^/\s]+$/.test(modelId) && modelId !== "openrouter/free";
}

export function getEnvironmentAgentModelConfiguration(): AgentModelConfiguration {
  const defaultModel =
    process.env.OPENROUTER_MODEL ?? "minimax/minimax-m3:free";
  const primaryModels = Object.fromEntries(
    planKeys.map((plan) => {
      const modelId = configuredEnvironmentModel(plan, defaultModel);
      return [
        plan,
        {
          modelId,
          name: modelId,
          description: "Configured through the deployment environment.",
        },
      ];
    }),
  ) as Record<PlanKey, AgentModelDefinition>;
  const fallbackModels = (process.env.OPENROUTER_FREE_FALLBACK_MODELS ?? "")
    .split(",")
    .map((modelId) => modelId.trim())
    .filter(Boolean)
    .map((modelId) => ({
      modelId,
      name: modelId,
      description: "Configured through the deployment environment.",
      enabled: true,
    }));

  return agentModelConfigurationSchema.parse({
    schemaVersion: 1,
    primaryModels,
    fallbackModels,
  });
}

function configuredEnvironmentModel(plan: PlanKey, fallback: string): string {
  if (plan === "business") {
    return process.env.OPENROUTER_MODEL_BUSINESS || fallback;
  }
  if (plan === "pro") return process.env.OPENROUTER_MODEL_PRO || fallback;
  return process.env.OPENROUTER_MODEL_FREE || fallback;
}
