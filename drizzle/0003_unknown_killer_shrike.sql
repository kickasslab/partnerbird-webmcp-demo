CREATE TABLE "activation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"type_key" varchar(64) NOT NULL,
	"title" varchar(180) NOT NULL,
	"status" varchar(24) DEFAULT 'planned' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"event_type" varchar(48) NOT NULL,
	"conversation_id" uuid,
	"opportunity_id" uuid,
	"idempotency_key" varchar(100),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appearance_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"accent_preset" varchar(32) DEFAULT 'forest' NOT NULL,
	"surface_preset" varchar(32) DEFAULT 'clean' NOT NULL,
	"card_preset" varchar(32) DEFAULT 'soft' NOT NULL,
	"density" varchar(24) DEFAULT 'comfortable' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appearance_settings_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"source_idea_id" uuid,
	"type" varchar(120) NOT NULL,
	"title" text NOT NULL,
	"concept" text NOT NULL,
	"stage" varchar(24) DEFAULT 'idea' NOT NULL,
	"draft_body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text NOT NULL,
	"url" text,
	"visibility" varchar(24) DEFAULT 'agent_only' NOT NULL,
	"state" varchar(24) DEFAULT 'active' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"analysis_status" varchar(24) DEFAULT 'idle' NOT NULL,
	"analysis_summary" text,
	"content_digest" varchar(64),
	"last_analyzed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"primary_idea_id" uuid,
	"title" text NOT NULL,
	"fit_label" varchar(32) NOT NULL,
	"partnership_type" varchar(120) NOT NULL,
	"status" varchar(24) DEFAULT 'new' NOT NULL,
	"potential_activation" varchar(180),
	"kiv_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_conversation_id_unique" UNIQUE("conversation_id")
);
--> statement-breakpoint
CREATE TABLE "owner_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"key" varchar(48) NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activation_capabilities" ADD COLUMN "status" varchar(24) DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_private_settings" ADD COLUMN "configuration" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_private_settings" ADD COLUMN "config_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_public_settings" ADD COLUMN "agent_name" varchar(100) DEFAULT 'PartnerBird' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_public_settings" ADD COLUMN "greeting" text;--> statement-breakpoint
ALTER TABLE "agent_public_settings" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "mode" varchar(16) DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "inbox_status" varchar(24) DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "control_mode" varchar(16) DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "owner_last_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "author_user_id" text;--> statement-breakpoint
ALTER TABLE "profile_items" ADD COLUMN "is_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_projects" ADD COLUMN "is_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "location" varchar(160);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "partnership_status" varchar(24) DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "show_public_metrics" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "lock_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "activation_records" ADD CONSTRAINT "activation_records_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_records" ADD CONSTRAINT "activation_records_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appearance_settings" ADD CONSTRAINT "appearance_settings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_source_idea_id_partnership_ideas_id_fk" FOREIGN KEY ("source_idea_id") REFERENCES "public"."partnership_ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_primary_idea_id_partnership_ideas_id_fk" FOREIGN KEY ("primary_idea_id") REFERENCES "public"."partnership_ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_notes" ADD CONSTRAINT "owner_notes_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_sections" ADD CONSTRAINT "profile_sections_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activation_records_profile_status_updated_idx" ON "activation_records" USING btree ("profile_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "analytics_events_profile_type_occurred_idx" ON "analytics_events" USING btree ("profile_id","event_type","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_events_profile_idempotency_unique" ON "analytics_events" USING btree ("profile_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "content_items_profile_stage_updated_idx" ON "content_items" USING btree ("profile_id","stage","updated_at");--> statement-breakpoint
CREATE INDEX "knowledge_items_profile_state_sort_idx" ON "knowledge_items" USING btree ("profile_id","state","sort_order");--> statement-breakpoint
CREATE INDEX "opportunities_profile_status_activity_idx" ON "opportunities" USING btree ("profile_id","status","last_activity_at","id");--> statement-breakpoint
CREATE INDEX "owner_notes_opportunity_created_idx" ON "owner_notes" USING btree ("opportunity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_sections_profile_key_unique" ON "profile_sections" USING btree ("profile_id","key");--> statement-breakpoint
CREATE INDEX "profile_sections_profile_sort_idx" ON "profile_sections" USING btree ("profile_id","sort_order");--> statement-breakpoint
CREATE INDEX "conversations_profile_mode_status_activity_idx" ON "conversations" USING btree ("profile_id","mode","inbox_status","last_message_at");
--> statement-breakpoint
UPDATE "conversations" AS conversation
SET "mode" = 'demo',
    "expires_at" = COALESCE(conversation."expires_at", conversation."created_at" + interval '24 hours')
FROM "profiles" AS profile
WHERE conversation."profile_id" = profile."id"
  AND profile."is_demo" = true;
--> statement-breakpoint
INSERT INTO "profile_sections" ("profile_id", "key", "is_enabled", "sort_order")
SELECT profile."id", section."key", true, section."sort_order"
FROM "profiles" AS profile
CROSS JOIN (VALUES
  ('about', 0),
  ('interests', 1),
  ('capabilities', 2),
  ('projects', 3),
  ('guidelines', 4),
  ('activations', 5),
  ('collaborations', 6),
  ('metrics', 7)
) AS section("key", "sort_order")
ON CONFLICT ("profile_id", "key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "appearance_settings" ("profile_id")
SELECT "id" FROM "profiles"
ON CONFLICT ("profile_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "knowledge_items" (
  "profile_id", "type", "title", "description", "url", "visibility",
  "state", "tags", "sort_order", "analysis_status", "created_at", "updated_at"
)
SELECT project."profile_id", 'project', project."name", project."description",
       project."url", 'public', 'active', '[]'::jsonb, project."sort_order",
       'idle', project."created_at", project."updated_at"
FROM "profile_projects" AS project
WHERE project."is_enabled" = true;
--> statement-breakpoint
INSERT INTO "opportunities" (
  "profile_id", "conversation_id", "primary_idea_id", "title", "fit_label",
  "partnership_type", "status", "potential_activation", "last_activity_at",
  "created_at", "updated_at"
)
SELECT proposal."profile_id", proposal."conversation_id", proposal."idea_id",
       proposal."title", COALESCE(idea."fit_label", 'Worth Exploring'),
       COALESCE(idea."type", 'Partnership proposal'), 'new',
       proposal."possible_activation", COALESCE(proposal."submitted_at", proposal."updated_at"),
       proposal."created_at", proposal."updated_at"
FROM "proposals" AS proposal
JOIN "conversations" AS conversation ON conversation."id" = proposal."conversation_id"
LEFT JOIN "partnership_ideas" AS idea ON idea."id" = proposal."idea_id"
WHERE proposal."status" = 'submitted'
  AND conversation."mode" = 'live'
ON CONFLICT ("conversation_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_partnership_status_check"
  CHECK ("partnership_status" IN ('open', 'selective', 'unavailable')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "profiles" VALIDATE CONSTRAINT "profiles_partnership_status_check";
--> statement-breakpoint
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_mode_check"
  CHECK ("mode" IN ('live', 'demo', 'test')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "conversations" VALIDATE CONSTRAINT "conversations_mode_check";
--> statement-breakpoint
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_control_mode_check"
  CHECK ("control_mode" IN ('agent', 'owner')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "conversations" VALIDATE CONSTRAINT "conversations_control_mode_check";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION partnerbird_require_live_pipeline_record()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  conversation_profile uuid;
  conversation_mode varchar(16);
BEGIN
  SELECT "profile_id", "mode"
    INTO conversation_profile, conversation_mode
  FROM "conversations"
  WHERE "id" = NEW."conversation_id";

  IF conversation_profile IS NULL OR conversation_profile <> NEW."profile_id" THEN
    RAISE EXCEPTION 'Pipeline record profile does not match conversation profile';
  END IF;
  IF conversation_mode <> 'live' THEN
    RAISE EXCEPTION 'Demo and test conversations cannot enter the live pipeline';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "proposals_live_conversation_only"
BEFORE INSERT OR UPDATE OF "profile_id", "conversation_id" ON "proposals"
FOR EACH ROW EXECUTE FUNCTION partnerbird_require_live_pipeline_record();
--> statement-breakpoint
CREATE TRIGGER "opportunities_live_conversation_only"
BEFORE INSERT OR UPDATE OF "profile_id", "conversation_id" ON "opportunities"
FOR EACH ROW EXECUTE FUNCTION partnerbird_require_live_pipeline_record();
