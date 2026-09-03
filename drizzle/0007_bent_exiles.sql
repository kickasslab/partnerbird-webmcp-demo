CREATE TABLE "admin_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" varchar(64) NOT NULL,
	"resource_type" varchar(48) NOT NULL,
	"target_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text,
	"outcome" varchar(24) NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_events_outcome_check" CHECK ("admin_audit_events"."outcome" IN ('success', 'partial', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "cms_page_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"change_note" text,
	"created_by_user_id" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_page_revisions_number_check" CHECK ("cms_page_revisions"."revision_number" > 0),
	CONSTRAINT "cms_page_revisions_status_check" CHECK ("cms_page_revisions"."status" IN ('draft', 'published', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "cms_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(120) NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"published_revision_id" uuid,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_pages_status_check" CHECK ("cms_pages"."status" IN ('draft', 'published', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "cms_page_revisions" ADD CONSTRAINT "cms_page_revisions_page_id_cms_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."cms_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_pages" ADD CONSTRAINT "cms_pages_published_revision_id_cms_page_revisions_id_fk" FOREIGN KEY ("published_revision_id") REFERENCES "public"."cms_page_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_audit_events_request_id_unique" ON "admin_audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "admin_audit_events_actor_created_idx" ON "admin_audit_events" USING btree ("actor_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "admin_audit_events_resource_created_idx" ON "admin_audit_events" USING btree ("resource_type","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_page_revisions_page_number_unique" ON "cms_page_revisions" USING btree ("page_id","revision_number");--> statement-breakpoint
CREATE INDEX "cms_page_revisions_page_status_created_idx" ON "cms_page_revisions" USING btree ("page_id","status","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_pages_slug_unique" ON "cms_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cms_pages_status_updated_idx" ON "cms_pages" USING btree ("status","updated_at","id");--> statement-breakpoint
CREATE INDEX "activation_records_admin_updated_idx" ON "activation_records" USING btree ("updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "content_items_admin_updated_idx" ON "content_items" USING btree ("updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conversations_admin_activity_idx" ON "conversations" USING btree ("last_message_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "opportunities_admin_activity_idx" ON "opportunities" USING btree ("last_activity_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "profiles_admin_updated_idx" ON "profiles" USING btree ("updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);