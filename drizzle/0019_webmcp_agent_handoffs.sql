CREATE TABLE "webmcp_agent_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"target_profile_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"person_name" varchar(120) NOT NULL,
	"company_name" varchar(180) NOT NULL,
	"company_description" text NOT NULL,
	"partnership_goal" text NOT NULL,
	"context_summary" text,
	"conversation_id" uuid,
	"activated_by_user_id" text,
	"activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webmcp_agent_handoffs_conversation_id_unique" UNIQUE("conversation_id"),
	CONSTRAINT "webmcp_agent_handoffs_status_check" CHECK ("webmcp_agent_handoffs"."status" IN ('pending', 'activated', 'expired')),
	CONSTRAINT "webmcp_agent_handoffs_not_self_check" CHECK ("webmcp_agent_handoffs"."creator_profile_id" <> "webmcp_agent_handoffs"."target_profile_id")
);
--> statement-breakpoint
ALTER TABLE "webmcp_agent_handoffs" ADD CONSTRAINT "webmcp_agent_handoffs_creator_profile_id_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webmcp_agent_handoffs" ADD CONSTRAINT "webmcp_agent_handoffs_target_profile_id_profiles_id_fk" FOREIGN KEY ("target_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webmcp_agent_handoffs" ADD CONSTRAINT "webmcp_agent_handoffs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webmcp_agent_handoffs_token_hash_unique" ON "webmcp_agent_handoffs" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "webmcp_agent_handoffs_creator_created_idx" ON "webmcp_agent_handoffs" USING btree ("creator_profile_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "webmcp_agent_handoffs_target_expiry_idx" ON "webmcp_agent_handoffs" USING btree ("target_profile_id","expires_at");
