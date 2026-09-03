"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { defaultAgentSettings } from "@/lib/agent-defaults";
import {
  getOnboardingStarterIssue,
  type OnboardingFieldName,
} from "@/lib/onboarding";
import { db, neonSql } from "@/server/db/client";
import { profiles } from "@/server/db/schema";
import { getOrClaimOwnerProfile } from "@/server/profiles/owner";

export type OwnerActionState = {
  success?: string;
  error?: string;
  field?: OnboardingFieldName;
  step?: number;
} | null;

const reservedHandles = new Set([
  "app",
  "api",
  "login",
  "signup",
  "settings",
  "privacy",
  "terms",
  "agent",
]);

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use letters, numbers, and hyphens."),
  headline: z.string().trim().min(3).max(180),
  bio: z.string().trim().min(20).max(1600),
  isOpen: z.boolean(),
});

export async function completeOnboardingAction(
  _previousState: OwnerActionState,
  formData: FormData,
): Promise<OwnerActionState> {
  const profile = await getOrClaimOwnerProfile();
  if (profile.onboardingComplete) redirect("/app/settings/webmcp");

  const parsedProfile = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    handle: formData.get("handle"),
    headline: formData.get("headline"),
    bio: formData.get("bio"),
    isOpen: formData.get("isOpen") === "on",
  });
  if (!parsedProfile.success) {
    const field = parsedProfile.error.issues[0]?.path[0];
    const profileField =
      field === "displayName" ||
      field === "handle" ||
      field === "headline" ||
      field === "bio"
        ? field
        : undefined;
    return {
      error: parsedProfile.error.issues[0]?.message ?? "Review the profile details.",
      field: profileField,
      step:
        profileField === "headline" || profileField === "bio"
          ? 1
          : profileField
            ? 0
            : undefined,
    };
  }
  if (reservedHandles.has(parsedProfile.data.handle)) {
    return { error: "That handle is reserved. Choose another.", field: "handle", step: 0 };
  }
  const starterIssue = getOnboardingStarterIssue(parsedProfile.data);
  if (starterIssue) return starterIssue;

  const [handleOwner] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.handle, parsedProfile.data.handle), ne(profiles.id, profile.id)))
    .limit(1);
  if (handleOwner) {
    return { error: "That public handle is already in use.", field: "handle", step: 0 };
  }

  const rawList = (name: string) =>
    String(formData.get(name) ?? "")
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 12);
  const parseList = (name: string, maximumLength: number) =>
    z.array(z.string().min(1).max(maximumLength)).max(12).safeParse(rawList(name));

  const interestsResult = parseList("interests", 160);
  const capabilitiesResult = parseList("capabilities", 160);
  const projectsResult = parseList("projects", 140);
  const activationsResult = parseList("activations", 160);
  const invalidList = [
    { field: "interests" as const, result: interestsResult, step: 2 },
    { field: "capabilities" as const, result: capabilitiesResult, step: 3 },
    { field: "projects" as const, result: projectsResult, step: 4 },
    { field: "activations" as const, result: activationsResult, step: 6 },
  ].find(({ result }) => !result.success);
  if (invalidList && !invalidList.result.success) {
    return {
      error: invalidList.result.error.issues[0]?.message ?? "Shorten the list item.",
      field: invalidList.field,
      step: invalidList.step,
    };
  }

  const interests = interestsResult.data ?? [];
  const capabilities = capabilitiesResult.data ?? [];
  const projects = projectsResult.data ?? [];
  const activations = activationsResult.data ?? [];
  const thingsToAvoid = String(formData.get("thingsToAvoid") ?? "").trim();
  if (thingsToAvoid.length > 1500) {
    return {
      error: "Keep private guidance under 1,500 characters.",
      field: "thingsToAvoid",
      step: 5,
    };
  }

  const savedAt = new Date();
  try {
    await neonSql.transaction((transaction) => {
      const queries = [
        transaction`DELETE FROM profile_items WHERE profile_id = ${profile.id}`,
        transaction`DELETE FROM profile_projects WHERE profile_id = ${profile.id}`,
        transaction`DELETE FROM activation_capabilities WHERE profile_id = ${profile.id}`,
      ];

      if (interests.length) {
        queries.push(transaction`
          INSERT INTO profile_items (
            profile_id, kind, label, sort_order, created_at, updated_at
          )
          SELECT ${profile.id}, 'interest', value, (ordinality - 1)::integer,
                 ${savedAt}, ${savedAt}
          FROM jsonb_array_elements_text(${JSON.stringify(interests)}::jsonb)
          WITH ORDINALITY
        `);
      }
      if (capabilities.length) {
        queries.push(transaction`
          INSERT INTO profile_items (
            profile_id, kind, label, detail, sort_order, created_at, updated_at
          )
          SELECT ${profile.id}, 'capability', value, 'Available',
                 (ordinality - 1)::integer, ${savedAt}, ${savedAt}
          FROM jsonb_array_elements_text(${JSON.stringify(capabilities)}::jsonb)
          WITH ORDINALITY
        `);
      }
      if (projects.length) {
        queries.push(transaction`
          INSERT INTO profile_projects (
            profile_id, name, description, fit_label, tone, sort_order,
            created_at, updated_at
          )
          SELECT ${profile.id}, value,
                 'A project PartnerBird can use when evaluating collaboration fit.',
                 'Strong fit', 'emerald', (ordinality - 1)::integer,
                 ${savedAt}, ${savedAt}
          FROM jsonb_array_elements_text(${JSON.stringify(projects)}::jsonb)
          WITH ORDINALITY
        `);
      }
      if (activations.length) {
        queries.push(transaction`
          INSERT INTO activation_capabilities (
            profile_id, type_key, label, note, is_available, sort_order,
            created_at, updated_at
          )
          SELECT ${profile.id}, 'custom_' || (ordinality - 1)::text, value,
                 'Available', true, (ordinality - 1)::integer,
                 ${savedAt}, ${savedAt}
          FROM jsonb_array_elements_text(${JSON.stringify(activations)}::jsonb)
          WITH ORDINALITY
        `);
      }
      if (thingsToAvoid) {
        queries.push(transaction`
          INSERT INTO agent_private_settings (
            profile_id, tone, priorities, things_to_avoid, rejection_rules,
            private_evaluation_notes, created_at, updated_at
          ) VALUES (
            ${profile.id}, ${defaultAgentSettings.tone},
            ${defaultAgentSettings.priorities}, ${thingsToAvoid},
            ${defaultAgentSettings.rejectionRules},
            ${defaultAgentSettings.privateEvaluationNotes}, ${savedAt}, ${savedAt}
          )
          ON CONFLICT (profile_id) DO UPDATE
          SET things_to_avoid = EXCLUDED.things_to_avoid, updated_at = EXCLUDED.updated_at
        `);
      }

      queries.push(transaction`
        UPDATE profiles
        SET display_name = ${parsedProfile.data.displayName},
            handle = ${parsedProfile.data.handle},
            headline = ${parsedProfile.data.headline},
            bio = ${parsedProfile.data.bio},
            is_open = ${parsedProfile.data.isOpen},
            is_published = true,
            onboarding_complete = true,
            updated_at = ${savedAt}
        WHERE id = ${profile.id} AND onboarding_complete = false
      `);
      return queries;
    });
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      return { error: "That public handle is already in use.", field: "handle", step: 0 };
    }
    console.error("Failed to complete onboarding", error);
    return {
      error:
        "We couldn’t publish your PartnerBird. Your onboarding is not complete; please try again.",
    };
  }

  revalidatePath(`/@${profile.handle}`);
  revalidatePath(`/@${parsedProfile.data.handle}`);
  revalidatePath("/app/settings/webmcp");
  redirect("/app/settings/webmcp");
}

function databaseErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return "";
  return typeof error.code === "string" ? error.code : "";
}
