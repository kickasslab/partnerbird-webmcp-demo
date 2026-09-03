CREATE TABLE "activation_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"type_key" varchar(64) NOT NULL,
	"label" varchar(160) NOT NULL,
	"note" varchar(160) NOT NULL,
	"description" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_private_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"tone" varchar(100) DEFAULT 'Warm, candid, and discerning' NOT NULL,
	"priorities" text NOT NULL,
	"things_to_avoid" text NOT NULL,
	"rejection_rules" text NOT NULL,
	"private_evaluation_notes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_private_settings_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE "agent_public_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"introduction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_public_settings_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"visitor_session_id" uuid NOT NULL,
	"state" varchar(40) DEFAULT 'INTRO' NOT NULL,
	"visitor_message_count" integer DEFAULT 0 NOT NULL,
	"prompt_version" varchar(32) DEFAULT 'v1' NOT NULL,
	"provider" varchar(40) DEFAULT 'mock' NOT NULL,
	"model" varchar(120),
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fit_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"label" varchar(32) NOT NULL,
	"public_rationale" text NOT NULL,
	"strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"concerns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"status" varchar(24) DEFAULT 'complete' NOT NULL,
	"model" varchar(120),
	"client_idempotency_key" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partnership_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"assessment_id" uuid,
	"fit_label" varchar(32) NOT NULL,
	"type" varchar(120) NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"why_it_works" text NOT NULL,
	"owner_contribution" text NOT NULL,
	"visitor_contribution" text NOT NULL,
	"mutual_value" text NOT NULL,
	"activation" varchar(180) NOT NULL,
	"status" varchar(24) DEFAULT 'suggested' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"label" varchar(160) NOT NULL,
	"description" text,
	"detail" varchar(120),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" varchar(140) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(80),
	"url" text,
	"logo_url" text,
	"partnership_relevance" text,
	"fit_label" varchar(32) DEFAULT 'Strong fit' NOT NULL,
	"tone" varchar(24) DEFAULT 'emerald' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text,
	"handle" varchar(48) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"headline" varchar(180) NOT NULL,
	"bio" text NOT NULL,
	"avatar_url" text,
	"website_url" text,
	"social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"idea_id" uuid,
	"title" text NOT NULL,
	"concept" text NOT NULL,
	"possible_activation" text NOT NULL,
	"owner_contribution" text NOT NULL,
	"visitor_contribution" text NOT NULL,
	"assessment" text NOT NULL,
	"visitor_name" varchar(120),
	"visitor_email" varchar(255),
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key_hash" varchar(64) NOT NULL,
	"action" varchar(48) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_buckets_key_hash_action_window_start_pk" PRIMARY KEY("key_hash","action","window_start")
);
--> statement-breakpoint
CREATE TABLE "visitor_businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"url" text,
	"hostname" varchar(255),
	"name" varchar(180),
	"summary" text,
	"audience" text,
	"offers" text,
	"wants" text,
	"extracted_text" text,
	"content_digest" varchar(64),
	"analysis_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"analysis_error" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visitor_businesses_conversation_id_unique" UNIQUE("conversation_id")
);
--> statement-breakpoint
CREATE TABLE "visitor_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"ip_hash" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activation_capabilities" ADD CONSTRAINT "activation_capabilities_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_private_settings" ADD CONSTRAINT "agent_private_settings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_public_settings" ADD CONSTRAINT "agent_public_settings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_visitor_session_id_visitor_sessions_id_fk" FOREIGN KEY ("visitor_session_id") REFERENCES "public"."visitor_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fit_assessments" ADD CONSTRAINT "fit_assessments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnership_ideas" ADD CONSTRAINT "partnership_ideas_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnership_ideas" ADD CONSTRAINT "partnership_ideas_assessment_id_fit_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."fit_assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_items" ADD CONSTRAINT "profile_items_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_projects" ADD CONSTRAINT "profile_projects_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_idea_id_partnership_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."partnership_ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_businesses" ADD CONSTRAINT "visitor_businesses_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activation_capabilities_profile_type_unique" ON "activation_capabilities" USING btree ("profile_id","type_key");--> statement-breakpoint
CREATE INDEX "activation_capabilities_profile_sort_idx" ON "activation_capabilities" USING btree ("profile_id","sort_order");--> statement-breakpoint
CREATE INDEX "conversations_session_profile_updated_idx" ON "conversations" USING btree ("visitor_session_id","profile_id","updated_at");--> statement-breakpoint
CREATE INDEX "fit_assessments_conversation_created_idx" ON "fit_assessments" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conversation_idempotency_unique" ON "messages" USING btree ("conversation_id","client_idempotency_key");--> statement-breakpoint
CREATE INDEX "partnership_ideas_conversation_sort_idx" ON "partnership_ideas" USING btree ("conversation_id","sort_order");--> statement-breakpoint
CREATE INDEX "profile_items_profile_kind_sort_idx" ON "profile_items" USING btree ("profile_id","kind","sort_order");--> statement-breakpoint
CREATE INDEX "profile_projects_profile_sort_idx" ON "profile_projects" USING btree ("profile_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_handle_unique" ON "profiles" USING btree ("handle");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_owner_user_id_unique" ON "profiles" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "proposals_profile_status_submitted_idx" ON "proposals" USING btree ("profile_id","status","submitted_at");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expiry_idx" ON "rate_limit_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "visitor_sessions_token_hash_unique" ON "visitor_sessions" USING btree ("token_hash");