export const planKeys = ["free", "pro", "business"] as const;
export type PlanKey = (typeof planKeys)[number];

export const billingIntervals = ["monthly", "annual"] as const;
export type BillingInterval = (typeof billingIntervals)[number];

export const featureKeys = [
  "public_profile",
  "partnerbird_chat",
  "website_analysis",
  "fit_assessment",
  "partnership_ideas",
  "ai_qualification",
  "partnership_proposals",
  "owner_takeover",
  "conversation_inbox",
  "opportunity_management",
  "profile_editing",
  "basic_agent_preferences",
  "advanced_agent_preferences",
  "private_agent_knowledge",
  "advanced_partnership_priorities",
  "agent_boundaries",
  "agent_rejection_preferences",
  "fit_assessment_preferences",
  "test_my_partnerbird",
  "conversation_search",
  "kiv",
  "opportunity_notes",
  "proposal_refinement",
  "advanced_profile_customization",
  "profile_section_controls",
  "detailed_analytics",
  "approved_content_generation",
  "data_export",
  "custom_domain",
  "team_collaboration",
  "shared_inbox",
  "api_webhooks",
] as const;
export type FeatureKey = (typeof featureKeys)[number];

export type PlanEntitlements = {
  aiConversationsPerMonth: number;
  newAiConversationsPerDay: number;
  aiRepliesPerConversation: number;
  websiteAnalysesPerConversation: number;
  websiteAnalysesPerMonth: number;
  profiles: number;
  teamMembers: number;
  knowledgeItems: number;
  activeWidgets: number;
  analyticsRetentionDays: number;
  branding: "visible" | "subtle" | "optional";
  features: Readonly<Record<FeatureKey, boolean>>;
};

export type PlanDefinition = {
  key: PlanKey;
  name: string;
  partnerbirdName: string;
  tagline: string;
  audience: string;
  badge?: string;
  price: { monthly: number; annual: number };
  entitlements: PlanEntitlements;
  highlights: readonly string[];
};

const freeFeatures = {
  public_profile: true,
  partnerbird_chat: true,
  website_analysis: true,
  fit_assessment: true,
  partnership_ideas: true,
  ai_qualification: true,
  partnership_proposals: true,
  owner_takeover: true,
  conversation_inbox: true,
  opportunity_management: true,
  profile_editing: true,
  basic_agent_preferences: true,
  advanced_agent_preferences: false,
  private_agent_knowledge: false,
  advanced_partnership_priorities: false,
  agent_boundaries: false,
  agent_rejection_preferences: false,
  fit_assessment_preferences: false,
  test_my_partnerbird: true,
  conversation_search: false,
  kiv: false,
  opportunity_notes: false,
  proposal_refinement: false,
  advanced_profile_customization: false,
  profile_section_controls: false,
  detailed_analytics: false,
  approved_content_generation: false,
  data_export: false,
  custom_domain: false,
  team_collaboration: false,
  shared_inbox: false,
  api_webhooks: false,
} satisfies Record<FeatureKey, boolean>;

const proFeatures = {
  ...freeFeatures,
  advanced_agent_preferences: true,
  private_agent_knowledge: true,
  advanced_partnership_priorities: true,
  agent_boundaries: true,
  agent_rejection_preferences: true,
  fit_assessment_preferences: true,
  conversation_search: true,
  kiv: true,
  opportunity_notes: true,
  proposal_refinement: true,
  advanced_profile_customization: true,
  profile_section_controls: true,
  detailed_analytics: true,
  approved_content_generation: true,
} satisfies Record<FeatureKey, boolean>;

const businessFeatures = {
  ...proFeatures,
  data_export: true,
  // These flags model the future entitlement boundary without claiming the UI exists.
  team_collaboration: false,
  shared_inbox: false,
  custom_domain: false,
  api_webhooks: false,
} satisfies Record<FeatureKey, boolean>;

export const PLAN_CONFIG = {
  free: {
    key: "free",
    name: "Free",
    partnerbirdName: "PartnerBird Free",
    tagline: "Start your PartnerBird",
    audience: "For trying PartnerBird or receiving occasional partnership inquiries.",
    price: { monthly: 0, annual: 0 },
    entitlements: {
      aiConversationsPerMonth: 20,
      newAiConversationsPerDay: 5,
      aiRepliesPerConversation: 8,
      websiteAnalysesPerConversation: 1,
      websiteAnalysesPerMonth: 20,
      profiles: 1,
      teamMembers: 1,
      knowledgeItems: 3,
      activeWidgets: 1,
      analyticsRetentionDays: 30,
      branding: "visible",
      features: freeFeatures,
    },
    highlights: [
      "20 AI partnership conversations each month",
      "Website analysis, fit assessment, and partnership ideas",
      "Public PartnerBird profile and owner takeover",
      "Basic inbox and opportunity management",
      "3 active knowledge items",
    ],
  },
  pro: {
    key: "pro",
    name: "Pro",
    partnerbirdName: "PartnerBird Pro",
    tagline: "Put PartnerBird to work",
    audience:
      "For creators, founders, consultants, newsletters, communities, and small internet businesses actively seeking partnerships.",
    badge: "Most Popular",
    price: { monthly: 19, annual: 190 },
    entitlements: {
      aiConversationsPerMonth: 150,
      newAiConversationsPerDay: 30,
      aiRepliesPerConversation: 12,
      websiteAnalysesPerConversation: 2,
      websiteAnalysesPerMonth: 100,
      profiles: 1,
      teamMembers: 1,
      knowledgeItems: 25,
      activeWidgets: 5,
      analyticsRetentionDays: 365,
      branding: "subtle",
      features: proFeatures,
    },
    highlights: [
      "150 AI partnership conversations each month",
      "Advanced agent preferences and private knowledge",
      "Full conversation and opportunity tools",
      "25 active knowledge items",
      "More detailed analytics with 12-month history",
    ],
  },
  business: {
    key: "business",
    name: "Business",
    partnerbirdName: "PartnerBird Business",
    tagline: "Run partnerships with PartnerBird",
    audience: "For companies and teams running a more serious partnership program.",
    price: { monthly: 49, annual: 490 },
    entitlements: {
      aiConversationsPerMonth: 500,
      newAiConversationsPerDay: 100,
      aiRepliesPerConversation: 16,
      websiteAnalysesPerConversation: 3,
      websiteAnalysesPerMonth: 500,
      profiles: 3,
      teamMembers: 5,
      knowledgeItems: 100,
      activeWidgets: 25,
      analyticsRetentionDays: 730,
      branding: "optional",
      features: businessFeatures,
    },
    highlights: [
      "500 AI partnership conversations each month",
      "100 active knowledge items",
      "Advanced analytics and data export",
      "Optional attribution control is coming soon",
      "Team workflows and extra profiles are coming soon",
    ],
  },
} as const satisfies Record<PlanKey, PlanDefinition>;

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && planKeys.includes(value as PlanKey);
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return (
    typeof value === "string" &&
    billingIntervals.includes(value as BillingInterval)
  );
}

export function getPlan(plan: PlanKey): PlanDefinition {
  return PLAN_CONFIG[plan];
}

export function getEntitlements(plan: PlanKey): PlanEntitlements {
  return PLAN_CONFIG[plan].entitlements;
}

export function canUseFeature(plan: PlanKey, feature: FeatureKey): boolean {
  return PLAN_CONFIG[plan].entitlements.features[feature];
}

export function formatPlanPrice(plan: PlanKey, interval: BillingInterval) {
  const amount = PLAN_CONFIG[plan].price[interval];
  if (amount === 0) return "$0";
  return interval === "monthly" ? `$${amount}` : `$${Math.round(amount / 12)}`;
}
