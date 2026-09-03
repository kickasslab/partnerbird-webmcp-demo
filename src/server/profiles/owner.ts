import "server-only";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth/server";
import {
  ONBOARDING_STARTER_BIO,
  ONBOARDING_STARTER_HEADLINE,
} from "@/lib/onboarding";
import { db } from "@/server/db/client";
import { profiles } from "@/server/db/schema";

export const requireOwnerUser = cache(async function requireOwnerUser() {
  const { data: session, error } = await auth.getSession();

  if (error || !session?.user) {
    redirect("/login");
  }

  if (!session.user.emailVerified) {
    const query = new URLSearchParams({
      email: session.user.email,
      returnTo: "/app",
    });
    redirect(`/verify-email?${query.toString()}`);
  }

  return session.user;
});

export const getOrClaimOwnerProfile = cache(async function getOrClaimOwnerProfile() {
  const user = await requireOwnerUser();
  const [ownedProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.ownerUserId, user.id))
    .limit(1);

  if (ownedProfile) return ownedProfile;

  const baseHandle = (user.name || "partner")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "partner";

  const [created] = await db
    .insert(profiles)
    .values({
      ownerUserId: user.id,
      handle: `${baseHandle}-${user.id.slice(0, 10).toLowerCase()}`,
      displayName: user.name || "New PartnerBird owner",
      headline: ONBOARDING_STARTER_HEADLINE,
      bio: ONBOARDING_STARTER_BIO,
      isOpen: true,
      isPublished: false,
      onboardingComplete: false,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [concurrentlyCreated] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.ownerUserId, user.id))
    .limit(1);
  if (concurrentlyCreated) return concurrentlyCreated;

  throw new Error("Unable to create an owner profile. Please retry.");
});

export async function getReadyOwnerProfile() {
  const profile = await getOrClaimOwnerProfile();
  if (!profile.onboardingComplete) redirect("/app/onboarding");
  return profile;
}

export const getOwnerContext = cache(async function getOwnerContext() {
  const user = await requireOwnerUser();
  const profile = await getOrClaimOwnerProfile();
  return { user, profile };
});
