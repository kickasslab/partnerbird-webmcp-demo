import "server-only";

import { eq } from "drizzle-orm";

import {
  canUseFeature,
  getEntitlements,
  isPlanKey,
  type BillingInterval,
  type FeatureKey,
  type PlanKey,
} from "@/lib/billing/plans";
import { db } from "@/server/db/client";
import { billingSubscriptions, profiles } from "@/server/db/schema";

export const paidEntitlementStatuses = ["active", "trialing", "past_due"] as const;

export type BillingAccount = {
  plan: PlanKey;
  billingInterval: BillingInterval | null;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  isPaid: boolean;
  isPastDue: boolean;
  isDevelopmentOverride: boolean;
};

export async function getBillingAccount(profileId: string): Promise<BillingAccount> {
  const [[profile], [subscription]] = await Promise.all([
    db
      .select({ ownerUserId: profiles.ownerUserId })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1),
    db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.profileId, profileId))
      .limit(1),
  ]);

  const override = developmentPlanOverride(profile?.ownerUserId ?? null);
  if (override) {
    return {
      plan: override,
      billingInterval: override === "free" ? null : "monthly",
      status: "development_override",
      stripeCustomerId: subscription?.stripeCustomerId ?? null,
      stripeSubscriptionId: subscription?.stripeSubscriptionId ?? null,
      currentPeriodStart: subscription?.currentPeriodStart ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      isPaid: override !== "free",
      isPastDue: false,
      isDevelopmentOverride: true,
    };
  }

  const paidStatus = subscription
    ? paidEntitlementStatuses.includes(
        subscription.status as (typeof paidEntitlementStatuses)[number],
      )
    : false;
  const plan =
    paidStatus && subscription && isPlanKey(subscription.planKey)
      ? subscription.planKey
      : "free";
  const billingInterval =
    subscription?.billingInterval === "monthly" ||
    subscription?.billingInterval === "annual"
      ? subscription.billingInterval
      : null;

  return {
    plan,
    billingInterval,
    status: subscription?.status ?? "free",
    stripeCustomerId: subscription?.stripeCustomerId ?? null,
    stripeSubscriptionId: subscription?.stripeSubscriptionId ?? null,
    currentPeriodStart: subscription?.currentPeriodStart ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    isPaid: plan !== "free",
    isPastDue: subscription?.status === "past_due",
    isDevelopmentOverride: false,
  };
}
export async function getCurrentPlan(profileId: string) {
  return (await getBillingAccount(profileId)).plan;
}

export async function getCurrentEntitlements(profileId: string) {
  return getEntitlements(await getCurrentPlan(profileId));
}

export async function canProfileUseFeature(
  profileId: string,
  feature: FeatureKey,
) {
  return canUseFeature(await getCurrentPlan(profileId), feature);
}

export async function requireEntitlement(
  profileId: string,
  feature: FeatureKey,
) {
  const plan = await getCurrentPlan(profileId);
  if (!canUseFeature(plan, feature)) {
    throw new EntitlementError(feature, plan);
  }
  return { plan, entitlements: getEntitlements(plan) };
}

export class EntitlementError extends Error {
  readonly code = "ENTITLEMENT_REQUIRED";

  constructor(
    readonly feature: FeatureKey,
    readonly plan: PlanKey,
  ) {
    super(`The ${feature} feature is not included in PartnerBird ${plan}.`);
  }
}

function developmentPlanOverride(ownerUserId: string | null): PlanKey | null {
  const requested = process.env.PARTNERBIRD_PLAN_OVERRIDE;
  if (!isPlanKey(requested)) return null;
  if (process.env.NODE_ENV !== "production") return requested;
  if (!ownerUserId) return null;
  const authorizedUsers = (process.env.PARTNERBIRD_PLAN_OVERRIDE_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return authorizedUsers.includes(ownerUserId) ? requested : null;
}

