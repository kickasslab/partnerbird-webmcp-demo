"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db/client";
import { profiles, webmcpBlocks, webmcpSettings } from "@/server/db/schema";
import { getReadyOwnerProfile } from "@/server/profiles/owner";

export type WebMCPSettingsActionState = { success?: string; error?: string } | null;

const settingsSchema = z.object({
  enabled: z.boolean(),
  allowPublicProfileRead: z.boolean(),
  allowDiscovery: z.boolean(),
  allowMatching: z.boolean(),
  allowSavePartners: z.boolean(),
  allowCreateDrafts: z.boolean(),
  allowSubmitRequests: z.boolean(),
  allowIncomingRequests: z.boolean(),
  requireVerifiedEmail: z.boolean(),
  requireCompleteProfile: z.boolean(),
  interestMatchMode: z.enum(["off", "prefer", "require"]),
  inboundStrictness: z.enum(["standard", "strict", "very_strict"]),
});

export async function saveWebMCPSettingsAction(
  _previous: WebMCPSettingsActionState,
  formData: FormData,
): Promise<WebMCPSettingsActionState> {
  const profile = await getReadyOwnerProfile();
  const parsed = settingsSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    allowPublicProfileRead: formData.get("allowPublicProfileRead") === "on",
    allowDiscovery: formData.get("allowDiscovery") === "on",
    allowMatching: formData.get("allowMatching") === "on",
    allowSavePartners: formData.get("allowSavePartners") === "on",
    allowCreateDrafts: formData.get("allowCreateDrafts") === "on",
    allowSubmitRequests: formData.get("allowSubmitRequests") === "on",
    allowIncomingRequests: formData.get("allowIncomingRequests") === "on",
    requireVerifiedEmail: formData.get("requireVerifiedEmail") === "on",
    requireCompleteProfile: formData.get("requireCompleteProfile") === "on",
    interestMatchMode: formData.get("interestMatchMode"),
    inboundStrictness: formData.get("inboundStrictness"),
  });
  if (!parsed.success) return { error: "Review the WebMCP access settings." };

  const values = { ...parsed.data, updatedAt: new Date() };
  await db.insert(webmcpSettings).values({ profileId: profile.id, ...values }).onConflictDoUpdate({
    target: webmcpSettings.profileId,
    set: values,
  });
  revalidatePath("/app/settings/webmcp");
  revalidatePath(`/@${profile.handle}`);
  return { success: parsed.data.enabled ? "WebMCP access settings saved." : "WebMCP is now disabled for your account." };
}

const usernameSchema = z.string().trim().toLowerCase().min(2).max(48).regex(/^[a-z0-9-]+$/);

export async function blockPartnerAction(formData: FormData) {
  const profile = await getReadyOwnerProfile();
  const parsed = usernameSchema.safeParse(formData.get("username"));
  if (!parsed.success) return;
  const [target] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.handle, parsed.data)).limit(1);
  if (!target || target.id === profile.id) return;
  await db.insert(webmcpBlocks).values({ blockerProfileId: profile.id, blockedProfileId: target.id }).onConflictDoNothing();
  revalidatePath("/app/settings/webmcp");
}

export async function unblockPartnerAction(formData: FormData) {
  const profile = await getReadyOwnerProfile();
  const parsed = usernameSchema.safeParse(formData.get("username"));
  if (!parsed.success) return;
  const [target] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.handle, parsed.data)).limit(1);
  if (!target) return;
  await db.delete(webmcpBlocks).where(and(eq(webmcpBlocks.blockerProfileId, profile.id), eq(webmcpBlocks.blockedProfileId, target.id)));
  revalidatePath("/app/settings/webmcp");
}
