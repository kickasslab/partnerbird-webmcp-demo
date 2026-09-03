CREATE TABLE "conversation_contacts" (
	"conversation_id" uuid PRIMARY KEY NOT NULL,
	"visitor_name" varchar(120) NOT NULL,
	"visitor_email" varchar(255) NOT NULL,
	"email_verified_at" timestamp with time zone,
	"resume_token_hash" varchar(64) NOT NULL,
	"resume_token_expires_at" timestamp with time zone NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"last_resume_email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_contacts" ADD CONSTRAINT "conversation_contacts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_contacts_resume_token_unique" ON "conversation_contacts" USING btree ("resume_token_hash");--> statement-breakpoint
CREATE INDEX "conversation_contacts_email_idx" ON "conversation_contacts" USING btree ("visitor_email");