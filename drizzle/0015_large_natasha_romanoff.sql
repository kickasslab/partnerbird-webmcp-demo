CREATE TABLE "conversation_leads" (
	"conversation_id" uuid PRIMARY KEY NOT NULL,
	"person_name" varchar(120),
	"company_name" varchar(180),
	"company_description" text,
	"initial_intent" text,
	"intake_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_contacts" ADD COLUMN "auth_user_id" text;--> statement-breakpoint
ALTER TABLE "conversation_leads" ADD CONSTRAINT "conversation_leads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_leads_completed_idx" ON "conversation_leads" USING btree ("intake_completed_at","updated_at");