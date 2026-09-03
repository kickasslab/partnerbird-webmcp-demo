CREATE TABLE "billing_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"plan_key" varchar(24) NOT NULL,
	"stripe_customer_id" varchar(255) NOT NULL,
	"stripe_subscription_id" varchar(255),
	"stripe_price_id" varchar(255),
	"billing_interval" varchar(24),
	"status" varchar(40) NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"livemode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_subscriptions_plan_check" CHECK ("billing_subscriptions"."plan_key" IN ('pro', 'business')),
	CONSTRAINT "billing_subscriptions_interval_check" CHECK ("billing_subscriptions"."billing_interval" IS NULL OR "billing_subscriptions"."billing_interval" IN ('monthly', 'annual'))
);
--> statement-breakpoint
CREATE TABLE "conversation_usage" (
	"conversation_id" uuid PRIMARY KEY NOT NULL,
	"conversation_counted" boolean DEFAULT false NOT NULL,
	"ai_reply_count" integer DEFAULT 0 NOT NULL,
	"website_analysis_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"stripe_event_id" varchar(255) PRIMARY KEY NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"status" varchar(24) DEFAULT 'processing' NOT NULL,
	"livemode" boolean DEFAULT false NOT NULL,
	"processing_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"last_error" varchar(240),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_events_status_check" CHECK ("stripe_events"."status" IN ('processing', 'processed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "usage_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"scope" varchar(24) NOT NULL,
	"period_type" varchar(24) NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"ai_conversations" integer DEFAULT 0 NOT NULL,
	"ai_replies" integer DEFAULT 0 NOT NULL,
	"website_analyses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_periods_scope_check" CHECK ("usage_periods"."scope" IN ('public', 'test', 'demo')),
	CONSTRAINT "usage_periods_type_check" CHECK ("usage_periods"."period_type" IN ('daily', 'monthly')),
	CONSTRAINT "usage_periods_nonnegative_check" CHECK ("usage_periods"."ai_conversations" >= 0 AND "usage_periods"."ai_replies" >= 0 AND "usage_periods"."website_analyses" >= 0)
);
--> statement-breakpoint
CREATE TABLE "usage_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"conversation_id" uuid,
	"scope" varchar(24) NOT NULL,
	"idempotency_key" varchar(100) NOT NULL,
	"monthly_period_start" timestamp with time zone NOT NULL,
	"daily_period_start" timestamp with time zone NOT NULL,
	"counted_conversation" boolean DEFAULT false NOT NULL,
	"counted_reply" boolean DEFAULT false NOT NULL,
	"counted_website_analysis" boolean DEFAULT false NOT NULL,
	"status" varchar(24) DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_reservations_scope_check" CHECK ("usage_reservations"."scope" IN ('public', 'test', 'demo')),
	CONSTRAINT "usage_reservations_status_check" CHECK ("usage_reservations"."status" IN ('reserved', 'completed', 'released'))
);
--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_usage" ADD CONSTRAINT "conversation_usage_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_periods" ADD CONSTRAINT "usage_periods_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "usage_reservations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "usage_reservations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscriptions_profile_unique" ON "billing_subscriptions" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscriptions_customer_unique" ON "billing_subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscriptions_subscription_unique" ON "billing_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_status_period_idx" ON "billing_subscriptions" USING btree ("status","current_period_end");--> statement-breakpoint
CREATE INDEX "stripe_events_status_started_idx" ON "stripe_events" USING btree ("status","processing_started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_periods_profile_scope_period_unique" ON "usage_periods" USING btree ("profile_id","scope","period_type","period_start");--> statement-breakpoint
CREATE INDEX "usage_periods_profile_scope_end_idx" ON "usage_periods" USING btree ("profile_id","scope","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_reservations_profile_scope_key_unique" ON "usage_reservations" USING btree ("profile_id","scope","idempotency_key");--> statement-breakpoint
CREATE INDEX "usage_reservations_status_created_idx" ON "usage_reservations" USING btree ("status","created_at");