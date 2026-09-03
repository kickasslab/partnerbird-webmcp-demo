CREATE TABLE "webmcp_activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_profile_id" uuid,
	"subject_profile_id" uuid,
	"action" varchar(64) NOT NULL,
	"outcome" varchar(16) NOT NULL,
	"failure_category" varchar(64),
	"resource_ref" varchar(100),
	"idempotency_ref" varchar(100),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webmcp_activity_outcome_check" CHECK ("webmcp_activity_events"."outcome" IN ('success', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "webmcp_blocks" (
	"blocker_profile_id" uuid NOT NULL,
	"blocked_profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webmcp_blocks_blocker_profile_id_blocked_profile_id_pk" PRIMARY KEY("blocker_profile_id","blocked_profile_id"),
	CONSTRAINT "webmcp_blocks_not_self_check" CHECK ("webmcp_blocks"."blocker_profile_id" <> "webmcp_blocks"."blocked_profile_id")
);
--> statement-breakpoint
CREATE TABLE "webmcp_partnership_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_profile_id" uuid NOT NULL,
	"recipient_profile_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"body" text NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"submit_idempotency_key" varchar(100),
	"response_idempotency_key" varchar(100),
	"submitted_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webmcp_requests_not_self_check" CHECK ("webmcp_partnership_requests"."sender_profile_id" <> "webmcp_partnership_requests"."recipient_profile_id"),
	CONSTRAINT "webmcp_requests_status_check" CHECK ("webmcp_partnership_requests"."status" IN ('draft', 'submitted', 'accepted', 'declined', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "webmcp_saved_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"partner_profile_id" uuid NOT NULL,
	"source" varchar(24) DEFAULT 'webmcp' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webmcp_saved_partners_not_self_check" CHECK ("webmcp_saved_partners"."profile_id" <> "webmcp_saved_partners"."partner_profile_id")
);
--> statement-breakpoint
CREATE TABLE "webmcp_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"allow_public_profile_read" boolean DEFAULT false NOT NULL,
	"allow_discovery" boolean DEFAULT false NOT NULL,
	"allow_matching" boolean DEFAULT false NOT NULL,
	"allow_save_partners" boolean DEFAULT false NOT NULL,
	"allow_create_drafts" boolean DEFAULT false NOT NULL,
	"allow_submit_requests" boolean DEFAULT false NOT NULL,
	"allow_incoming_requests" boolean DEFAULT false NOT NULL,
	"require_verified_email" boolean DEFAULT true NOT NULL,
	"require_complete_profile" boolean DEFAULT true NOT NULL,
	"interest_match_mode" varchar(16) DEFAULT 'prefer' NOT NULL,
	"inbound_strictness" varchar(16) DEFAULT 'strict' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webmcp_settings_profile_id_unique" UNIQUE("profile_id"),
	CONSTRAINT "webmcp_settings_interest_match_check" CHECK ("webmcp_settings"."interest_match_mode" IN ('off', 'prefer', 'require')),
	CONSTRAINT "webmcp_settings_strictness_check" CHECK ("webmcp_settings"."inbound_strictness" IN ('standard', 'strict', 'very_strict'))
);
--> statement-breakpoint
ALTER TABLE "webmcp_activity_events" ADD CONSTRAINT "webmcp_activity_events_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webmcp_activity_events" ADD CONSTRAINT "webmcp_activity_events_subject_profile_id_profiles_id_fk" FOREIGN KEY ("subject_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webmcp_blocks" ADD CONSTRAINT "webmcp_blocks_blocker_profile_id_profiles_id_fk" FOREIGN KEY ("blocker_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webmcp_blocks" ADD CONSTRAINT "webmcp_blocks_blocked_profile_id_profiles_id_fk" FOREIGN KEY ("blocked_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webmcp_partnership_requests" ADD CONSTRAINT "webmcp_partnership_requests_sender_profile_id_profiles_id_fk" FOREIGN KEY ("sender_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webmcp_partnership_requests" ADD CONSTRAINT "webmcp_partnership_requests_recipient_profile_id_profiles_id_fk" FOREIGN KEY ("recipient_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webmcp_saved_partners" ADD CONSTRAINT "webmcp_saved_partners_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webmcp_saved_partners" ADD CONSTRAINT "webmcp_saved_partners_partner_profile_id_profiles_id_fk" FOREIGN KEY ("partner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webmcp_settings" ADD CONSTRAINT "webmcp_settings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webmcp_activity_actor_created_idx" ON "webmcp_activity_events" USING btree ("actor_profile_id","created_at");--> statement-breakpoint
CREATE INDEX "webmcp_activity_subject_created_idx" ON "webmcp_activity_events" USING btree ("subject_profile_id","created_at");--> statement-breakpoint
CREATE INDEX "webmcp_blocks_blocked_idx" ON "webmcp_blocks" USING btree ("blocked_profile_id");--> statement-breakpoint
CREATE INDEX "webmcp_requests_sender_updated_idx" ON "webmcp_partnership_requests" USING btree ("sender_profile_id","updated_at");--> statement-breakpoint
CREATE INDEX "webmcp_requests_recipient_updated_idx" ON "webmcp_partnership_requests" USING btree ("recipient_profile_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webmcp_requests_sender_submit_key_unique" ON "webmcp_partnership_requests" USING btree ("sender_profile_id","submit_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "webmcp_requests_recipient_response_key_unique" ON "webmcp_partnership_requests" USING btree ("recipient_profile_id","response_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "webmcp_saved_partners_pair_unique" ON "webmcp_saved_partners" USING btree ("profile_id","partner_profile_id");--> statement-breakpoint
CREATE INDEX "webmcp_saved_partners_profile_created_idx" ON "webmcp_saved_partners" USING btree ("profile_id","created_at");--> statement-breakpoint
INSERT INTO "webmcp_settings" (
  "profile_id", "enabled", "allow_public_profile_read", "allow_discovery",
  "allow_matching", "allow_save_partners", "allow_create_drafts",
  "allow_submit_requests", "allow_incoming_requests", "require_verified_email",
  "require_complete_profile", "interest_match_mode", "inbound_strictness"
)
SELECT
  "id", true, true, true, true, true, true, true, true, true, true, 'prefer', 'strict'
FROM "profiles"
WHERE "handle" = 'darren'
ON CONFLICT ("profile_id") DO UPDATE SET
  "enabled" = EXCLUDED."enabled",
  "allow_public_profile_read" = EXCLUDED."allow_public_profile_read",
  "allow_discovery" = EXCLUDED."allow_discovery",
  "allow_matching" = EXCLUDED."allow_matching",
  "allow_save_partners" = EXCLUDED."allow_save_partners",
  "allow_create_drafts" = EXCLUDED."allow_create_drafts",
  "allow_submit_requests" = EXCLUDED."allow_submit_requests",
  "allow_incoming_requests" = EXCLUDED."allow_incoming_requests",
  "updated_at" = now();
