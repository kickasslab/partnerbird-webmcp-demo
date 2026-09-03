import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";

import { defaultAgentSettings } from "@/lib/agent-defaults";
import { demoProfile, type PublicProfile } from "@/lib/profile-data";
import {
  getProfileThemePreset,
  normalizeProfilePrimaryColor,
} from "@/lib/profile-themes";
import { db, neonSql } from "@/server/db/client";
import {
  activationCapabilities,
  appearanceSettings,
  agentPublicSettings,
  profileItems,
  profileProjects,
  profileSections,
  profiles,
} from "@/server/db/schema";

export const getPublicProfileByHandle = cache(async function getPublicProfileByHandle(
  handle: string,
): Promise<PublicProfile | null> {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.handle, handle.toLowerCase()), eq(profiles.isPublished, true)))
    .limit(1);

  if (!profile) return null;

  const [projects, items, activations, sections, [publicSettings], [appearance], metricRows] = await Promise.all([
    db
      .select()
      .from(profileProjects)
      .where(and(eq(profileProjects.profileId, profile.id), eq(profileProjects.isEnabled, true)))
      .orderBy(asc(profileProjects.sortOrder)),
    db
      .select()
      .from(profileItems)
      .where(and(eq(profileItems.profileId, profile.id), eq(profileItems.isEnabled, true)))
      .orderBy(asc(profileItems.sortOrder)),
    db
      .select()
      .from(activationCapabilities)
      .where(
        and(
          eq(activationCapabilities.profileId, profile.id),
          eq(activationCapabilities.isAvailable, true),
          eq(activationCapabilities.status, "available"),
        ),
      )
      .orderBy(asc(activationCapabilities.sortOrder)),
    db
      .select()
      .from(profileSections)
      .where(eq(profileSections.profileId, profile.id))
      .orderBy(asc(profileSections.sortOrder)),
    db
      .select({
        introduction: agentPublicSettings.introduction,
        agentName: agentPublicSettings.agentName,
        greeting: agentPublicSettings.greeting,
      })
      .from(agentPublicSettings)
      .where(eq(agentPublicSettings.profileId, profile.id))
      .limit(1),
    db
      .select()
      .from(appearanceSettings)
      .where(eq(appearanceSettings.profileId, profile.id))
      .limit(1),
    profile.showPublicMetrics
      ? neonSql`
          SELECT
            (SELECT count(*)::int FROM conversations WHERE profile_id=${profile.id} AND mode='live') AS screened,
            (SELECT count(*)::int FROM (
              SELECT DISTINCT ON (f.conversation_id) f.label
              FROM fit_assessments f
              JOIN conversations c ON c.id=f.conversation_id
              WHERE c.profile_id=${profile.id} AND c.mode='live'
              ORDER BY f.conversation_id, f.created_at DESC
            ) latest WHERE latest.label='Strong Fit') AS strong,
            (SELECT count(*)::int FROM activation_records WHERE profile_id=${profile.id} AND status='completed') AS completed
        `
      : Promise.resolve([]),
  ]);

  const visible = (key: string) => sections.find((section) => section.key === key)?.isEnabled ?? true;

  const interests = items.filter((item) => item.kind === "interest");
  const capabilities = items.filter((item) => item.kind === "capability");
  const guidelines = items.filter((item) => item.kind === "guideline");

  return {
    handle: profile.handle,
    displayName: profile.displayName,
    headline: profile.headline,
    bio: visible("about") ? profile.bio.split(/\n\s*\n/).filter(Boolean) : [],
    avatarUrl:
      profile.avatarUrl ??
      (profile.isDemo ? demoProfile.avatarUrl : "/assets/default-profile-avatar.svg"),
    websiteUrl: profile.websiteUrl ?? undefined,
    socialLinks: profile.socialLinks,
    isOpen: profile.partnershipStatus !== "unavailable" && profile.isOpen,
    isDemo: profile.isDemo,
    appearance: appearance
      ? {
          accentPreset: getProfileThemePreset(appearance.accentPreset).id,
          primaryColor: normalizeProfilePrimaryColor(appearance.primaryColor),
          surfacePreset: appearance.surfacePreset,
          cardPreset: appearance.cardPreset,
          density: appearance.density,
        }
      : undefined,
    agentName: publicSettings?.agentName ?? "PartnerBird",
    agentGreeting:
      publicSettings?.greeting ?? `Hi! I’m ${profile.displayName}’s PartnerBird.`,
    agentIntroduction:
      publicSettings?.introduction ?? defaultAgentSettings.introduction,
    interests: visible("interests") ? interests.map((item) => item.label) : [],
    capabilities: visible("capabilities") ? capabilities.map((item) => ({
      label: item.label,
      detail: item.detail ?? "",
    })) : [],
    projects: visible("projects") ? projects.map((project) => ({
      name: project.name,
      description: project.description,
      fit: project.fitLabel === "Good fit" ? "Good fit" : "Strong fit",
      tone:
        project.tone === "violet" ||
        project.tone === "indigo" ||
        project.tone === "ink"
          ? project.tone
          : "emerald",
    })) : [],
    guidelines: visible("guidelines") ? guidelines.map((item) => item.label) : [],
    activations: visible("activations") ? activations.map((activation) => ({
      label: activation.label,
      note: activation.note,
    })) : [],
    metrics: visible("metrics")
      ? profile.isDemo
        ? demoProfile.metrics
        : metricRows.length
          ? [
              { value: String((metricRows[0] as { screened: number }).screened), label: "opportunities screened" },
              { value: String((metricRows[0] as { strong: number }).strong), label: "strong fits" },
              { value: String((metricRows[0] as { completed: number }).completed), label: "activations completed" },
            ]
          : []
      : [],
    collaborations: visible("collaborations") && profile.isDemo ? demoProfile.collaborations : [],
  };
});

export async function getProfileRecordByHandle(handle: string) {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.handle, handle.toLowerCase()))
    .limit(1);
  return profile ?? null;
}
