import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { defaultAgentSettings } from "@/lib/agent-defaults";
import {
  activationCapabilities,
  agentPrivateSettings,
  agentPublicSettings,
  profileItems,
  profileProjects,
  profiles,
  knowledgeItems,
} from "@/server/db/schema";

export async function getAgentContext(profileId: string) {
  const [[profile], projects, items, activations, knowledge, [publicSettings], [privateSettings]] =
    await Promise.all([
      db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1),
      db
        .select()
        .from(profileProjects)
        .where(and(eq(profileProjects.profileId, profileId), eq(profileProjects.isEnabled, true)))
        .orderBy(asc(profileProjects.sortOrder)),
      db
        .select()
        .from(profileItems)
        .where(and(eq(profileItems.profileId, profileId), eq(profileItems.isEnabled, true)))
        .orderBy(asc(profileItems.sortOrder)),
      db
        .select()
        .from(activationCapabilities)
        .where(
          and(
            eq(activationCapabilities.profileId, profileId),
            eq(activationCapabilities.isAvailable, true),
          ),
        )
        .orderBy(asc(activationCapabilities.sortOrder)),
      db
        .select()
        .from(knowledgeItems)
        .where(and(eq(knowledgeItems.profileId, profileId), eq(knowledgeItems.state, "active")))
        .orderBy(asc(knowledgeItems.sortOrder)),
      db
        .select()
        .from(agentPublicSettings)
        .where(eq(agentPublicSettings.profileId, profileId))
        .limit(1),
      db
        .select()
        .from(agentPrivateSettings)
        .where(eq(agentPrivateSettings.profileId, profileId))
        .limit(1),
    ]);

  if (!profile) throw new Error("PROFILE_NOT_FOUND");

  const itemList = (kind: string) =>
    items.filter((item) => item.kind === kind).map((item) => item.label);

  const publicContext = [
    `Name: ${profile.displayName}`,
    `Headline: ${profile.headline}`,
    `Bio: ${profile.bio}`,
    `Open to partnerships: ${profile.isOpen ? "yes" : "no"}`,
    `Interests: ${itemList("interest").join(", ")}`,
    `Capabilities: ${itemList("capability").join(", ")}`,
    `Guidelines: ${itemList("guideline").join("; ")}`,
    `Projects: ${projects
      .map((project) => `${project.name} — ${project.description}`)
      .join(" | ")}`,
    `Available activations: ${activations.map((item) => item.label).join(", ")}`,
    `Public agent introduction: ${publicSettings?.introduction ?? defaultAgentSettings.introduction}`,
    `Public knowledge: ${knowledge
      .filter((item) => item.visibility === "public")
      .map((item) => `${item.title} — ${item.description}`)
      .join(" | ")}`,
  ].join("\n");

  const privateContext = [
    `Tone: ${privateSettings?.tone ?? defaultAgentSettings.tone}`,
    `Priorities: ${privateSettings?.priorities ?? defaultAgentSettings.priorities}`,
    `Things to avoid: ${privateSettings?.thingsToAvoid ?? defaultAgentSettings.thingsToAvoid}`,
    `Rejection rules: ${privateSettings?.rejectionRules ?? defaultAgentSettings.rejectionRules}`,
    `Private notes: ${privateSettings?.privateEvaluationNotes ?? defaultAgentSettings.privateEvaluationNotes}`,
    `Agent-only knowledge: ${knowledge
      .filter((item) => item.visibility === "agent_only")
      .map((item) => `${item.title} — ${item.description}`)
      .join(" | ")}`,
    `Structured configuration: ${JSON.stringify(privateSettings?.configuration ?? {})}`,
  ].join("\n");

  const privateKnowledge = knowledge.filter(
    (item) => item.visibility === "agent_only",
  );

  return {
    profile,
    publicContext,
    privateContext,
    privateFragments: [
      privateSettings?.tone ?? defaultAgentSettings.tone,
      privateSettings?.priorities ?? defaultAgentSettings.priorities,
      privateSettings?.thingsToAvoid ?? defaultAgentSettings.thingsToAvoid,
      privateSettings?.rejectionRules ?? defaultAgentSettings.rejectionRules,
      privateSettings?.privateEvaluationNotes ??
        defaultAgentSettings.privateEvaluationNotes,
      ...privateKnowledge.flatMap((item) => [item.title, item.description]),
      ...collectPrivateStrings(privateSettings?.configuration ?? {}),
    ].filter((value): value is string => Boolean(value && value.trim().length >= 12)),
  };
}

function collectPrivateStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectPrivateStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectPrivateStrings);
  }
  return [];
}

export function containsPrivateContextLeak(output: string, privateFragments: string[]) {
  const normalizedOutput = normalize(output);
  return privateFragments.some((fragment) => {
    const normalizedFragment = normalize(fragment);
    if (normalizedFragment.length < 12) return false;
    if (normalizedOutput.includes(normalizedFragment)) return true;

    const words = normalizedFragment.split(" ").filter(Boolean);
    const windowSize = Math.min(7, words.length);
    if (windowSize < 4) return false;
    for (let index = 0; index <= words.length - windowSize; index += 1) {
      const window = words.slice(index, index + windowSize).join(" ");
      if (window.length >= 24 && normalizedOutput.includes(window)) return true;
    }
    return false;
  });
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
