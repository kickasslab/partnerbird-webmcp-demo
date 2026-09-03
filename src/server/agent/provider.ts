import "server-only";

import type { PlanKey } from "@/lib/billing/plans";

import type { PartnerBirdProvider } from "./types";
import { MockPartnerBirdProvider } from "./mock-provider";
import { getAgentModelRouting } from "./model-settings";
import { OpenRouterPartnerBirdProvider } from "./openrouter-provider";

export async function getPartnerBirdProvider(
  plan: PlanKey = "free",
): Promise<PartnerBirdProvider> {
  const mode = process.env.PARTNERBIRD_AGENT_MODE ?? "mock";
  if (mode === "mock") {
    return new MockPartnerBirdProvider();
  }

  if (mode !== "openrouter") {
    throw new Error("PARTNERBIRD_AGENT_MODE_INVALID");
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_NOT_CONFIGURED");
  }

  const { model, fallbackModels } = await getAgentModelRouting(plan);
  return new OpenRouterPartnerBirdProvider(
    apiKey,
    model,
    fallbackModels,
  );
}
