CREATE TABLE "webmcp_action_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"tool_name" varchar(48) NOT NULL,
	"input_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webmcp_confirmations_tool_check" CHECK ("webmcp_action_confirmations"."tool_name" IN ('submit_request', 'withdraw_request', 'respond_to_request'))
);
--> statement-breakpoint
ALTER TABLE "webmcp_action_confirmations" ADD CONSTRAINT "webmcp_action_confirmations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webmcp_confirmations_profile_expiry_idx" ON "webmcp_action_confirmations" USING btree ("profile_id","expires_at");