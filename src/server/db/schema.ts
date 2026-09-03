import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: text("owner_user_id"),
    handle: varchar("handle", { length: 48 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    headline: varchar("headline", { length: 180 }).notNull(),
    bio: text("bio").notNull(),
    avatarUrl: text("avatar_url"),
    websiteUrl: text("website_url"),
    location: varchar("location", { length: 160 }),
    socialLinks: jsonb("social_links").$type<Record<string, string>>().default({}).notNull(),
    isOpen: boolean("is_open").default(true).notNull(),
    partnershipStatus: varchar("partnership_status", { length: 24 }).default("open").notNull(),
    showPublicMetrics: boolean("show_public_metrics").default(false).notNull(),
    isPublished: boolean("is_published").default(false).notNull(),
    isDemo: boolean("is_demo").default(false).notNull(),
    onboardingComplete: boolean("onboarding_complete").default(false).notNull(),
    lockVersion: integer("lock_version").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("profiles_handle_unique").on(table.handle),
    uniqueIndex("profiles_owner_user_id_unique").on(table.ownerUserId),
    index("profiles_admin_updated_idx").on(
      table.updatedAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const profileProjects = pgTable(
  "profile_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    description: text("description").notNull(),
    category: varchar("category", { length: 80 }),
    url: text("url"),
    logoUrl: text("logo_url"),
    partnershipRelevance: text("partnership_relevance"),
    fitLabel: varchar("fit_label", { length: 32 }).default("Strong fit").notNull(),
    tone: varchar("tone", { length: 24 }).default("emerald").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isEnabled: boolean("is_enabled").default(true).notNull(),
    ...timestamps,
  },
  (table) => [index("profile_projects_profile_sort_idx").on(table.profileId, table.sortOrder)],
);

export const profileItems = pgTable(
  "profile_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    description: text("description"),
    detail: varchar("detail", { length: 120 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    isEnabled: boolean("is_enabled").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    index("profile_items_profile_kind_sort_idx").on(
      table.profileId,
      table.kind,
      table.sortOrder,
    ),
  ],
);

export const activationCapabilities = pgTable(
  "activation_capabilities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    typeKey: varchar("type_key", { length: 64 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    note: varchar("note", { length: 160 }).notNull(),
    description: text("description"),
    isAvailable: boolean("is_available").default(true).notNull(),
    status: varchar("status", { length: 24 }).default("available").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("activation_capabilities_profile_type_unique").on(
      table.profileId,
      table.typeKey,
    ),
    index("activation_capabilities_profile_sort_idx").on(
      table.profileId,
      table.sortOrder,
    ),
  ],
);

export const agentPublicSettings = pgTable("agent_public_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .unique()
    .references(() => profiles.id, { onDelete: "cascade" }),
  introduction: text("introduction").notNull(),
  agentName: varchar("agent_name", { length: 100 }).default("PartnerBird").notNull(),
  greeting: text("greeting"),
  description: text("description"),
  ...timestamps,
});

export const agentPrivateSettings = pgTable("agent_private_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .unique()
    .references(() => profiles.id, { onDelete: "cascade" }),
  tone: varchar("tone", { length: 100 }).default("Warm, candid, and discerning").notNull(),
  priorities: text("priorities").notNull(),
  thingsToAvoid: text("things_to_avoid").notNull(),
  rejectionRules: text("rejection_rules").notNull(),
  privateEvaluationNotes: text("private_evaluation_notes").notNull(),
  configuration: jsonb("configuration")
    .$type<{
      behavior?: string[];
      philosophy?: string;
      qualificationQuestions?: string[];
      boundaries?: string[];
      fitWeights?: Record<string, number>;
    }>()
    .default({})
    .notNull(),
  configVersion: integer("config_version").default(1).notNull(),
  ...timestamps,
});

export const visitorSessions = pgTable(
  "visitor_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    ipHash: varchar("ip_hash", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("visitor_sessions_token_hash_unique").on(table.tokenHash)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    visitorSessionId: uuid("visitor_session_id")
      .notNull()
      .references(() => visitorSessions.id, { onDelete: "cascade" }),
    state: varchar("state", { length: 40 }).default("INTRO").notNull(),
    mode: varchar("mode", { length: 16 }).default("live").notNull(),
    inboxStatus: varchar("inbox_status", { length: 24 }).default("new").notNull(),
    controlMode: varchar("control_mode", { length: 16 }).default("agent").notNull(),
    ownerLastReadAt: timestamp("owner_last_read_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    visitorMessageCount: integer("visitor_message_count").default(0).notNull(),
    promptVersion: varchar("prompt_version", { length: 32 }).default("v1").notNull(),
    provider: varchar("provider", { length: 40 }).default("mock").notNull(),
    model: varchar("model", { length: 120 }),
    activeTurnKey: varchar("active_turn_key", { length: 100 }),
    activeTurnStartedAt: timestamp("active_turn_started_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [
    index("conversations_session_profile_updated_idx").on(
      table.visitorSessionId,
      table.profileId,
      table.updatedAt,
    ),
    index("conversations_profile_mode_status_activity_idx").on(
      table.profileId,
      table.mode,
      table.inboxStatus,
      table.lastMessageAt,
    ),
    index("conversations_admin_activity_idx").on(
      table.lastMessageAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const conversationContacts = pgTable(
  "conversation_contacts",
  {
    conversationId: uuid("conversation_id")
      .primaryKey()
      .references(() => conversations.id, { onDelete: "cascade" }),
    visitorName: varchar("visitor_name", { length: 120 }).notNull(),
    visitorEmail: varchar("visitor_email", { length: 255 }).notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    authUserId: text("auth_user_id"),
    resumeTokenHash: varchar("resume_token_hash", { length: 64 }).notNull(),
    resumeTokenExpiresAt: timestamp("resume_token_expires_at", {
      withTimezone: true,
    }).notNull(),
    notificationsEnabled: boolean("notifications_enabled").default(true).notNull(),
    lastResumeEmailSentAt: timestamp("last_resume_email_sent_at", {
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("conversation_contacts_resume_token_unique").on(table.resumeTokenHash),
    index("conversation_contacts_email_idx").on(table.visitorEmail),
  ],
);

export const conversationLeads = pgTable(
  "conversation_leads",
  {
    conversationId: uuid("conversation_id")
      .primaryKey()
      .references(() => conversations.id, { onDelete: "cascade" }),
    personName: varchar("person_name", { length: 120 }),
    companyName: varchar("company_name", { length: 180 }),
    companyDescription: text("company_description"),
    initialIntent: text("initial_intent"),
    intakeCompletedAt: timestamp("intake_completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("conversation_leads_completed_idx").on(
      table.intakeCompletedAt,
      table.updatedAt,
    ),
  ],
);

export const visitorBusinesses = pgTable("visitor_businesses", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .notNull()
    .unique()
    .references(() => conversations.id, { onDelete: "cascade" }),
  url: text("url"),
  hostname: varchar("hostname", { length: 255 }),
  name: varchar("name", { length: 180 }),
  summary: text("summary"),
  audience: text("audience"),
  offers: text("offers"),
  wants: text("wants"),
  extractedText: text("extracted_text"),
  contentDigest: varchar("content_digest", { length: 64 }),
  analysisStatus: varchar("analysis_status", { length: 32 }).default("pending").notNull(),
  analysisError: varchar("analysis_error", { length: 200 }),
  ...timestamps,
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    authorUserId: text("author_user_id"),
    content: text("content").notNull(),
    status: varchar("status", { length: 24 }).default("complete").notNull(),
    model: varchar("model", { length: 120 }),
    clientIdempotencyKey: varchar("client_idempotency_key", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
      table.id,
    ),
    uniqueIndex("messages_conversation_idempotency_unique").on(
      table.conversationId,
      table.clientIdempotencyKey,
    ),
  ],
);

export const fitAssessments = pgTable(
  "fit_assessments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 32 }).notNull(),
    publicRationale: text("public_rationale").notNull(),
    strengths: jsonb("strengths").$type<string[]>().default([]).notNull(),
    concerns: jsonb("concerns").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("fit_assessments_conversation_created_idx").on(table.conversationId, table.createdAt)],
);

export const partnershipIdeas = pgTable(
  "partnership_ideas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    assessmentId: uuid("assessment_id").references(() => fitAssessments.id, {
      onDelete: "set null",
    }),
    fitLabel: varchar("fit_label", { length: 32 }).notNull(),
    type: varchar("type", { length: 120 }).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    whyItWorks: text("why_it_works").notNull(),
    ownerContribution: text("owner_contribution").notNull(),
    visitorContribution: text("visitor_contribution").notNull(),
    mutualValue: text("mutual_value").notNull(),
    activation: varchar("activation", { length: 180 }).notNull(),
    status: varchar("status", { length: 24 }).default("suggested").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [index("partnership_ideas_conversation_sort_idx").on(table.conversationId, table.sortOrder)],
);

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    ideaId: uuid("idea_id").references(() => partnershipIdeas.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    concept: text("concept").notNull(),
    possibleActivation: text("possible_activation").notNull(),
    ownerContribution: text("owner_contribution").notNull(),
    visitorContribution: text("visitor_contribution").notNull(),
    assessment: text("assessment").notNull(),
    visitorName: varchar("visitor_name", { length: 120 }),
    visitorEmail: varchar("visitor_email", { length: 255 }),
    status: varchar("status", { length: 24 }).default("draft").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("proposals_conversation_idea_unique").on(
      table.conversationId,
      table.ideaId,
    ),
    index("proposals_profile_status_submitted_idx").on(
      table.profileId,
      table.status,
      table.submittedAt,
    ),
  ],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    action: varchar("action", { length: 48 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").default(1).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.keyHash, table.action, table.windowStart] }),
    index("rate_limit_buckets_expiry_idx").on(table.expiresAt),
  ],
);

export const webmcpSettings = pgTable(
  "webmcp_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .unique()
      .references(() => profiles.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(false).notNull(),
    allowPublicProfileRead: boolean("allow_public_profile_read").default(false).notNull(),
    allowDiscovery: boolean("allow_discovery").default(false).notNull(),
    allowMatching: boolean("allow_matching").default(false).notNull(),
    allowSavePartners: boolean("allow_save_partners").default(false).notNull(),
    allowCreateDrafts: boolean("allow_create_drafts").default(false).notNull(),
    allowSubmitRequests: boolean("allow_submit_requests").default(false).notNull(),
    allowIncomingRequests: boolean("allow_incoming_requests").default(false).notNull(),
    requireVerifiedEmail: boolean("require_verified_email").default(true).notNull(),
    requireCompleteProfile: boolean("require_complete_profile").default(true).notNull(),
    interestMatchMode: varchar("interest_match_mode", { length: 16 }).default("prefer").notNull(),
    inboundStrictness: varchar("inbound_strictness", { length: 16 }).default("strict").notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "webmcp_settings_interest_match_check",
      sql`${table.interestMatchMode} IN ('off', 'prefer', 'require')`,
    ),
    check(
      "webmcp_settings_strictness_check",
      sql`${table.inboundStrictness} IN ('standard', 'strict', 'very_strict')`,
    ),
  ],
);

export const webmcpAgentHandoffs = pgTable(
  "webmcp_agent_handoffs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    creatorProfileId: uuid("creator_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    targetProfileId: uuid("target_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).default("pending").notNull(),
    personName: varchar("person_name", { length: 120 }).notNull(),
    companyName: varchar("company_name", { length: 180 }).notNull(),
    companyDescription: text("company_description").notNull(),
    partnershipGoal: text("partnership_goal").notNull(),
    contextSummary: text("context_summary"),
    conversationId: uuid("conversation_id")
      .unique()
      .references(() => conversations.id, { onDelete: "set null" }),
    activatedByUserId: text("activated_by_user_id"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("webmcp_agent_handoffs_token_hash_unique").on(table.tokenHash),
    index("webmcp_agent_handoffs_creator_created_idx").on(
      table.creatorProfileId,
      table.createdAt.desc(),
    ),
    index("webmcp_agent_handoffs_target_expiry_idx").on(
      table.targetProfileId,
      table.expiresAt,
    ),
    check(
      "webmcp_agent_handoffs_status_check",
      sql`${table.status} IN ('pending', 'activated', 'expired')`,
    ),
    check(
      "webmcp_agent_handoffs_not_self_check",
      sql`${table.creatorProfileId} <> ${table.targetProfileId}`,
    ),
  ],
);

export const webmcpSavedPartners = pgTable(
  "webmcp_saved_partners",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    partnerProfileId: uuid("partner_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 24 }).default("webmcp").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("webmcp_saved_partners_pair_unique").on(
      table.profileId,
      table.partnerProfileId,
    ),
    index("webmcp_saved_partners_profile_created_idx").on(
      table.profileId,
      table.createdAt,
    ),
    check("webmcp_saved_partners_not_self_check", sql`${table.profileId} <> ${table.partnerProfileId}`),
  ],
);

export const webmcpPartnershipRequests = pgTable(
  "webmcp_partnership_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    senderProfileId: uuid("sender_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    recipientProfileId: uuid("recipient_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    status: varchar("status", { length: 24 }).default("draft").notNull(),
    submitIdempotencyKey: varchar("submit_idempotency_key", { length: 100 }),
    responseIdempotencyKey: varchar("response_idempotency_key", { length: 100 }),
    withdrawIdempotencyKey: varchar("withdraw_idempotency_key", { length: 100 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("webmcp_requests_sender_updated_idx").on(
      table.senderProfileId,
      table.updatedAt,
    ),
    index("webmcp_requests_recipient_updated_idx").on(
      table.recipientProfileId,
      table.updatedAt,
    ),
    uniqueIndex("webmcp_requests_sender_submit_key_unique").on(
      table.senderProfileId,
      table.submitIdempotencyKey,
    ),
    uniqueIndex("webmcp_requests_recipient_response_key_unique").on(
      table.recipientProfileId,
      table.responseIdempotencyKey,
    ),
    uniqueIndex("webmcp_requests_sender_withdraw_key_unique").on(
      table.senderProfileId,
      table.withdrawIdempotencyKey,
    ),
    uniqueIndex("webmcp_requests_active_pair_unique")
      .on(table.senderProfileId, table.recipientProfileId)
      .where(sql`${table.status} = 'submitted'`),
    check("webmcp_requests_not_self_check", sql`${table.senderProfileId} <> ${table.recipientProfileId}`),
    check(
      "webmcp_requests_status_check",
      sql`${table.status} IN ('draft', 'submitted', 'accepted', 'declined', 'withdrawn')`,
    ),
  ],
);

export const webmcpActionConfirmations = pgTable(
  "webmcp_action_confirmations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    toolName: varchar("tool_name", { length: 48 }).notNull(),
    inputHash: varchar("input_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("webmcp_confirmations_profile_expiry_idx").on(table.profileId, table.expiresAt),
    check(
      "webmcp_confirmations_tool_check",
      sql`${table.toolName} IN ('submit_request', 'withdraw_request', 'respond_to_request')`,
    ),
  ],
);

export const webmcpBlocks = pgTable(
  "webmcp_blocks",
  {
    blockerProfileId: uuid("blocker_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    blockedProfileId: uuid("blocked_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.blockerProfileId, table.blockedProfileId] }),
    index("webmcp_blocks_blocked_idx").on(table.blockedProfileId),
    check("webmcp_blocks_not_self_check", sql`${table.blockerProfileId} <> ${table.blockedProfileId}`),
  ],
);

export const webmcpActivityEvents = pgTable(
  "webmcp_activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorProfileId: uuid("actor_profile_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    subjectProfileId: uuid("subject_profile_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 64 }).notNull(),
    outcome: varchar("outcome", { length: 16 }).notNull(),
    failureCategory: varchar("failure_category", { length: 64 }),
    resourceRef: varchar("resource_ref", { length: 100 }),
    idempotencyRef: varchar("idempotency_ref", { length: 100 }),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("webmcp_activity_actor_created_idx").on(
      table.actorProfileId,
      table.createdAt,
    ),
    index("webmcp_activity_subject_created_idx").on(
      table.subjectProfileId,
      table.createdAt,
    ),
    check("webmcp_activity_outcome_check", sql`${table.outcome} IN ('success', 'failed')`),
  ],
);

export const profileSections = pgTable(
  "profile_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 48 }).notNull(),
    isEnabled: boolean("is_enabled").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("profile_sections_profile_key_unique").on(table.profileId, table.key),
    index("profile_sections_profile_sort_idx").on(table.profileId, table.sortOrder),
  ],
);

export const appearanceSettings = pgTable("appearance_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .unique()
    .references(() => profiles.id, { onDelete: "cascade" }),
  accentPreset: varchar("accent_preset", { length: 32 }).default("forest").notNull(),
  primaryColor: varchar("primary_color", { length: 7 }),
  surfacePreset: varchar("surface_preset", { length: 32 }).default("clean").notNull(),
  cardPreset: varchar("card_preset", { length: 32 }).default("soft").notNull(),
  density: varchar("density", { length: 24 }).default("comfortable").notNull(),
  ...timestamps,
});

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    url: text("url"),
    visibility: varchar("visibility", { length: 24 }).default("agent_only").notNull(),
    state: varchar("state", { length: 24 }).default("active").notNull(),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    analysisStatus: varchar("analysis_status", { length: 24 }).default("idle").notNull(),
    analysisSummary: text("analysis_summary"),
    contentDigest: varchar("content_digest", { length: 64 }),
    lastAnalyzedAt: timestamp("last_analyzed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("knowledge_items_profile_state_sort_idx").on(
      table.profileId,
      table.state,
      table.sortOrder,
    ),
  ],
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .unique()
      .references(() => conversations.id, { onDelete: "cascade" }),
    primaryIdeaId: uuid("primary_idea_id").references(() => partnershipIdeas.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    fitLabel: varchar("fit_label", { length: 32 }).notNull(),
    partnershipType: varchar("partnership_type", { length: 120 }).notNull(),
    status: varchar("status", { length: 24 }).default("new").notNull(),
    potentialActivation: varchar("potential_activation", { length: 180 }),
    kivAt: timestamp("kiv_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [
    index("opportunities_profile_status_activity_idx").on(
      table.profileId,
      table.status,
      table.lastActivityAt,
      table.id,
    ),
    index("opportunities_admin_activity_idx").on(
      table.lastActivityAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const ownerNotes = pgTable(
  "owner_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull(),
    body: text("body").notNull(),
    ...timestamps,
  },
  (table) => [index("owner_notes_opportunity_created_idx").on(table.opportunityId, table.createdAt)],
);

export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, {
      onDelete: "set null",
    }),
    sourceIdeaId: uuid("source_idea_id").references(() => partnershipIdeas.id, {
      onDelete: "set null",
    }),
    type: varchar("type", { length: 120 }).notNull(),
    title: text("title").notNull(),
    concept: text("concept").notNull(),
    stage: varchar("stage", { length: 24 }).default("idea").notNull(),
    draftBody: text("draft_body"),
    ...timestamps,
  },
  (table) => [
    index("content_items_profile_stage_updated_idx").on(
      table.profileId,
      table.stage,
      table.updatedAt,
    ),
    index("content_items_admin_updated_idx").on(
      table.updatedAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const activationRecords = pgTable(
  "activation_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, {
      onDelete: "set null",
    }),
    typeKey: varchar("type_key", { length: 64 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    status: varchar("status", { length: 24 }).default("planned").notNull(),
    config: jsonb("config").$type<Record<string, string>>().default({}).notNull(),
    ...timestamps,
  },
  (table) => [
    index("activation_records_profile_status_updated_idx").on(
      table.profileId,
      table.status,
      table.updatedAt,
    ),
    index("activation_records_admin_updated_idx").on(
      table.updatedAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 48 }).notNull(),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, {
      onDelete: "set null",
    }),
    idempotencyKey: varchar("idempotency_key", { length: 100 }),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean>>().default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("analytics_events_profile_type_occurred_idx").on(
      table.profileId,
      table.eventType,
      table.occurredAt,
    ),
    uniqueIndex("analytics_events_profile_idempotency_unique").on(
      table.profileId,
      table.idempotencyKey,
    ),
  ],
);

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    planKey: varchar("plan_key", { length: 24 }).notNull(),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).notNull(),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
    stripePriceId: varchar("stripe_price_id", { length: 255 }),
    billingInterval: varchar("billing_interval", { length: 24 }),
    status: varchar("status", { length: 40 }).notNull(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    livemode: boolean("livemode").default(false).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("billing_subscriptions_profile_unique").on(table.profileId),
    uniqueIndex("billing_subscriptions_customer_unique").on(table.stripeCustomerId),
    uniqueIndex("billing_subscriptions_subscription_unique").on(
      table.stripeSubscriptionId,
    ),
    index("billing_subscriptions_status_period_idx").on(
      table.status,
      table.currentPeriodEnd,
    ),
    check(
      "billing_subscriptions_plan_check",
      sql`${table.planKey} IN ('pro', 'business')`,
    ),
    check(
      "billing_subscriptions_interval_check",
      sql`${table.billingInterval} IS NULL OR ${table.billingInterval} IN ('monthly', 'annual')`,
    ),
  ],
);

export const usagePeriods = pgTable(
  "usage_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 24 }).notNull(),
    periodType: varchar("period_type", { length: 24 }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    aiConversations: integer("ai_conversations").default(0).notNull(),
    aiReplies: integer("ai_replies").default(0).notNull(),
    websiteAnalyses: integer("website_analyses").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("usage_periods_profile_scope_period_unique").on(
      table.profileId,
      table.scope,
      table.periodType,
      table.periodStart,
    ),
    index("usage_periods_profile_scope_end_idx").on(
      table.profileId,
      table.scope,
      table.periodEnd,
    ),
    check(
      "usage_periods_scope_check",
      sql`${table.scope} IN ('public', 'test', 'demo')`,
    ),
    check(
      "usage_periods_type_check",
      sql`${table.periodType} IN ('daily', 'monthly')`,
    ),
    check(
      "usage_periods_nonnegative_check",
      sql`${table.aiConversations} >= 0 AND ${table.aiReplies} >= 0 AND ${table.websiteAnalyses} >= 0`,
    ),
  ],
);

export const conversationUsage = pgTable("conversation_usage", {
  conversationId: uuid("conversation_id")
    .primaryKey()
    .references(() => conversations.id, { onDelete: "cascade" }),
  conversationCounted: boolean("conversation_counted").default(false).notNull(),
  aiReplyCount: integer("ai_reply_count").default(0).notNull(),
  websiteAnalysisCount: integer("website_analysis_count").default(0).notNull(),
  ...timestamps,
});

export const usageReservations = pgTable(
  "usage_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    scope: varchar("scope", { length: 24 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull(),
    monthlyPeriodStart: timestamp("monthly_period_start", {
      withTimezone: true,
    }).notNull(),
    dailyPeriodStart: timestamp("daily_period_start", {
      withTimezone: true,
    }).notNull(),
    countedConversation: boolean("counted_conversation").default(false).notNull(),
    countedReply: boolean("counted_reply").default(false).notNull(),
    countedWebsiteAnalysis: boolean("counted_website_analysis")
      .default(false)
      .notNull(),
    status: varchar("status", { length: 24 }).default("reserved").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("usage_reservations_profile_scope_key_unique").on(
      table.profileId,
      table.scope,
      table.idempotencyKey,
    ),
    index("usage_reservations_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    check(
      "usage_reservations_scope_check",
      sql`${table.scope} IN ('public', 'test', 'demo')`,
    ),
    check(
      "usage_reservations_status_check",
      sql`${table.status} IN ('reserved', 'completed', 'released')`,
    ),
  ],
);

export const stripeEvents = pgTable(
  "stripe_events",
  {
    stripeEventId: varchar("stripe_event_id", { length: 255 }).primaryKey(),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    status: varchar("status", { length: 24 }).default("processing").notNull(),
    livemode: boolean("livemode").default(false).notNull(),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lastError: varchar("last_error", { length: 240 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("stripe_events_status_started_idx").on(
      table.status,
      table.processingStartedAt,
    ),
    check(
      "stripe_events_status_check",
      sql`${table.status} IN ('processing', 'processed', 'failed')`,
    ),
  ],
);

export const cmsPages = pgTable(
  "cms_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 24 }).default("draft").notNull(),
    publishedRevisionId: uuid("published_revision_id").references(
      (): AnyPgColumn => cmsPageRevisions.id,
      { onDelete: "set null" },
    ),
    createdByUserId: text("created_by_user_id").notNull(),
    updatedByUserId: text("updated_by_user_id").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("cms_pages_slug_unique").on(table.slug),
    index("cms_pages_status_updated_idx").on(table.status, table.updatedAt, table.id),
    check(
      "cms_pages_status_check",
      sql`${table.status} IN ('draft', 'published', 'archived')`,
    ),
  ],
);

export const cmsPageRevisions = pgTable(
  "cms_page_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => cmsPages.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    status: varchar("status", { length: 24 }).default("draft").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().default({}).notNull(),
    changeNote: text("change_note"),
    createdByUserId: text("created_by_user_id").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cms_page_revisions_page_number_unique").on(
      table.pageId,
      table.revisionNumber,
    ),
    index("cms_page_revisions_page_status_created_idx").on(
      table.pageId,
      table.status,
      table.createdAt,
      table.id,
    ),
    check(
      "cms_page_revisions_number_check",
      sql`${table.revisionNumber} > 0`,
    ),
    check(
      "cms_page_revisions_status_check",
      sql`${table.status} IN ('draft', 'published', 'superseded')`,
    ),
  ],
);

export const agentModelConfigurations = pgTable("agent_model_configurations", {
  id: varchar("id", { length: 32 }).primaryKey(),
  configuration: jsonb("configuration")
    .$type<{
      schemaVersion: 1;
      primaryModels: Record<
        "free" | "pro" | "business",
        { modelId: string; name: string; description: string }
      >;
      fallbackModels: Array<{
        modelId: string;
        name: string;
        description: string;
        enabled: boolean;
      }>;
    }>()
    .default({
      schemaVersion: 1,
      primaryModels: {
        free: { modelId: "minimax/minimax-m3:free", name: "MiniMax M3", description: "" },
        pro: { modelId: "minimax/minimax-m3:free", name: "MiniMax M3", description: "" },
        business: { modelId: "minimax/minimax-m3:free", name: "MiniMax M3", description: "" },
      },
      fallbackModels: [],
    })
    .notNull(),
  configVersion: integer("config_version").default(1).notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  ...timestamps,
});

export const adminAuditEvents = pgTable(
  "admin_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: text("actor_user_id").notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    resourceType: varchar("resource_type", { length: 48 }).notNull(),
    targetIds: jsonb("target_ids").$type<string[]>().default([]).notNull(),
    reason: text("reason"),
    outcome: varchar("outcome", { length: 24 }).notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().default({}).notNull(),
    requestId: varchar("request_id", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("admin_audit_events_request_id_unique").on(table.requestId),
    index("admin_audit_events_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
      table.id,
    ),
    index("admin_audit_events_resource_created_idx").on(
      table.resourceType,
      table.createdAt,
      table.id,
    ),
    check(
      "admin_audit_events_outcome_check",
      sql`${table.outcome} IN ('success', 'partial', 'failed')`,
    ),
  ],
);
