import "server-only";

import { eq } from "drizzle-orm";

import {
  getEnvironmentAgentModelConfiguration,
  parseAgentModelConfiguration,
} from "@/lib/agent-models";
import type { PlanKey } from "@/lib/billing/plans";
import { db } from "@/server/db/client";
import { agentModelConfigurations } from "@/server/db/schema";

const CONFIGURATION_ID = "default";

export async function getAgentModelRouting(plan: PlanKey): Promise<{
  model: string;
  fallbackModels: string[];
}> {
  const managed = await readManagedConfiguration().catch((error) => {
    console.error(
      "Unable to read managed agent models; using environment configuration.",
      error,
    );
    return null;
  });
  const effective = managed ?? getEnvironmentAgentModelConfiguration();

  return {
    model: effective.primaryModels[plan].modelId,
    fallbackModels: effective.fallbackModels
      .filter((model) => model.enabled)
      .map((model) => model.modelId),
  };
}

async function readManagedConfiguration() {
  const [row] = await db
    .select({ configuration: agentModelConfigurations.configuration })
    .from(agentModelConfigurations)
    .where(eq(agentModelConfigurations.id, CONFIGURATION_ID))
    .limit(1);

  if (!row) return null;
  const configuration = parseAgentModelConfiguration(row.configuration);
  if (!configuration) throw new Error("AGENT_MODEL_CONFIGURATION_INVALID");
  return configuration;
}
