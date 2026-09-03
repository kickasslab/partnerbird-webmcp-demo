ALTER TABLE "conversations" ADD COLUMN "active_turn_key" varchar(100);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "active_turn_started_at" timestamp with time zone;