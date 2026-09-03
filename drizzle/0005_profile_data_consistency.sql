UPDATE "profiles"
SET "partnership_status" = 'unavailable',
    "updated_at" = now()
WHERE "is_open" = false
  AND "partnership_status" = 'open';
--> statement-breakpoint
DELETE FROM "knowledge_items" AS knowledge
USING "profile_projects" AS project
WHERE knowledge."profile_id" = project."profile_id"
  AND knowledge."type" = 'project'
  AND knowledge."visibility" = 'public'
  AND knowledge."title" = project."name"
  AND knowledge."description" = project."description"
  AND COALESCE(knowledge."url", '') = COALESCE(project."url", '')
  AND knowledge."created_at" = project."created_at"
  AND knowledge."updated_at" = project."updated_at";
